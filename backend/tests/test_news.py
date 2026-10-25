"""News for the home page in each language, and those an administrator adds."""

from datetime import date

from app.services import news


def game_news(factory, language, day, title):
    with factory.begin() as session:
        news.add(
            session,
            news.NewsInput(
                section="yugioh",
                language=language,
                title=title,
                summary="Resumen de la fuente.",
                url=f"https://news.example.org/{language}/{day}",
                source_name="Fuente",
                published_on=date(2026, 10, day),
            ),
        )


def test_news_in_the_visitors_language_then_the_others(client, factory):
    game_news(factory, "es", 20, "Noticia en español")
    game_news(factory, "pt", 21, "Notícia em português")
    game_news(factory, "en", 22, "News in English")
    game_news(factory, "pt", 19, "Outra notícia")

    def titles(lang, limit=4):
        return [
            item["title"]
            for item in client.get("/api/v1/news", params={"lang": lang, "limit": limit}).json()[
                "yugioh"
            ]
        ]

    # Their language first, newest first; then Spanish, Portuguese, English.
    assert titles("pt") == [
        "Notícia em português",
        "Outra notícia",
        "Noticia en español",
        "News in English",
    ]
    assert titles("en", 2) == ["News in English", "Noticia en español"]
    assert titles("es", 1) == ["Noticia en español"]
    assert client.get("/api/v1/news", params={"lang": "fr"}).status_code == 422
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
