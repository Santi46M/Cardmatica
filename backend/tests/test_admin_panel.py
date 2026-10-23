"""Administration through an admin account's session."""

import pytest
from sqlalchemy import select

from app.models import User
from app.services import accounts, passwords

PASSWORD = "dragon blanco de ojos azules"


@pytest.fixture
def people(client, settings, monkeypatch, factory):
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(passwords, "SCRYPT_P", 1)
    accounts.limiter.clear()
    for email in ["admin@example.com", "ana@example.com"]:
        client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "display_name": email[:3],
                "accept_terms": True,
            },
        )
    with factory.begin() as session:
        session.scalar(select(User).where(User.email == "admin@example.com")).role = "admin"
    return client


def sign_in(client, email):
    client.cookies.clear()
    client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    client.headers["X-CSRF-Token"] = client.cookies.get("cm_csrf")


def test_only_admin_accounts_reach_the_panel(people):
    client = people
    client.cookies.clear()
    assert client.get("/api/v1/admin/overview").status_code == 401
    sign_in(client, "ana@example.com")
    assert client.get("/api/v1/admin/overview").status_code == 403
    sign_in(client, "admin@example.com")
    overview = client.get("/api/v1/admin/overview").json()
    assert overview["users"] == 2 and overview["cards"] == 0
    found = client.get("/api/v1/admin/users", params={"q": "ana"}).json()
    assert found["total"] == 1 and found["items"][0]["role"] == "user"


def test_admin_changes_roles_but_not_their_own(people, factory):
    client = people
    sign_in(client, "admin@example.com")
    users = {
        item["email"]: item["id"] for item in client.get("/api/v1/admin/users").json()["items"]
    }
    promoted = client.post(
        f"/api/v1/admin/users/{users['ana@example.com']}/role", json={"role": "moderator"}
    )
    assert promoted.json()["role"] == "moderator"
    own = client.post(
        f"/api/v1/admin/users/{users['admin@example.com']}/role", json={"role": "user"}
    )
    assert own.status_code == 409
    # Changes from a session need the CSRF token.
    del client.headers["X-CSRF-Token"]
    blocked = client.post(
        f"/api/v1/admin/users/{users['ana@example.com']}/role", json={"role": "user"}
    )
    assert blocked.status_code == 403


def test_token_still_works_for_scripts(client, settings):
    headers = {"Authorization": f"Bearer {settings.admin_token}"}
    assert client.get("/api/v1/admin/sync-jobs", headers=headers).status_code == 200
    assert (
        client.get("/api/v1/admin/overview", headers={"Authorization": "Bearer mal"}).status_code
        == 401
    )
