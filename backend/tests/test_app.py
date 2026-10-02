"""App-level tests that need no database."""

from datetime import timedelta

import jwt
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.main import app

client = TestClient(app)


def test_password_hashing():
    h = hash_password("correct horse battery")
    assert h != "correct horse battery" and verify_password("correct horse battery", h)
    assert not verify_password("wrong", h) and not verify_password("x", "not-a-hash")


def test_access_token_roundtrip_and_expiry():
    import uuid
    from datetime import UTC, datetime

    uid = uuid.uuid4()
    assert decode_access_token(create_access_token(uid, "farmer"))["sub"] == str(uid)
    expired = jwt.encode({"sub": str(uid), "typ": "access", "exp": datetime.now(UTC) - timedelta(minutes=1)},
                         get_settings().secret_key, algorithm="HS256")
    assert decode_access_token(expired) is None
    forged = jwt.encode({"sub": str(uid), "typ": "access"}, "other-key", algorithm="HS256")
    assert decode_access_token(forged) is None


def test_csrf_header_required_for_mutations():
    r = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"})
    assert r.status_code == 403 and r.json()["code"] == "csrf"


def test_protected_routes_require_auth():
    for path in ("/api/v1/lands", "/api/v1/dashboard", "/api/v1/cycles", "/api/v1/auth/me"):
        r = client.get(path)
        assert r.status_code == 401, path


def test_openapi_lists_contract_paths():
    paths = client.get("/api/v1/openapi.json").json()["paths"]
    for p in ("/api/v1/auth/register", "/api/v1/lands/{land_id}/weather", "/api/v1/cycles/{cycle_id}/timeline",
              "/api/v1/assistant/actions/confirm", "/api/v1/admin/providers", "/api/v1/geo/measure"):
        assert p in paths


def test_client_ip_ignores_values_that_are_not_ip_addresses():
    from starlette.requests import Request

    from app.core.audit import client_ip

    def req(headers: dict, host: str) -> Request:
        return Request({"type": "http", "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
                        "client": (host, 1234)})

    assert client_ip(req({}, "testclient")) is None
    assert client_ip(req({"x-forwarded-for": "not-an-ip"}, "10.0.0.1")) is None
    assert client_ip(req({"x-forwarded-for": "203.0.113.7, 10.0.0.1"}, "10.0.0.1")) == "203.0.113.7"
    assert client_ip(req({}, "192.0.2.4")) == "192.0.2.4"
    assert client_ip(None) is None
