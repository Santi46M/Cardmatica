from uuid import uuid4

from sqlalchemy import event, select

from app.models import CardImage
from app.schemas.ingestion import GroupInput, ImageInput
from app.services.ingestion import IngestionService


def seed(factory, record):
    with factory.begin() as session:
        return IngestionService(session).ingest(record).id


def test_catalog_endpoints_and_filters(factory, client, record, wiki_record):
    card_id = seed(factory, record)
    wiki_record.groups = [GroupInput(name="Synthetic Archetype", kind="archetype")]
    seed(factory, wiki_record)
    for parameters in (
        {"q": "Dragon"},
        {"q": "TST-EN001"},
        {"q": "Synthetic Test Set"},
        {"q": "Synthetic Archetype"},
        {"q": "Ultra Rare"},
        {"market": "TCG", "card_type": "Monster", "subtype": "Effect"},
    ):
        response = client.get("/api/v1/cards", params=parameters)
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 1
    assert client.get("/api/v1/cards", params={"market": "OCG"}).json()["total"] == 0
    assert client.get("/api/v1/cards", params={"q": "%"}).json()["total"] == 0
    assert client.get("/api/v1/cards", params={"rarity": "Common"}).json()["total"] == 0
    detail = client.get(f"/api/v1/cards/{card_id}").json()
    assert detail["name_is_official"]
    assert len(detail["sources"]) == 2
    assert any(
        field["source"] == "konami" and field["field"] == "atk" for field in detail["provenance"]
    )
    printings = client.get(f"/api/v1/cards/{card_id}/printings").json()
    printing = printings["items"][0]
    assert client.get(f"/api/v1/printings/{printing['id']}").json()["code"] == "TST-EN001"
    assert client.get(f"/api/v1/cards/{card_id}/errata").json() == []
    groups = client.get("/api/v1/archetypes").json()
    group_id = groups["items"][0]["id"]
    assert client.get(f"/api/v1/archetypes/{group_id}/cards").json()["total"] == 1
    assert client.get("/api/v1/sets").json()["items"][0]["name"] == "Synthetic Test Set"
    assert "Ultra Rare" in client.get("/api/v1/facets").json()["rarities"]


def test_pagination_sort_validation_and_errors(factory, client, record):
    seed(factory, record)
    assert client.get("/api/v1/cards", params={"page": 2, "page_size": 1}).json()["items"] == []
    for parameters in ({"page": 0}, {"page_size": 101}, {"market": "other"}, {"sort": "sql"}):
        result = client.get("/api/v1/cards", params=parameters)
        assert result.status_code == 422
        assert result.json()["error"]["code"] == "validation_error"
    assert client.get(f"/api/v1/cards/{uuid4()}").status_code == 404
    assert client.get("/api/v1/cards/not-an-id").status_code == 422
    assert client.get(f"/api/v1/archetypes/{uuid4()}/cards").status_code == 404


def test_admin_is_protected_and_only_enqueues(client, settings):
    request = {"source": "ygoprodeck", "mode": "card", "identifier": "990001"}
    assert client.post("/api/v1/admin/sync-jobs", json=request).status_code == 401
    assert (
        client.post(
            "/api/v1/admin/sync-jobs", json=request, headers={"Authorization": "Bearer bad"}
        ).status_code
        == 401
    )
    headers = {"Authorization": "Bearer " + settings.admin_token}
    response = client.post("/api/v1/admin/sync-jobs", json=request, headers=headers)
    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "pending"
    assert client.get(f"/api/v1/admin/sync-jobs/{job['id']}", headers=headers).status_code == 200
    assert client.get("/api/v1/admin/conflicts").status_code == 401


def test_image_permission_is_checked_when_serving(factory, client, settings, wiki_record):
    wiki_record.printings[0].images = [
        ImageInput(file_title="File:Test.png", source_url="https://ms.yugipedia.com/test.png")
    ]
    seed(factory, wiki_record)
    with factory.begin() as session:
        image = session.scalar(select(CardImage))
        image_id = image.id
    assert client.get(f"/api/v1/images/{image_id}").status_code == 404
    settings.image_directory.mkdir()
    (settings.image_directory / "test.png").write_bytes(b"fixture bytes")
    with factory.begin() as session:
        image = session.get(CardImage, image_id)
        image.rights_status, image.authorization_reference, image.local_path = (
            "approved",
            "test-permission",
            "test.png",
        )
    assert client.get(f"/api/v1/images/{image_id}").status_code == 200
    with factory.begin() as session:
        session.get(CardImage, image_id).rights_status = "denied"
    assert client.get(f"/api/v1/images/{image_id}").status_code == 404
    assert client.get("/.env").status_code == 404
    assert client.get("/backend/app/core/config.py").status_code == 404


def test_suggestions_rank_names_and_find_codes(factory, client, record):
    from app.schemas.ingestion import NameInput

    for index, (name, code) in enumerate(
        [
            ("Blue-Eyes White Dragon", "LOB-EN001"),
            ("Dragon Spirit", "TST-EN101"),
            ("White Stone", "TST-EN102"),
            ("Azure-Eyes Silver Dragon", "TST-EN103"),
        ]
    ):
        copy = record.model_copy(
            update={
                "konami_id": 992000 + index,
                "external_id": str(992000 + index),
                "passcode": str(99200000 + index),
                "names": [NameInput(language="en", name=name)],
            },
            deep=True,
        )
        copy.printings[0].code = code
        seed(factory, copy)

    def names(**parameters):
        response = client.get("/api/v1/suggest", params=parameters)
        assert response.status_code == 200, response.text
        return [card["name"] for card in response.json()]

    # Starts with the text, then a word that starts with it; shorter names first.
    assert names(q="dragon") == [
        "Dragon Spirit",
        "Blue-Eyes White Dragon",
        "Azure-Eyes Silver Dragon",
    ]
    # Every word counts, in any order, in the suggestions and in the catalogue.
    assert names(q="white blue") == ["Blue-Eyes White Dragon"]
    assert client.get("/api/v1/cards", params={"q": "white blue"}).json()["total"] == 1
    assert names(q="LOB-EN") == ["Blue-Eyes White Dragon"]
    assert names(q="dragon", limit=1) == ["Dragon Spirit"]
    assert names(q="dragon", market="OCG") == []
    first = client.get("/api/v1/suggest", params={"q": "spirit"}).json()[0]
    assert first["types"]["kind"] == "Monster" and "thumbnail_url" in first
    assert client.get("/api/v1/suggest", params={"q": "d"}).status_code == 422


def test_fixed_query_count_instead_of_n_plus_one(factory, client, record):
    for index in range(8):
        copy = record.model_copy(
            update={
                "konami_id": 991000 + index,
                "external_id": str(991000 + index),
                "passcode": str(99100000 + index),
            },
            deep=True,
        )
        seed(factory, copy)
    engine = factory.kw["bind"]
    queries = []

    def before_execute(*args):
        queries.append(args[2])

    event.listen(engine, "before_cursor_execute", before_execute)
    try:
        assert client.get("/api/v1/cards", params={"page_size": 1}).status_code == 200
        one = len(queries)
        queries.clear()
        assert client.get("/api/v1/cards", params={"page_size": 8}).status_code == 200
        assert len(queries) == one
        # Six catalogue queries plus one for the latest sale of every card on the page.
        assert one <= 7
        # With a market, two more fixed queries resolve the banlist of the whole page.
        queries.clear()
        response = client.get("/api/v1/cards", params={"page_size": 1, "market": "TCG"})
        assert response.status_code == 200
        single = len(queries)
        queries.clear()
        response = client.get("/api/v1/cards", params={"page_size": 8, "market": "TCG"})
        assert response.status_code == 200
        assert len(queries) == single
    finally:
        event.remove(engine, "before_cursor_execute", before_execute)


def test_security_headers_on_page_and_api(client):
    for path in ["/", "/api/v1/cards", "/styles.css"]:
        response = client.get(path)
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
        policy = response.headers["Content-Security-Policy"]
        assert "script-src 'self'" in policy and "frame-ancestors 'none'" in policy
    # The API docs load their own scripts, so they skip the page policy.
    assert "Content-Security-Policy" not in client.get("/docs").headers


def test_hsts_only_over_https(client):
    assert "Strict-Transport-Security" not in client.get("/health/live").headers
    secure = client.get("/health/live", headers={"X-Forwarded-Proto": "https"})
    assert secure.headers["Strict-Transport-Security"].startswith("max-age=31536000")


def test_card_page_title_legal_pages_and_404(client, factory, record):
    from sqlalchemy import select

    from app.models import Card
    from app.services.ingestion import IngestionService

    with factory.begin() as session:
        IngestionService(session).ingest(record)
    with factory() as session:
        card_id = session.scalar(select(Card.id))
    page = client.get(f"/carta/{card_id}/synthetic-test-dragon")
    assert page.status_code == 200
    assert "<title>Synthetic Test Dragon · Cartas sueltas · Cardmática</title>" in page.text
    assert f'rel="canonical" href="http://testserver/carta/{card_id}"' in page.text
    assert (
        'property="og:image" content="http://testserver/frontend/assets/og-image.png"' in page.text
    )
    assert 'property="og:title" content="Synthetic Test Dragon · Cartas sueltas' in page.text
    assert client.get("/terminos").status_code == 200
    assert "Borrador" in client.get("/privacidad").text
    html = {"Accept": "text/html"}
    missing = client.get("/carta/00000000-0000-0000-0000-000000000000", headers=html)
    assert missing.status_code == 404 and "no existe" in missing.text
    assert client.get("/no-existe/aqui", headers=html).status_code == 404
    assert "no existe" in client.get("/no-existe/aqui", headers=html).text
    # The API keeps answering JSON.
    assert client.get("/api/v1/nada", headers=html).json()["error"]["code"] == "http_error"
    robots = client.get("/robots.txt").text
    assert robots.startswith("User-agent") and "Sitemap: http://testserver/sitemap.xml" in robots
    sitemap = client.get("/sitemap.xml")
    assert sitemap.headers["content-type"].startswith("application/xml")
    assert f"<loc>http://testserver/carta/{card_id}</loc>" in sitemap.text
    assert "<loc>http://testserver/privacidad</loc>" in sitemap.text
    assert client.get("/favicon.ico").status_code == 200
    legal = client.get("/terminos").text
    assert '<link rel="canonical" href="http://testserver/terminos">' in legal


def test_cache_control_by_kind_of_file(client):
    assert (
        client.get("/frontend/assets/favicon.svg").headers["Cache-Control"]
        == "public, max-age=86400"
    )
    script = client.get("/frontend/js/catalog.js")
    assert script.headers["Cache-Control"] == "no-cache" and script.headers.get("etag")
    # An unchanged file is answered with 304 and no body.
    again = client.get("/frontend/js/catalog.js", headers={"If-None-Match": script.headers["etag"]})
    assert again.status_code == 304
    assert client.get("/api/v1/cards").headers["Cache-Control"] == "public, max-age=60"
    assert client.get("/api/v1/auth/me").headers["Cache-Control"] == "no-store"
    assert client.get("/api/v1/nada").headers["Cache-Control"] == "no-store"
    assert client.get("/").headers["Cache-Control"] == "no-cache"


def test_pages_link_versioned_files_kept_a_year(client):
    """A page names each script by content hash; that address is never checked again."""
    import hashlib
    import json
    import re

    from app.core.assets import script_source

    response = client.get("/")
    page = response.text
    links = re.findall(r'(?:src|href)="(/(?:frontend/[\w/-]+\.(?:js|css)|styles\.css)[^"]*)"', page)
    assert links and all("?v=" in link for link in links)
    # The modules import each other by plain path; the import map adds the version.
    import_map = re.search(r'<script type="importmap">(.*?)</script>', page).group(1)
    assert script_source(import_map) in response.headers["Content-Security-Policy"]
    mapped = json.loads(import_map)["imports"]["/frontend/js/api.js"]
    body = client.get("/frontend/js/api.js").content
    assert mapped == f"/frontend/js/api.js?v={hashlib.sha256(body).hexdigest()[:12]}"
    assert page.index("importmap") < page.index('rel="modulepreload"')
    assert client.get(mapped).headers["Cache-Control"] == "public, max-age=31536000, immutable"
    # An old or made-up version is not kept: it may not match what is served.
    assert client.get("/frontend/js/api.js?v=000000000000").headers["Cache-Control"] == "no-cache"
    styles = re.search(r'href="(/styles\.css\?v=\w+)"', page).group(1)
    assert client.get(styles).headers["Cache-Control"].endswith("immutable")
    # Pages without modules get versioned styles and no inline script.
    legal = client.get("/terminos")
    assert "/styles.css?v=" in legal.text and "importmap" not in legal.text
    assert "sha256" not in legal.headers["Content-Security-Policy"]


def test_every_module_is_used_and_preloaded():
    """New modules must be imported somewhere and listed for parallel loading."""
    import re

    from app.core.config import ROOT

    folder = ROOT / "frontend" / "js"
    modules = {path.name for path in folder.glob("*.js")}
    imported = set()
    for path in folder.glob("*.js"):
        imported |= set(re.findall(r'from "\./([\w-]+\.js)"', path.read_text(encoding="utf-8")))
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    preloaded = set(re.findall(r'rel="modulepreload" href="/frontend/js/([\w-]+\.js)"', page))
    assert modules - imported == {"catalog.js"}, "módulos sin usar"
    assert preloaded == imported


def test_every_css_class_is_used():
    """Styles for removed markup should go with it."""
    import re

    from app.core.config import ROOT

    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    classes = set(re.findall(r"\.([a-zA-Z][\w-]*)", re.sub(r"url\([^)]*\)|\d+\.\d+", "", css)))
    sources = [
        *ROOT.glob("frontend/**/*.js"),
        *ROOT.glob("frontend/pages/*.html"),
        ROOT / "index.html",
    ]
    text = "".join(path.read_text(encoding="utf-8") for path in sources)
    # Built at run time from a status: `bn-${tone}` (frontend/js/banlist.js).
    dynamic = ("bn-",)
    unused = {
        name
        for name in classes
        if not name.startswith(dynamic)
        and not re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", text)
    }
    assert not unused, sorted(unused)
