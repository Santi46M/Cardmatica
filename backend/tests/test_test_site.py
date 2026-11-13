"""The test site (TEST_SITE): says so, keeps search engines out, and can ask for a password."""

import base64


def basic(password):
    return {"Authorization": "Basic " + base64.b64encode(f"x:{password}".encode()).decode()}


def test_an_ordinary_site_says_nothing(client):
    page = client.get("/")
    assert "test-site-note" not in page.text
    assert "x-robots-tag" not in page.headers
    assert "Disallow: /api/" in client.get("/robots.txt").text


def test_the_test_site_says_so_and_stays_out_of_search_engines(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "test_site", True)
    page = client.get("/yugioh")
    assert 'class="test-site-note"' in page.text
    assert '<meta name="robots" content="noindex, nofollow">' in page.text
    assert page.headers["x-robots-tag"] == "noindex, nofollow"
    # In the visitor's language too, and on the API's answers.
    assert "Versão de teste" in client.get("/yugioh?lang=pt").text
    assert client.get("/api/v1/sets").headers["x-robots-tag"] == "noindex, nofollow"
    assert client.get("/robots.txt").text == "User-agent: *\nDisallow: /\n"


def test_with_a_password_only_who_has_it_gets_in(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "test_site", True)
    monkeypatch.setattr(settings, "test_site_password", "una clave de prueba")
    refused = client.get("/")
    assert refused.status_code == 401
    assert refused.headers["www-authenticate"].startswith("Basic")
    assert client.get("/", headers=basic("otra")).status_code == 401
    assert client.get("/", headers=basic("una clave de prueba")).status_code == 200
    # The host's health check gets through without it.
    assert client.get("/health/live").status_code == 200
