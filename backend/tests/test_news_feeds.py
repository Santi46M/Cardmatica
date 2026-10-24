"""News brought from their sources: synthetic feeds and GitHub answers only."""

from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.integrations.http import AccessDenied, PoliteHttpClient
from app.models import NewsItem
from app.services import news, news_feeds

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Blog</title>
<item><title>Regional &amp; YCS</title><link>https://blog.example.org/ycs</link>
<pubDate>Fri, 23 Oct 2026 18:00:00 +0000</pubDate>
<description>&lt;p&gt;Coverage &lt;b&gt;live&lt;/b&gt; from the event.&lt;/p&gt;</description></item>
<item><title>Insecure</title><link>http://blog.example.org/plain</link>
<pubDate>Fri, 23 Oct 2026 18:00:00 +0000</pubDate></item>
<item><title>Undated</title><link>https://blog.example.org/undated</link></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Org</title>
<entry><title>New set revealed</title>
<link rel="alternate" href="https://org.example.org/set"/>
<link rel="replies" href="https://org.example.org/set#comments"/>
<published>2026-10-22T09:30:00Z</published>
<summary>A new booster with 60 cards.</summary></entry>
</feed>"""

PULLS = [
    {
        "title": "Noticias que se actualizan solas (#30)",
        "html_url": "https://github.com/santapepsi/Cardmatica/pull/30",
        "merged_at": "2026-10-24T12:00:00Z",
        "user": {"type": "User"},
        "body": "Las noticias del inicio llegan de sus **fuentes**.\n\n## Detalles\nPara devs.",
    },
    {
        "title": "CI: caché de dependencias",
        "html_url": "https://github.com/santapepsi/Cardmatica/pull/31",
        "merged_at": "2026-10-24T13:00:00Z",
        "user": {"type": "User"},
    },
    {
        "title": "Bump httpx",
        "html_url": "https://github.com/santapepsi/Cardmatica/pull/32",
        "merged_at": "2026-10-24T13:00:00Z",
        "user": {"type": "Bot"},
    },
    {
        "title": "Cerrada sin unir",
        "html_url": "https://github.com/santapepsi/Cardmatica/pull/33",
        "merged_at": None,
        "user": {"type": "User"},
    },
]


def test_rss_and_atom_entries_with_https_links_and_dates():
    [entry] = news_feeds.parse_feed(RSS)
    assert entry.title == "Regional & YCS"
    assert entry.url == "https://blog.example.org/ycs"
    assert entry.published == date(2026, 10, 23)
    assert entry.summary == "Coverage live from the event."
    [entry] = news_feeds.parse_feed(ATOM)
    assert (entry.url, entry.published) == ("https://org.example.org/set", date(2026, 10, 22))


def test_feeds_declaring_entities_are_refused():
    with pytest.raises(ValueError):
        news_feeds.parse_feed(b'<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "a">]><rss/>')


def test_summaries_are_plain_and_short():
    assert news_feeds.plain("Ver [la lista](https://x.org) **ya**") == "Ver la lista ya"
    long = news_feeds.plain("palabra " * 100)
    assert len(long) <= news_feeds.SUMMARY_CHARS and long.endswith("palabra…")


def test_only_merged_pull_requests_that_are_news():
    [entry] = news_feeds.parse_pulls(PULLS, ["CI:", "Bump"])
    assert entry.title == "Noticias que se actualizan solas"
    assert entry.summary == "Las noticias del inicio llegan de sus fuentes."
    assert entry.published == date(2026, 10, 24)


def test_storing_does_not_repeat_links_nor_touch_bundled_news(factory):
    entries = news_feeds.parse_feed(RSS)
    with factory.begin() as session:
        news.import_bundled(session)
        bundled = session.scalars(select(NewsItem)).first()
        assert news_feeds.store(session, "yugioh", "Blog", entries) == 1
        assert news_feeds.store(session, "yugioh", "Blog", entries) == 0
        # A feed linking an article already in the bundled news leaves it as it was.
        same = news_feeds.Entry("Otro título", bundled.url, date.today(), "")
        assert news_feeds.store(session, "yugioh", "Blog", [same]) == 0
        assert bundled.title != "Otro título" and not bundled.key.startswith("feed:")
        old = news_feeds.Entry("Vieja", "https://blog.example.org/old", date(2020, 1, 1), "")
        news_feeds.store(session, "yugioh", "Blog", [old])
        session.flush()
        news_feeds.prune(session)
        urls = set(session.scalars(select(NewsItem.url)))
    assert "https://blog.example.org/ycs" in urls and "https://blog.example.org/old" not in urls


@pytest.fixture
def news_settings(tmp_path):
    return Settings(
        _env_file=None,
        user_agent="CardmaticaTests/1 (tests@example.invalid)",
        cache_directory=tmp_path / "cache",
        http_retries=1,
        news_feeds=["Blog|https://blog.example.org/feed", "Org|https://org.example.org/atom"],
        news_site_repo="santapepsi/Cardmatica",
    )


async def no_wait(*args):
    return None


async def test_refresh_brings_every_source_and_survives_a_failing_one(
    factory, news_settings, monkeypatch
):
    seen = []

    def handler(request):
        seen.append((request.url.host, request.url.path))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.host == "blog.example.org":
            return httpx.Response(200, content=RSS)
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=PULLS)
        return httpx.Response(200, content=b"<html>not a feed")

    http = PoliteHttpClient("news", news_settings, transport=httpx.MockTransport(handler))
    monkeypatch.setattr(http.store, "wait", no_wait)
    try:
        with factory.begin() as session:
            results = await news_feeds.refresh(session, http, news_settings)
    finally:
        await http.close()
    assert results["Blog"] == 1 and results["GitHub"] == 1
    assert results["Org"].startswith("error")
    # The GitHub API is for programs: its robots.txt (for the website) is not asked.
    assert ("api.github.com", "/robots.txt") not in seen
    with factory() as session:
        site = news.latest(session, "site", 5)
        game = news.latest(session, "yugioh", 5)
    assert [row.source_name for row in game] == ["Blog"]
    assert site[0].url == "https://github.com/santapepsi/Cardmatica/pull/30"


async def test_news_sources_can_be_turned_off_and_stay_within_their_hosts(news_settings):
    http = PoliteHttpClient("news", news_settings)
    try:
        with pytest.raises(AccessDenied):
            await http.get("https://elsewhere.example.org/feed")
        news_settings.news_enabled = False
        with pytest.raises(AccessDenied):
            await http.get("https://blog.example.org/feed")
    finally:
        await http.close()


def test_old_fetched_news_are_dropped_but_not_bundled_ones(factory):
    with factory.begin() as session:
        news.import_bundled(session)
        count = len(session.scalars(select(NewsItem)).all())
        news_feeds.prune(session, today=date.today() + timedelta(days=news_feeds.KEEP_DAYS * 10))
        assert len(session.scalars(select(NewsItem)).all()) == count
