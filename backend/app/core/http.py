"""Resilient outbound HTTP: timeouts, retry with exponential backoff, per-provider
circuit breaker and health metrics (kept in Redis so api + worker share them)."""

import logging
import random
import statistics
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import redis

from app.core.config import get_settings
from app.core.redis import get_redis

log = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class ProviderError(Exception):
    def __init__(self, provider: str, message: str, status_code: int | None = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.status_code = status_code


class CircuitOpenError(ProviderError):
    pass


@dataclass
class CircuitBreaker:
    failure_threshold: int = 5
    reset_after_s: float = 60.0
    failures: int = 0
    opened_at: float | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def state(self) -> str:
        if self.opened_at is None:
            return "closed"
        if time.monotonic() - self.opened_at >= self.reset_after_s:
            return "half_open"
        return "open"

    def allow(self) -> bool:
        return self.state != "open"

    def record_success(self) -> None:
        with self.lock:
            self.failures = 0
            self.opened_at = None

    def record_failure(self) -> None:
        with self.lock:
            self.failures += 1
            if self.failures >= self.failure_threshold or self.state == "half_open":
                self.opened_at = time.monotonic()


_breakers: dict[str, CircuitBreaker] = {}


def breaker_for(provider: str) -> CircuitBreaker:
    return _breakers.setdefault(provider, CircuitBreaker())


def reset_breakers() -> None:
    _breakers.clear()


def _record_health(provider: str, ok: bool, latency_ms: float, error: str | None) -> None:
    key = f"provider_health:{provider}"
    now = datetime.now(UTC).isoformat()
    try:
        r = get_redis()
        pipe = r.pipeline()
        pipe.hincrby(key, "calls", 1)
        if ok:
            pipe.hset(key, "last_success_at", now)
        else:
            pipe.hincrby(key, "errors", 1)
            pipe.hset(key, mapping={"last_error_at": now, "last_error": (error or "")[:500]})
        pipe.lpush(f"{key}:latency", round(latency_ms, 1))
        pipe.ltrim(f"{key}:latency", 0, 99)
        pipe.execute()
    except redis.RedisError:
        pass


def provider_health_snapshot(provider: str) -> dict[str, Any]:
    key = f"provider_health:{provider}"
    try:
        r = get_redis()
        data = r.hgetall(key)
        lat = [float(x) for x in r.lrange(f"{key}:latency", 0, 99)]
    except redis.RedisError:
        data, lat = {}, []
    calls = int(data.get("calls", 0))
    errors = int(data.get("errors", 0))
    return {
        "provider": provider,
        "calls": calls,
        "errors": errors,
        "error_rate": round(errors / calls, 3) if calls else None,
        "p50_latency_ms": statistics.median(lat) if lat else None,
        "last_success_at": data.get("last_success_at"),
        "last_error_at": data.get("last_error_at"),
        "last_error": data.get("last_error"),
        "circuit_state": breaker_for(provider).state,
    }


class ResilientClient:
    def __init__(self, provider: str, *, retries: int = 3, backoff_base_s: float = 0.5,
                 timeout_s: float | None = None, client: httpx.Client | None = None):
        settings = get_settings()
        self.provider = provider
        self.retries = retries
        self.backoff_base_s = backoff_base_s
        self._client = client or httpx.Client(
            timeout=timeout_s or settings.http_timeout_s,
            headers={"User-Agent": settings.http_user_agent},
        )

    def get_json(self, url: str, params: dict[str, Any] | list[tuple[str, Any]] | None = None) -> Any:
        breaker = breaker_for(self.provider)
        if not breaker.allow():
            raise CircuitOpenError(self.provider, "circuit open; provider temporarily disabled")
        last_exc: Exception | None = None
        for attempt in range(self.retries):
            start = time.perf_counter()
            try:
                resp = self._client.get(url, params=params)
                latency = (time.perf_counter() - start) * 1000
                if resp.status_code in RETRYABLE_STATUS:
                    raise ProviderError(self.provider, f"HTTP {resp.status_code}", resp.status_code)
                if resp.status_code >= 400:
                    # Client errors are not retried and don't trip the breaker.
                    _record_health(self.provider, False, latency, f"HTTP {resp.status_code}")
                    raise ProviderError(self.provider, f"HTTP {resp.status_code}: {resp.text[:200]}",
                                        resp.status_code)
                data = resp.json()
                breaker.record_success()
                _record_health(self.provider, True, latency, None)
                return data
            except ProviderError as exc:
                if exc.status_code is not None and exc.status_code not in RETRYABLE_STATUS:
                    raise
                last_exc = exc
            except (httpx.HTTPError, ValueError) as exc:
                last_exc = exc
            latency = (time.perf_counter() - start) * 1000
            _record_health(self.provider, False, latency, str(last_exc))
            log.warning("provider call failed", extra={"provider": self.provider, "attempt": attempt + 1,
                                                       "error": str(last_exc)})
            if attempt < self.retries - 1 and self.backoff_base_s > 0:
                time.sleep(self.backoff_base_s * (2**attempt) + random.uniform(0, 0.1))
        breaker.record_failure()
        raise ProviderError(self.provider, f"failed after {self.retries} attempts: {last_exc}")
