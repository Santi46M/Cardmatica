"""The home section for each person: the cards they opened, and cards like them."""

from sqlalchemy import func, select

from app.models import CardView
from app.schemas.ingestion import GroupInput, NameInput, PrintingInput
from app.services import passwords
from app.services.ingestion import IngestionService

PASSWORD = "una frase larga de prueba"


def card(factory, record, number, name, archetype=None, set_name="Set Uno"):
    copy = record.model_copy(
        update={
            "konami_id": 995000 + number,
            "external_id": str(995000 + number),
            "passcode": str(99500000 + number),
            "names": [NameInput(language="en", name=name)],
            "groups": [GroupInput(name=archetype, kind="archetype")] if archetype else [],
            "printings": [
                PrintingInput(
                    code=f"SET{number}-EN001",
                    set_key=set_name,
                    set_name=set_name,
                    language="en",
                    market="TCG",
                )
            ],
        },
        deep=True,
    )
    with factory.begin() as session:
        return str(IngestionService(session).ingest(copy).id)


def test_cards_like_the_ones_a_person_opened(client, factory, record):
    seen = card(factory, record, 1, "Dragón Visto", archetype="Dragones", set_name="Set Uno")
    kin = card(factory, record, 2, "Dragón Pariente", archetype="Dragones", set_name="Set Dos")
    neighbour = card(factory, record, 3, "Vecina de Set", set_name="Set Uno")
    card(factory, record, 4, "Ajena", set_name="Set Tres")

    found = client.get("/api/v1/cards/for-you", params={"ids": seen, "market": "TCG"}).json()
    assert [row["id"] for row in found["recent"]] == [seen]
    assert [row["id"] for row in found["archetypes"]] == [kin]
    assert [row["id"] for row in found["sets"]] == [neighbour]
    # Nobody's history, nothing to show; nonsense ids are ignored.
    empty = client.get("/api/v1/cards/for-you", params={"ids": "no-es-un-id"}).json()
    assert empty == {"recent": [], "archetypes": [], "sets": []}


def test_an_account_keeps_its_latest_opened_cards(client, factory, record, settings, monkeypatch):
    # Over plain http the session cookies come back only in local mode.
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    first = card(factory, record, 11, "Primera")
    second = card(factory, record, 12, "Segunda")
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "email": "vistas@example.com",
            "password": PASSWORD,
            "display_name": "Vera",
            "accept_terms": True,
            "confirm_adult": True,
        },
    )
    assert registered.status_code == 201, registered.text
    client.headers["X-CSRF-Token"] = client.cookies.get("cm_csrf")
    saved = client.put("/api/v1/account/viewed", json={"card_ids": [first]})
    assert saved.json() == {"card_ids": [first]}
    # The newest goes on top; an unknown card is skipped.
    unknown = "00000000-0000-0000-0000-000000000000"
    client.put("/api/v1/account/viewed", json={"card_ids": [second, unknown]})
    assert client.get("/api/v1/account/viewed").json() == {"card_ids": [second, first]}
    exported = client.get("/api/v1/account/export").json()
    assert exported["viewed_cards"] == [second, first]
    # They go with the account.
    gone = client.post("/api/v1/account/delete", json={"password": PASSWORD})
    assert gone.status_code == 204
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(CardView)) == 0
    assert client.get("/api/v1/account/viewed").status_code == 401
