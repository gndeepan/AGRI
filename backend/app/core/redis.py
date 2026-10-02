import json
from typing import Any

import redis

from app.core.config import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def set_redis(client: redis.Redis | None) -> None:
    """Override the client (tests use fakeredis)."""
    global _client
    _client = client


def cache_get_json(key: str) -> Any | None:
    try:
        raw = get_redis().get(key)
    except redis.RedisError:
        return None
    return json.loads(raw) if raw else None


def cache_set_json(key: str, value: Any, ttl_s: int) -> None:
    try:
        get_redis().set(key, json.dumps(value, default=str), ex=ttl_s)
    except redis.RedisError:
        pass
