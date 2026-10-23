"""Accounts: registration, login, lockout, CSRF and sessions."""

import pytest
from sqlalchemy import select

from app.models.accounts import User, UserSession
from app.services import accounts, passwords

PASSWORD = "dragon blanco de ojos azules"


@pytest.fixture(autouse=True)
def fast_hashing(monkeypatch, settings):
    # The test client talks plain HTTP; production cookies are Secure (HTTPS only).
    monkeypatch.setattr(settings, "deployment_mode", "local")
    # Cheaper scrypt keeps the suite fast; production parameters are unchanged.
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(passwords, "SCRYPT_P", 1)
    accounts.limiter.clear()
    yield
    accounts.limiter.clear()


def register(client, email="Ana@Example.com", password=PASSWORD, **extra):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Ana",
            "accept_terms": True,
            **extra,
        },
    )


def csrf_headers(client):
    return {"X-CSRF-Token": client.cookies.get("cm_csrf")}


def test_register_signs_in_with_safe_cookies(client, factory):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["email"] == "ana@example.com"
    cookie = response.headers.get_list("set-cookie")
    session_cookie = next(item for item in cookie if item.startswith("cm_session="))
    assert "HttpOnly" in session_cookie and "SameSite=lax" in session_cookie
    assert client.get("/api/v1/auth/me").json()["display_name"] == "Ana"
    with factory() as session:
        user = session.scalar(select(User))
        stored = session.scalar(select(UserSession))
        assert user.password_hash.startswith("scrypt$") and PASSWORD not in user.password_hash
        # Only the hash of the session token is stored.
        assert stored.token_hash != client.cookies.get("cm_session")


def test_register_rejects_weak_passwords_duplicates_and_missing_terms(client):
    assert register(client, password="corta").status_code == 400
    assert "fácil" in register(client, password="contraseña1").json()["error"]["message"]
    assert register(client, accept_terms=False).status_code == 400
    assert register(client).status_code == 201
    client.cookies.clear()
    duplicate = register(client, email="ANA@example.com")
    assert duplicate.status_code == 400 and "Ya existe" in duplicate.json()["error"]["message"]


def test_login_logout_and_csrf(client):
    register(client)
    client.cookies.clear()
    wrong = client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": "x"})
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "nadie@example.com", "password": "x"}
    )
    # The same answer whether or not the account exists.
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    ok = client.post(
        "/api/v1/auth/login",
        json={"email": "ana@example.com", "password": PASSWORD, "remember": True},
    )
    assert ok.status_code == 200
    assert "Max-Age" in next(
        item for item in ok.headers.get_list("set-cookie") if item.startswith("cm_session=")
    )
    # Without the CSRF header the change is refused.
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert client.post("/api/v1/auth/logout", headers=csrf_headers(client)).status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_requests_from_other_sites_are_refused(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ana@example.com", "password": PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


def test_account_locks_after_repeated_failures(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    register(client)
    client.cookies.clear()
    for _ in range(3):
        client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": "mal"})
    locked = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD}
    )
    assert locked.status_code == 401 and "minutos" in locked.json()["error"]["message"]


def test_attempts_per_minute_are_limited(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "auth_attempts_per_minute", 2)
    for _ in range(2):
        client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"})
    blocked = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"})
    assert blocked.status_code == 429


def test_password_change_ends_other_sessions(client, factory):
    register(client)
    other = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD}
    )
    assert other.status_code == 200
    assert len(client.get("/api/v1/auth/sessions").json()) == 2
    bad = client.post(
        "/api/v1/auth/password",
        json={"current_password": "no", "new_password": "otra clave muy larga"},
        headers=csrf_headers(client),
    )
    assert bad.status_code == 400
    changed = client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "otra clave muy larga"},
        headers=csrf_headers(client),
    )
    assert changed.status_code == 204
    sessions = client.get("/api/v1/auth/sessions").json()
    assert len(sessions) == 1 and sessions[0]["current"]


def test_production_cookies_are_secure(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "deployment_mode", "production")
    response = register(client)
    assert all("Secure" in item for item in response.headers.get_list("set-cookie"))


def test_codespace_origin_is_accepted_in_local_mode(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "local_preview_host_suffixes", [".app.github.dev"])
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nadie@example.com", "password": "x"},
        headers={"Origin": "https://demo-8000.app.github.dev"},
    )
    # Reaches the login check (401), instead of the cross-site refusal (403).
    assert response.status_code == 401


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.mail.send", lambda to, subject, body: sent.append((to, subject, body))
    )
    return sent


def link_token(body, path):
    import re

    return re.search(rf"{path}\?token=([\w-]+)", body).group(1)


def test_registration_sends_a_confirmation_link(client, outbox):
    register(client)
    to, subject, body = outbox[-1]
    assert to == "ana@example.com" and "Confirma" in subject
    assert "http://testserver/verificar?token=" in body
    token = link_token(body, "/verificar")
    assert client.get("/api/v1/auth/me").json()["email_verified"] is False
    confirmed = client.post("/api/v1/auth/confirm-email", json={"token": token})
    assert confirmed.status_code == 200 and confirmed.json()["email_verified"] is True
    # A link works once.
    assert client.post("/api/v1/auth/confirm-email", json={"token": token}).status_code == 400
    resend = client.post("/api/v1/auth/confirm-email/request", headers=csrf_headers(client))
    assert resend.status_code == 409


def test_password_reset_by_email(client, outbox):
    register(client)
    client.cookies.clear()
    unknown = client.post("/api/v1/auth/password-reset/request", json={"email": "x@example.com"})
    known = client.post("/api/v1/auth/password-reset/request", json={"email": "ANA@example.com"})
    # Same answer either way; only the real account gets a message.
    assert unknown.json() == known.json() and known.status_code == 202
    assert len([mail for mail in outbox if "Restablecer" in mail[1]]) == 1
    token = link_token(outbox[-1][2], "/restablecer")
    weak = client.post(
        "/api/v1/auth/password-reset", json={"token": token, "new_password": "corta"}
    )
    assert weak.status_code == 400
    done = client.post(
        "/api/v1/auth/password-reset",
        json={"token": token, "new_password": "una clave nueva larga"},
    )
    assert done.status_code == 204
    old = client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert old.status_code == 401
    new = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "una clave nueva larga"}
    )
    assert new.status_code == 200 and new.json()["email_verified"] is True


def test_a_failing_mail_server_does_not_block_registration(client, monkeypatch):
    def broken(*args):
        raise ConnectionRefusedError

    monkeypatch.setattr("app.services.mail.send", broken)
    assert register(client).status_code == 201
