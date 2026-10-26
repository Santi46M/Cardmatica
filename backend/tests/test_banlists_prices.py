from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.models import BanlistListEntry
from app.services.banlists import BanlistFile, bundled_files, import_banlist, load_file
from app.services.ingestion import IngestionService


def seed(factory, record):
    with factory.begin() as session:
        return IngestionService(session).ingest(record).id


def synthetic_list(market="TCG", **changes):
    """Synthetic lists only: the bundled files are checked separately."""
    values = {
        "format": market,
        "effective_date": date(2026, 1, 1),
        "complete": True,
        "source_name": "Synthetic test list",
        "source_url": "https://example.com/synthetic-list",
        "retrieved_on": date(2026, 1, 2),
        "forbidden": [],
        "limited": [],
        "semi_limited": [],
    }
    return BanlistFile.model_validate({**values, **changes})


def test_bundled_lists_are_valid_and_complete():
    files = {path.name: load_file(path) for path in bundled_files()}
    assert {"tcg-2026-10-19.json", "ocg-2026-10-01.json"} <= set(files)
    tcg = files["tcg-2026-10-19.json"]
    # Totals published by the official database for the list effective 2026-10-19.
    assert (len(tcg.forbidden), len(tcg.limited), len(tcg.semi_limited)) == (156, 92, 7)
    for data in files.values():
        assert data.complete
        assert str(data.source_url).startswith("https://")
        assert data.retrieved_on >= data.effective_date


def test_list_validation_rejects_duplicates_and_early_complete_reads():
    with pytest.raises(ValueError):
        synthetic_list(forbidden=["Synthetic Test Dragon"], limited=["synthetic  test dragon"])
    with pytest.raises(ValueError):
        synthetic_list(retrieved_on=date(2025, 12, 1))


def test_status_by_format_idempotent_import_and_late_cards(factory, client, record):
    with factory.begin() as session:
        import_banlist(session, synthetic_list("TCG", forbidden=["Synthetic Test Dragon"]))
        import_banlist(session, synthetic_list("OCG", limited=["Another Synthetic Card"]))
    # The card is synchronised after the import and still resolves by English name.
    card_id = seed(factory, record)
    with factory.begin() as session:
        summary = import_banlist(
            session, synthetic_list("TCG", forbidden=["Synthetic Test Dragon"])
        )
        assert summary["catalog_cards_on_list"] == 1
        assert session.scalar(select(func.count()).select_from(BanlistListEntry)) == 2
    detail = client.get(f"/api/v1/cards/{card_id}").json()
    statuses = {item["format"]: item for item in detail["banlist_status"]}
    assert statuses["TCG"]["status"] == "forbidden"
    assert statuses["TCG"]["max_copies"] == 0
    assert statuses["TCG"]["source_url"] == "https://example.com/synthetic-list"
    assert statuses["OCG"]["status"] == "unlimited"
    assert statuses["OCG"]["max_copies"] == 3
    # The list view carries the status for the market in view.
    (row,) = client.get("/api/v1/cards", params={"market": "TCG"}).json()["items"]
    assert row["market_banlist"]["status"] == "forbidden"
    assert client.get("/api/v1/cards").json()["items"][0]["market_banlist"] is None
    lists = client.get("/api/v1/banlists").json()
    assert {item["format"]: item["counts"] for item in lists} == {
        "TCG": {"forbidden": 1, "limited": 0, "semi_limited": 0},
        "OCG": {"forbidden": 0, "limited": 1, "semi_limited": 0},
    }


def test_future_and_incomplete_lists(factory, client, record):
    card_id = seed(factory, record)
    tomorrow = date.today() + timedelta(days=1)
    with factory.begin() as session:
        import_banlist(session, synthetic_list("TCG", complete=False))
        import_banlist(
            session,
            synthetic_list(
                "TCG",
                effective_date=tomorrow,
                retrieved_on=tomorrow,
                forbidden=["Synthetic Test Dragon"],
            ),
        )
    (status,) = client.get(f"/api/v1/cards/{card_id}").json()["banlist_status"]
    # Not in force yet; and an incomplete list cannot prove the card is unlimited.
    assert status["effective_date"] == "2026-01-01"
    assert status["status"] == "unknown"
    assert status["max_copies"] is None


def test_price_history_last_sale_and_admin_recording(factory, client, record, settings):
    card_id = seed(factory, record)
    printing_id = client.get(f"/api/v1/cards/{card_id}/printings").json()["items"][0]["id"]
    empty = client.get(f"/api/v1/cards/{card_id}/price-history").json()
    assert empty["points"] == [] and empty["last_sale"] is None
    now = datetime.now(timezone.utc)
    sale = {"printing_id": printing_id, "price": "12.50", "currency": "UYU", "condition": "NM"}
    assert client.post("/api/v1/admin/price-observations", json=sale).status_code == 401
    headers = {"Authorization": f"Bearer {settings.admin_token}"}
    for days_ago, price in ((400, "9.00"), (10, "12.50")):
        response = client.post(
            "/api/v1/admin/price-observations",
            json={
                **sale,
                "price": price,
                "observed_at": (now - timedelta(days=days_ago)).isoformat(),
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text
        assert response.json()["code"] == "TST-EN001"
    year = client.get(f"/api/v1/cards/{card_id}/price-history").json()
    assert [point["price"] for point in year["points"]] == ["12.50"]
    assert year["last_sale"]["price"] == "12.50"
    assert year["last_sale"]["condition"] == "NM"
    window = client.get(
        f"/api/v1/cards/{card_id}/price-history", params={"days": 30, "printing_id": printing_id}
    ).json()
    assert len(window["points"]) == 1
    full = client.get(f"/api/v1/cards/{card_id}/price-history", params={"days": 3650}).json()
    assert [point["price"] for point in full["points"]] == ["9.00", "12.50"]
    # Outside the window the last sale is still reported, as for cards nobody sells now.
    short = client.get(f"/api/v1/cards/{card_id}/price-history", params={"days": 1}).json()
    assert short["points"] == [] and short["last_sale"]["price"] == "12.50"
    # The light form used by wantlist alerts: only the latest matching sale.
    light = client.get(
        f"/api/v1/cards/{card_id}/price-history",
        params={"points": "false", "language": "EN", "edition": "1st"},
    ).json()
    assert light["points"] == [] and light["last_sale"]["price"] == "12.50"
    other_edition = client.get(
        f"/api/v1/cards/{card_id}/price-history",
        params={"points": "false", "edition": "Limited"},
    ).json()
    assert other_edition["last_sale"] is None
    other = client.get(f"/api/v1/cards/{card_id}/price-history", params={"market": "OCG"}).json()
    assert other["points"] == [] and other["last_sale"] is None
    # The catalogue list shows the latest sale per card for the market in view.
    (summary,) = client.get("/api/v1/cards", params={"market": "TCG"}).json()["items"]
    assert summary["last_sale"]["price"] == "12.50"
    assert summary["last_sale"]["code"] == "TST-EN001"
    assert client.get("/api/v1/cards", params={"market": "OCG"}).json()["items"] == []


def test_price_validation(factory, client, record, settings):
    card_id = seed(factory, record)
    printing_id = client.get(f"/api/v1/cards/{card_id}/printings").json()["items"][0]["id"]
    headers = {"Authorization": f"Bearer {settings.admin_token}"}
    valid = {
        "printing_id": printing_id,
        "price": "3.00",
        "currency": "EUR",
        "observed_at": datetime.now(timezone.utc).isoformat(),
    }
    for change in (
        {"currency": "JPY"},
        {"price": "0"},
        {"price": "1.234"},
        {"observed_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()},
        {"observed_at": "2026-01-01T10:00:00"},
        {"condition": "BAD"},
    ):
        response = client.post(
            "/api/v1/admin/price-observations", json={**valid, **change}, headers=headers
        )
        assert response.status_code == 422, change
    missing = client.post(
        "/api/v1/admin/price-observations",
        json={**valid, "printing_id": str(uuid4())},
        headers=headers,
    )
    assert missing.status_code == 404
    for parameters in ({"days": 0}, {"days": 4000}, {"market": "other"}):
        response = client.get(f"/api/v1/cards/{card_id}/price-history", params=parameters)
        assert response.status_code == 422
    assert client.get(f"/api/v1/cards/{uuid4()}/price-history").status_code == 404
