"""Lightweight in-memory rate limiter (single-node).

Used to throttle auth endpoints against brute force. For multi-node
deployments, swap the in-process store for Redis behind the same dependency
interface — call sites won't change.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def rate_limit(max_attempts: int, window_seconds: int, scope: str):
    """Return a FastAPI dependency enforcing `max_attempts` per `window_seconds` per client IP."""

    def _dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        ip = request.client.host if request.client else "unknown"
        key = f"{scope}:{ip}"
        now = time.monotonic()
        with _lock:
            bucket = _hits[key]
            cutoff = now - window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= max_attempts:
                retry = int(bucket[0] + window_seconds - now) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please slow down and try again shortly.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            bucket.append(now)

    return _dependency
