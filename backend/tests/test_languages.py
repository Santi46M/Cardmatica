"""Spanish, Portuguese and English: the dictionaries and how a page picks one."""

import json
import re

import pytest

from app.core import languages
from app.core.config import ROOT

FRONTEND = ROOT / "frontend"
# t("…") in the frontend, tr(request, "…") in the page renderer.
CALL = re.compile(r'\bt\(\s*"((?:[^"\\]|\\.)*)"')
SERVER_CALL = re.compile(r'\btr\(\s*request,\s*"((?:[^"\\]|\\.)*)"')


def texts_in_code():
    found = set()
    for path in [*FRONTEND.glob("js/*.js"), *FRONTEND.glob("demo/*.js"), FRONTEND / "theme.js"]:
        found |= {json.loads(f'"{text}"') for text in CALL.findall(path.read_text("utf-8"))}
    pages = (ROOT / "backend" / "app" / "api" / "pages.py").read_text("utf-8")
    return found | set(SERVER_CALL.findall(pages))


@pytest.mark.parametrize("lang", ["pt", "en"])
def test_every_text_the_code_translates_has_a_translation(lang):
    words = languages.dictionary(lang)
    missing = sorted(text for text in texts_in_code() if text not in words)
    assert not missing, f"{lang}: faltan {missing}"


@pytest.mark.parametrize("lang", ["pt", "en"])
def test_translations_keep_their_placeholders(lang):
    for spanish, translated in languages.dictionary(lang).items():
        assert set(re.findall(r"\{\w+\}", spanish)) == set(re.findall(r"\{\w+\}", translated)), (
            spanish
        )


def test_browser_languages_in_the_sites_order():
    assert languages.from_accept_language("pt-BR,pt;q=0.9,en;q=0.8") == "pt"
    assert languages.from_accept_language("en-US,en;q=0.9,es;q=0.8") == "en"
    assert languages.from_accept_language("fr-FR,fr;q=0.9,en;q=0.5,pt;q=0.6") == "pt"
    assert languages.from_accept_language("de-DE") == "es"
    assert languages.from_accept_language(None) == "es"


def test_pages_come_in_the_visitors_language(client):
    page = client.get("/", headers={"Accept-Language": "pt-BR,pt;q=0.9"})
    assert '<html lang="pt-BR">' in page.text
    assert "<title>Cardmática · Cartas de Yu-Gi-Oh! no Mercosul</title>" in page.text
    assert 'placeholder="Nome, código, coleção ou arquétipo"' in page.text
    assert "/frontend/i18n/pt.js?v=" in page.text
    assert page.headers["Vary"].startswith("Accept-Language, Cookie")
    # Each language has its own address for search engines.
    assert 'hreflang="en" href="http://testserver/?lang=en"' in page.text
    assert 'rel="canonical" href="http://testserver/?lang=pt"' in page.text
    # ?lang= chooses, and the choice is kept.
    english = client.get("/?lang=en", headers={"Accept-Language": "pt-BR"})
    assert '<html lang="en">' in english.text and english.cookies.get("cm_lang") == "en"
    assert '<html lang="en">' in client.get("/").text
    spanish = client.get("/?lang=es")
    assert '<html lang="es">' in spanish.text and "/frontend/i18n/" not in spanish.text


def test_legal_pages_have_their_own_translation(client):
    page = client.get("/privacidad?lang=pt")
    assert "<h1>Política de privacidade</h1>" in page.text
    assert "<title>Política de privacidade · Cardmática</title>" in page.text
    assert "<h1>Community rules</h1>" in client.get("/normas?lang=en").text


def test_account_emails_go_in_the_visitors_language(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.mail.send", lambda to, subject, body: sent.append((subject, body))
    )
    client.cookies.set("cm_lang", "pt")
    client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Ana",
            "email": "ana@example.com",
            "password": "uma frase longa e segura",
            "accept_terms": True,
        },
    )
    subject, body = sent[0]
    assert subject == "Confirme seu e-mail na Cardmática"
    assert body.startswith("Olá, Ana:") and "&lang=pt" in body
