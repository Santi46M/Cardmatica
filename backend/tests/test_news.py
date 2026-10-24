"""News for the home page: bundled ones, and those an administrator adds."""

from app.services import news


def test_bundled_news_by_section_and_newest_first(client, factory):
    with factory.begin() as session:
        imported = news.import_bundled(session)
    # Importing again changes nothing.
    with factory.begin() as session:
        assert news.import_bundled(session) == imported
    data = client.get("/api/v1/news", params={"limit": 2}).json()
    # Site news come from the repository (news_feeds); the bundled ones are the game's.
    assert data["site"] == [] and len(data["yugioh"]) == 2
    dates = [item["published_on"] for item in data["yugioh"]]
    assert dates == sorted(dates, reverse=True)
    # News about the game say where they come from.
    assert all(
        item["url"].startswith("https://") and item["source_name"] for item in data["yugioh"]
    )
    assert client.get("/api/v1/news").headers["Cache-Control"] == "public, max-age=60"


def test_administrators_add_and_remove_news(client, settings):
    admin = {"Authorization": f"Bearer {settings.admin_token}"}
    site = {
        "section": "site",
        "title": "Nueva función",
        "summary": "Algo nuevo.",
        "published_on": "2026-10-24",
    }
    assert client.post("/api/v1/admin/news", json=site).status_code == 401
    created = client.post("/api/v1/admin/news", json=site, headers=admin)
    assert created.status_code == 201
    game = {**site, "section": "yugioh"}
    refused = client.post("/api/v1/admin/news", json=game, headers=admin)
    assert refused.status_code == 422 and "fuente" in refused.text
    sourced = {**game, "url": "https://www.yugioh-card.com/en/", "source_name": "Konami"}
    assert client.post("/api/v1/admin/news", json=sourced, headers=admin).status_code == 201
    assert [item["title"] for item in client.get("/api/v1/news").json()["site"]] == [
        "Nueva función"
    ]
    news_id = created.json()["id"]
    assert client.delete(f"/api/v1/admin/news/{news_id}", headers=admin).status_code == 204
    assert client.get("/api/v1/news").json()["site"] == []
