import time

import redis
from fastapi import Request

from app.core.errors import AppError
from app.core.redis import get_redis


class RateLimit:
    """Fixed-window limiter keyed by client IP and route scope. Fails open if Redis is down."""

    def __init__(self, scope: str, limit: int, window_s: int):
        self.scope, self.limit, self.window_s = scope, limit, window_s

    def __call__(self, request: Request) -> None:
        client = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else "unknown"
        )
        window = int(time.time() // self.window_s)
        key = f"rl:{self.scope}:{client}:{window}"
        try:
            r = get_redis()
            count = r.incr(key)
            if count == 1:
                r.expire(key, self.window_s)
        except redis.RedisError:
            return
        if count > self.limit:
            raise AppError(429, "Too many requests, please slow down.", "rate_limited")
