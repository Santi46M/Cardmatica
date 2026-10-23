"""Profile, preferences and wantlists saved with the account."""

import pytest
from sqlalchemy import select

from app.models import Card, CardPrinting
from app.services import accounts, passwords
from app.services.ingestion import IngestionService

PASSWORD = "dragon blanco de ojos azules"


@pytest.fixture
def signed_in(client, settings, monkeypatch, factory, record):
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(passwords, "SCRYPT_P", 1)
    accounts.limiter.clear()
    with factory.begin() as session:
        IngestionService(session).ingest(record)
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "ana@example.com",
            "password": PASSWORD,
            "display_name": "Ana",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201
    client.headers["X-CSRF-Token"] = client.cookies.get("cm_csrf")
    with factory() as session:
        card = session.scalar(select(Card))
        printing = session.scalar(select(CardPrinting))
    return client, card.id, printing.id


PROFILE = {
    "role": "seller",
    "name": "Ana Pérez",
    "store": "Duelos del Sur",
    "country": "Uruguay",
    "address": "Av. Siempre Viva 742",
    "phone": "+598 99 123 456",
    "payments": ["Mercado Pago", "PIX"],
}


def test_profile_and_preferences_round_trip(signed_in):
    client, _, _ = signed_in
    empty = client.get("/api/v1/account").json()
    assert empty == {
        "profile": None,
        "preferences": {"currency": None, "market": None, "view": None},
    }
    assert client.put("/api/v1/account/profile", json=PROFILE).status_code == 204
    assert client.put("/api/v1/account/preferences", json={"currency": "BRL"}).status_code == 204
    assert client.put("/api/v1/account/preferences", json={"view": "grid"}).status_code == 204
    data = client.get("/api/v1/account").json()
    assert data["profile"]["store"] == "Duelos del Sur"
    assert data["preferences"] == {"currency": "BRL", "market": None, "view": "grid"}


def test_profile_rules_match_the_form(signed_in):
    client, _, _ = signed_in
    assert client.put("/api/v1/account/profile", json={**PROFILE, "store": ""}).status_code == 422
    assert (
        client.put("/api/v1/account/profile", json={**PROFILE, "phone": "12-34"}).status_code == 422
    )
    assert (
        client.put("/api/v1/account/profile", json={**PROFILE, "payments": ["Bitcoin"]}).status_code
        == 422
    )


def test_wantlists_are_stored_and_described_from_the_catalogue(signed_in):
    client, card_id, printing_id = signed_in
    document = {
        "active": "l2",
        "lists": [
            {"id": "l1", "name": "Mazo", "items": []},
            {
                "id": "l2",
                "name": "Coleccion",
                "items": [
                    {
                        "id": "i1",
                        "cardId": str(card_id),
                        "printingId": str(printing_id),
                        "market": "TCG",
                        "language": "EN",
                        "quantity": 3,
                        "alert": {"amount": "12.50", "currency": "EUR"},
                        # The page's copy of the name is ignored: the catalogue wins.
                        "name": "Otro nombre",
                    }
                ],
            },
        ],
    }
    saved = client.put("/api/v1/account/wantlists", json=document)
    assert saved.status_code == 200
    data = client.get("/api/v1/account/wantlists").json()
    assert data["active"] == "l2" and [entry["id"] for entry in data["lists"]] == ["l1", "l2"]
    item = data["lists"][1]["items"][0]
    assert item["name"] == "Synthetic Test Dragon" and item["code"] == "TST-EN001"
    assert item["quantity"] == 3 and item["alert"] == {"amount": "12.50", "currency": "EUR"}
    # Saving again replaces the lists.
    client.put("/api/v1/account/wantlists", json={"lists": [], "active": None})
    assert client.get("/api/v1/account/wantlists").json()["lists"] == []


def test_wantlists_refuse_unknown_cards_and_other_sites(signed_in):
    client, _, _ = signed_in
    unknown = {
        "lists": [
            {
                "id": "l1",
                "name": "Mazo",
                "items": [
                    {"id": "i1", "cardId": "00000000-0000-0000-0000-000000000000", "market": "TCG"}
                ],
            }
        ]
    }
    assert client.put("/api/v1/account/wantlists", json=unknown).status_code == 400
    blocked = client.put(
        "/api/v1/account/wantlists", json={"lists": []}, headers={"X-CSRF-Token": "otro"}
    )
    assert blocked.status_code == 403


def test_account_data_needs_a_session(client):
    assert client.get("/api/v1/account").status_code == 401
    assert client.get("/api/v1/account/wantlists").status_code == 401
