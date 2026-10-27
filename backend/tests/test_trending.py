"""Cards in fashion, each list from real catalogue data (app/services/trending.py)."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Card, CardPrinting, PriceObservation
from app.models.accounts import User, Wantlist, WantlistItem
from app.schemas.ingestion import PrintingInput
from app.services.banlists import BanlistFile, import_banlist
from app.services.ingestion import IngestionService

TODAY = date(2026, 10, 24)


def printing(code, set_name, released, rarity="Common"):
    return PrintingInput(
        code=code,
        set_key=set_name,
        set_name=set_name,
        rarity=rarity,
        language="en",
        market="TCG",
        set_release_date=released,
    )


def banlist(effective, **statuses):
    return BanlistFile(
        format="TCG",
        effective_date=effective,
        complete=True,
        source_name="Lista sintética de prueba",
        source_url="https://www.yugioh-card.com/en/limited/",
        retrieved_on=effective,
        **statuses,
    )


def lists(client):
    data = client.get("/api/v1/trending", params={"market": "TCG"}).json()["lists"]
    return {entry["key"]: entry["items"] for entry in data}


def test_each_list_comes_from_catalogue_data(client, factory, record, monkeypatch):
    import app.services.trending as trending

    monkeypatch.setattr(
        trending, "date", type("FixedDate", (date,), {"today": staticmethod(lambda: TODAY)})
    )
    # An old card reprinted this year, in a high rarity.
    record.printings = [
        printing("OLD-EN001", "Old Set", date(2010, 5, 1)),
        printing("NEW-EN001", "New Set", date(2026, 9, 1), rarity="Quarter Century Secret Rare"),
    ]
    with factory.begin() as session:
        IngestionService(session).ingest(record)
        card = session.scalar(select(Card))
        # Forbidden last list, Limited now: it comes back.
        import_banlist(session, banlist(date(2026, 4, 1), forbidden=["Synthetic Test Dragon"]))
        import_banlist(session, banlist(date(2026, 10, 1), limited=["Synthetic Test Dragon"]))
        # Three sales at 10 and the last one at 8: 20 % below the usual price.
        sold = session.scalars(select(CardPrinting)).first()
        start = datetime(2026, 9, 1, tzinfo=timezone.utc)
        for day, price in enumerate(["10", "10", "10", "8"]):
            session.add(
                PriceObservation(
                    printing_id=sold.id,
                    price=Decimal(price),
                    currency="EUR",
                    quantity=1,
                    observed_at=start + timedelta(days=day),
                )
            )
        # Two people want it.
        for index in range(2):
            user = User(
                email=f"persona{index}@example.com",
                display_name=f"Persona {index}",
                password_hash="x",
                terms_accepted_at=start,
            )
            session.add(user)
            session.flush()
            wanted = Wantlist(user_id=user.id, client_id=f"l{index}", name="Mazo")
            wanted.items.append(
                WantlistItem(
                    client_id=f"i{index}", card_id=card.id, market="TCG", quantity=1, added_at=start
                )
            )
            session.add(wanted)
    found = lists(client)
    assert set(found) == {
        "price_drops",
        "back_in_play",
        "most_wanted",
        "reprints",
        "notable_printings",
    }
    drop = found["price_drops"][0]["reason"]
    assert (drop["from"], drop["to"], round(drop["drop"], 2)) == ("10.00", "8.00", 0.2)
    assert found["back_in_play"][0]["reason"] == {
        "from": "forbidden",
        "to": "limited",
        "since": "2026-10-01",
    }
    assert found["most_wanted"][0]["reason"] == {"lists": 2}
    assert found["reprints"][0]["reason"]["years"] == 16
    notable = found["notable_printings"][0]["reason"]
    assert (notable["rarity"], notable["set_name"]) == ("Quarter Century Secret Rare", "New Set")
    assert found["notable_printings"][0]["card"]["name"] == "Synthetic Test Dragon"


def test_lists_without_data_are_left_out(client, factory, record):
    with factory.begin() as session:
        IngestionService(session).ingest(record)
    # One printing, no sales, no lists, one banlist: nothing is in fashion.
    assert lists(client) == {}
