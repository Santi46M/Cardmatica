"""Anonymous usage counts."""

from sqlalchemy import select

from app.models import UsageCount
from app.services import accounts


def test_events_are_counted_per_day_without_personal_data(client, factory, settings):
    accounts.limiter.clear()
    for key in ["tab:Todas", "tab:Todas", "carta"]:
        assert client.post("/api/v1/analytics/event", json={"key": key}).status_code == 204
    assert client.post("/api/v1/analytics/event", json={"key": "otra cosa"}).status_code == 422
    assert client.post("/api/v1/analytics/event", json={"key": "inventado"}).status_code == 422
    with factory() as session:
        counts = {row.key: row.count for row in session.scalars(select(UsageCount))}
    assert counts == {"tab:Todas": 2, "carta": 1}
    overview = client.get(
        "/api/v1/admin/overview", headers={"Authorization": f"Bearer {settings.admin_token}"}
    ).json()
    assert overview["top_pages"][0] == {"key": "tab:Todas", "count": 2}


def test_counts_can_be_turned_off(client, factory, settings, monkeypatch):
    monkeypatch.setattr(settings, "analytics_enabled", False)
    accounts.limiter.clear()
    assert client.post("/api/v1/analytics/event", json={"key": "carta"}).status_code == 204
    with factory() as session:
        assert session.scalar(select(UsageCount)) is None
