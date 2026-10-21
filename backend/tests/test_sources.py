import asyncio
import time
from datetime import date

import httpx
import pytest
from app.core.config import Settings
from app.integrations.http import AccessDenied, HttpStore, PoliteHttpClient
from app.integrations.konami.banlist import parse_banlist
from app.integrations.konami.parser import KonamiMarkupError, card_ids, parse_card
from app.integrations.yugipedia.images import match_scan
from app.integrations.yugipedia.parser import classify_group, parse_errata
from app.integrations.yugipedia.parser import parse_card as parse_wiki
from pydantic import ValidationError


@pytest.fixture
def external_settings(tmp_path):
    return Settings(
        _env_file=None,
        user_agent="CardmaticaTests/1 (tests@example.invalid)",
        yugipedia_enabled=True,
        cache_directory=tmp_path / "cache",
        http_retries=2,
    )


async def no_wait(*args):
    return None


def test_konami_markup_and_identifiers():
    html = """<div id="cardname"><h1>Synthetic Dragon</h1></div>
      <div class="item_box"><span class="item_box_title">ATK</span><span class="item_box_value">?</span></div>
      <div id="CardType">Dragon / Effect</div><div id="CardText">Synthetic text</div>
      <div id="CardSet"><div class="t_row"><span class="card_number">TST-EN001</span>
      <span class="pack_name">Synthetic Set</span><span class="rarity">Ultra Rare</span></div></div>"""
    record = parse_card(
        html,
        990001,
        "en",
        "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=990001",
    )
    assert record.atk == "?"
    assert record.card_type == "Monster"
    assert record.printings[0].edition == "unknown"
    assert record.texts[0].current
    assert card_ids(
        '<input class="link_value" value="/yugiohdb/card_search.action?ope=2&amp;cid=990001">'
    ) == [990001]
    with pytest.raises(KonamiMarkupError):
        parse_card("<html>Changed markup</html>", 1, "en", "https://www.db.yugioh-card.com/")


def test_mediawiki_templates_and_separate_group_classification():
    page = {
        "pageid": 123,
        "title": "Synthetic Dragon",
        "revisions": [
            {
                "revid": 42,
                "slots": {
                    "main": {
                        "content": """{{CardTable2
|database_id=990001
|name=Synthetic Dragon
|es_name=Dragón sintético
|types=Dragon / Effect
|password=99000001
|atk=?
|level=8
|text=A [[link|synthetic]] effect.
|en_sets=2026-01-01; TST-EN001; Synthetic Set; Ultra Rare, Super Rare
|archseries=[[Synthetic Archetype]]
}}"""
                    }
                },
            }
        ],
    }
    record, fields = parse_wiki(page)
    assert record.konami_id == 990001
    assert len(record.printings) == 2
    assert record.texts[0].text == "A synthetic effect."
    assert not record.groups
    assert fields["archseries"]
    assert classify_group({"categories": [{"title": "Category:Archetypes"}]}) == "archetype"
    assert classify_group({"categories": [{"title": "Category:Card series"}]}) == "series"
    assert classify_group({"categories": [{"title": "Category:Visual themes"}]}) is None


def test_errata_requires_documented_language_and_versions():
    entries, _ = parse_errata(
        "<table><tr><th>Language</th><th>Old text</th><th>New text</th></tr><tr><td>English</td><td>Before</td><td>After</td></tr></table>"
    )
    assert len(entries) == 1
    assert entries[0].language == "en"
    assert parse_errata("<p>Different formatting or translations</p>")[0] == []


def test_gallery_mapping_requires_unique_dimensions(wiki_record):
    wiki_record.printings[0].edition = "unknown"
    info = {
        "url": "https://ms.yugipedia.com/synthetic.png",
        "extmetadata": {"LicenseShortName": {"value": "Unverified"}},
    }
    printing = match_scan(wiki_record, "File:SyntheticDragon-TST-EN-UR-1E.png", info)
    assert printing.code == "TST-EN001"
    assert printing.edition == "1st"
    assert printing.images[0].rights_status == "unverified"
    assert match_scan(wiki_record, "File:SyntheticDragon-TST-EN-SR-1E.png", info) is None
    assert match_scan(wiki_record, "File:Generic.png", info) is None
    wiki_record.printings.append(wiki_record.printings[0].model_copy(update={"code": "TST-EN002"}))
    assert match_scan(wiki_record, "File:SyntheticDragon-TST-EN-UR-1E.png", info) is None


async def test_http_cache_robots_and_rate_policy(external_settings, monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            text="User-agent: *\nAllow: /" if request.url.path == "/robots.txt" else '{"ok":true}',
        )

    client = PoliteHttpClient(
        "yugipedia", external_settings, transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(client.store, "wait", no_wait)
    try:
        await client.get("https://yugipedia.com/api.php")
        await client.get("https://yugipedia.com/api.php")
        assert len(requests) == 2
        assert "CardmaticaTests" in requests[0].headers["User-Agent"]
    finally:
        await client.close()
    with pytest.raises(ValidationError):
        Settings(_env_file=None, yugipedia_request_interval=0.5)


async def test_http_denial_is_not_retried(external_settings, monkeypatch):
    paths = []

    def handler(request):
        paths.append(request.url.path)
        return (
            httpx.Response(200, text="User-agent: *\nAllow: /")
            if request.url.path == "/robots.txt"
            else httpx.Response(403)
        )

    client = PoliteHttpClient(
        "yugipedia", external_settings, transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(client.store, "wait", no_wait)
    try:
        with pytest.raises(AccessDenied):
            await client.get("https://yugipedia.com/api.php")
        assert paths == ["/robots.txt", "/api.php"]
    finally:
        await client.close()


async def test_http_robots_denial_prevents_query(external_settings, monkeypatch):
    client = PoliteHttpClient(
        "yugipedia",
        external_settings,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, text="User-agent: *\nDisallow: /")
        ),
    )
    monkeypatch.setattr(client.store, "wait", no_wait)
    try:
        with pytest.raises(AccessDenied):
            await client.get("https://yugipedia.com/api.php")
        with pytest.raises(AccessDenied):
            await client.get("https://127.0.0.1/private")
    finally:
        await client.close()


async def test_http_retries_and_conditional_cache(external_settings, monkeypatch):
    calls = []

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(503)
        if len(calls) == 2:
            return httpx.Response(200, headers={"ETag": "v1"}, text="cached")
        return httpx.Response(304)

    client = PoliteHttpClient(
        "yugipedia", external_settings, transport=httpx.MockTransport(handler)
    )
    monkeypatch.setattr(client.store, "wait", no_wait)
    monkeypatch.setattr("app.integrations.http.asyncio.sleep", no_wait)
    try:
        assert (await client.get("https://yugipedia.com/api.php")).text == "cached"
        assert (await client.get("https://yugipedia.com/api.php", refresh=True)).text == "cached"
        assert calls[-1].headers["If-None-Match"] == "v1"
        assert len(calls) == 3
    finally:
        await client.close()


async def test_shared_budget_spaces_processes(tmp_path):
    first, second = HttpStore(tmp_path), HttpStore(tmp_path)
    start = time.time()
    await asyncio.gather(first.wait("source", 0.05), second.wait("source", 0.05))
    assert time.time() - start >= 0.045


async def test_disabled_official_source_makes_no_request(external_settings):
    client = PoliteHttpClient("konami", external_settings)
    try:
        with pytest.raises(AccessDenied):
            await client.get("https://www.db.yugioh-card.com/yugiohdb/")
    finally:
        await client.close()


def test_official_banlist_separates_statuses_dates_and_format():
    html = """<h3>Forbidden List: 1 Card(s)</h3><div class="t_row"><input class="link_value" value="card_search.action?ope=2&amp;cid=990001"></div>
    <h3>Limited List: 1 Card(s)</h3><div class="t_row"><input class="link_value" value="card_search.action?ope=2&amp;cid=990002"></div>
    <h4>Semi-Limited List: 1 Card(s)</h4><div class="t_row"><input class="link_value" value="card_search.action?ope=2&amp;cid=990003"></div>"""
    rows = parse_banlist(
        html,
        format="TCG",
        effective_date=date(2026, 1, 1),
        source_url="https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action",
    )
    assert [row["banlist"]["status"] for row in rows] == ["forbidden", "limited", "semi_limited"]
    assert rows[0]["banlist"]["effective_date"] == "2026-01-01"
    assert rows[0]["banlist"]["format"] == "TCG"


async def test_mediawiki_maxlag_is_retried_without_poisoning_cache(external_settings, monkeypatch):
    from app.integrations.yugipedia.client import YugipediaClient

    calls = []

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        calls.append(request)
        return httpx.Response(
            200, json={"error": {"code": "maxlag"}} if len(calls) == 1 else {"query": {"pages": []}}
        )

    http = PoliteHttpClient("yugipedia", external_settings, transport=httpx.MockTransport(handler))
    monkeypatch.setattr(http.store, "wait", no_wait)
    monkeypatch.setattr("app.integrations.yugipedia.client.asyncio.sleep", no_wait)
    try:
        client = YugipediaClient(http)
        assert "query" in await client.query(action="query", titles="Synthetic")
        assert "query" in await client.query(action="query", titles="Synthetic")
        assert len(calls) == 2
    finally:
        await http.close()
