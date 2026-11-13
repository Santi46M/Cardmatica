"""What moderators and administrators may do, and the record they leave."""

import pytest
from sqlalchemy import select

from app.models import StaffAction, User, UserProfile
from app.services import accounts, passwords, test_accounts

PASSWORD = "dragon blanco de ojos azules"
PEOPLE = {
    "admin@example.com": "admin",
    "mod@example.com": "moderator",
    "otra-mod@example.com": "moderator",
    "tienda@example.com": "user",
    "ana@example.com": "user",
}


@pytest.fixture
def client(client, settings, monkeypatch, factory):
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(passwords, "SCRYPT_P", 1)
    accounts.limiter.clear()
    for email in PEOPLE:
        client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "display_name": email.split("@")[0],
                "accept_terms": True,
                "confirm_adult": True,
            },
        )
    with factory.begin() as session:
        for user in session.scalars(select(User)):
            user.role = PEOPLE[user.email]
            if user.email == "tienda@example.com":
                session.add(
                    UserProfile(user_id=user.id, account_role="seller", store_name="La Tienda")
                )
    client.cookies.clear()
    return client


def sign_in(client, email, password=PASSWORD):
    client.cookies.clear()
    answer = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    client.headers["X-CSRF-Token"] = client.cookies.get("cm_csrf") or ""
    return answer


def ids(client):
    rows = client.get("/api/v1/admin/users", params={"page_size": 100}).json()["items"]
    return {row["email"]: row for row in rows}


def test_a_moderator_sees_the_panel_but_not_everything(client):
    sign_in(client, "mod@example.com")
    assert client.get("/api/v1/admin/overview").json()["sellers"] == 1
    people = ids(client)
    assert people["tienda@example.com"]["account_type"] == "seller"
    assert people["tienda@example.com"]["store_name"] == "La Tienda"
    # Searching finds a store by its name; the filters narrow the list.
    found = client.get("/api/v1/admin/users", params={"q": "tienda"}).json()["items"]
    assert [row["email"] for row in found] == ["tienda@example.com"]
    sellers = client.get("/api/v1/admin/users", params={"kind": "seller"}).json()["items"]
    assert [row["email"] for row in sellers] == ["tienda@example.com"]
    moderators = client.get("/api/v1/admin/users", params={"role": "moderator"}).json()
    assert moderators["total"] == 2
    # Only an administrator gives roles, deletes, or runs the catalogue.
    ana = people["ana@example.com"]["id"]
    refused = client.post(f"/api/v1/admin/users/{ana}/role", json={"role": "admin"})
    assert refused.status_code == 403
    assert refused.json()["error"]["message"] == "Solo un administrador puede hacer esto"
    assert client.delete(f"/api/v1/admin/users/{ana}").status_code == 403
    assert client.get("/api/v1/admin/sync-jobs").status_code == 403
    assert client.get("/api/v1/admin/actions").status_code == 403
    # A plain account does not get in at all.
    sign_in(client, "ana@example.com")
    assert client.get("/api/v1/admin/overview").status_code == 403


def test_blocking_an_account_signs_it_out_and_keeps_it_out(client):
    sign_in(client, "ana@example.com")
    ana_cookies = dict(client.cookies)
    sign_in(client, "mod@example.com")
    ana = ids(client)["ana@example.com"]["id"]
    blocked = client.post(
        f"/api/v1/admin/users/{ana}/block", json={"blocked": True, "reason": "spam"}
    )
    assert blocked.json() == {"id": ana, "blocked": True}
    assert ids(client)["ana@example.com"]["blocked"] is True
    # Her open session stopped working, and she cannot sign in again.
    moderator_cookies = dict(client.cookies)
    client.cookies.clear()
    client.cookies.update(ana_cookies)
    assert client.get("/api/v1/auth/me").status_code == 401
    refused = sign_in(client, "ana@example.com")
    assert "bloqueada" in refused.json()["error"]["message"]
    # With a wrong password the answer says nothing about the block.
    wrong = sign_in(client, "ana@example.com", "otra cosa cualquiera")
    assert "bloqueada" not in wrong.json()["error"]["message"]
    # Unblocked, she is back.
    client.cookies.clear()
    client.cookies.update(moderator_cookies)
    client.headers["X-CSRF-Token"] = moderator_cookies["cm_csrf"]
    client.post(f"/api/v1/admin/users/{ana}/block", json={"blocked": False})
    assert sign_in(client, "ana@example.com").status_code == 200


def test_moderators_cannot_touch_the_staff_nor_anyone_themselves(client):
    sign_in(client, "mod@example.com")
    people = ids(client)
    for email in ["admin@example.com", "otra-mod@example.com"]:
        answer = client.post(
            f"/api/v1/admin/users/{people[email]['id']}/block", json={"blocked": True}
        )
        assert answer.status_code == 403
    own = client.post(
        f"/api/v1/admin/users/{people['mod@example.com']['id']}/block", json={"blocked": True}
    )
    assert own.status_code == 409
    # An administrator can act on a moderator.
    sign_in(client, "admin@example.com")
    moderator = people["otra-mod@example.com"]["id"]
    blocked = client.post(f"/api/v1/admin/users/{moderator}/block", json={"blocked": True})
    assert blocked.status_code == 200


def test_the_staff_confirms_emails_and_the_admin_deletes_accounts(client, factory):
    sign_in(client, "mod@example.com")
    people = ids(client)
    ana = people["ana@example.com"]["id"]
    assert people["ana@example.com"]["email_verified"] is False
    client.post(f"/api/v1/admin/users/{ana}/verify-email")
    assert ids(client)["ana@example.com"]["email_verified"] is True
    sign_in(client, "admin@example.com")
    ended = client.post(f"/api/v1/admin/users/{ana}/sign-out").json()
    assert ended["sessions_ended"] >= 0
    assert client.delete(f"/api/v1/admin/users/{ana}").status_code == 204
    assert "ana@example.com" not in ids(client)
    # The record says who did what, and still reads with the account gone,
    # without its email.
    gone = f"Cuenta borrada ({ana[:8]})"
    record = client.get("/api/v1/admin/actions").json()
    assert [(row["actor"], row["action"], row["target"]) for row in record] == [
        ("admin@example.com", "delete", gone),
        ("admin@example.com", "sign_out", gone),
        ("mod@example.com", "verify_email", gone),
    ]
    assert "ana@example.com" not in str(record)
    with factory() as session:
        assert session.scalar(select(StaffAction).where(StaffAction.action == "delete"))


def test_test_accounts_one_of_each_kind_with_fresh_passwords(client, factory):
    with factory.begin() as session:
        first = {row["email"]: row for row in test_accounts.create(session, "example.org")}
    assert {(row["role"], row["type"]) for row in first.values()} == {
        ("admin", "buyer"),
        ("moderator", "buyer"),
        ("user", "seller"),
        ("user", "buyer"),
    }
    seller = "prueba-vendedor@example.org"
    assert sign_in(client, seller, first[seller]["password"]).status_code == 200
    # Running it again changes every password; the old one stops working.
    with factory.begin() as session:
        second = {row["email"]: row for row in test_accounts.create(session, "example.org")}
    assert sign_in(client, seller, first[seller]["password"]).status_code == 401
    assert sign_in(client, seller, second[seller]["password"]).status_code == 200
    sign_in(client, "prueba-admin@example.org", second["prueba-admin@example.org"]["password"])
    people = ids(client)
    assert people[seller]["store_name"] == "Tienda de prueba"
    assert people[seller]["email_verified"] is True
