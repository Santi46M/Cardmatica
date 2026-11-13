"""The site's languages, in order of priority: Spanish, Portuguese, English.

A visitor gets the language they chose (cookie cm_lang, set from ?lang=), or
else the first of these their browser asks for, or else Spanish.
"""

import json

LANGUAGES = ("es", "pt", "en")
DEFAULT = "es"
COOKIE = "cm_lang"
# What <html lang> and Open Graph say for each one.
HTML_LANG = {"es": "es", "pt": "pt-BR", "en": "en"}
OG_LOCALE = {"es": "es_ES", "pt": "pt_BR", "en": "en_US"}


def supported(value: str | None) -> str | None:
    """ "pt-BR" → "pt"; None for a language the site does not have."""
    code = (value or "").strip().lower()[:2]
    return code if code in LANGUAGES else None


def for_request(request) -> str:
    """The language asked in the address, else the one chosen, else the browser's."""
    return (
        supported(request.query_params.get("lang"))
        or supported(request.cookies.get(COOKIE))
        or from_accept_language(request.headers.get("accept-language"))
    )


def from_accept_language(header: str | None) -> str:
    """The browser's most wanted language that the site has (RFC 9110 weights)."""
    wanted = []
    for position, part in enumerate((header or "").split(",")):
        tag, _, params = part.partition(";")
        weight = 1.0
        if params.strip().startswith("q="):
            try:
                weight = float(params.strip()[2:])
            except ValueError:
                weight = 0
        code = supported(tag)
        if code and weight > 0:
            # Equal weights keep the browser's order.
            wanted.append((-weight, position, code))
    return min(wanted)[2] if wanted else DEFAULT


# The interface texts live in the frontend dictionaries (frontend/i18n/pt.js,
# en.js): `I18N.add({...});` around a JSON object, Spanish text → translation.
# The server reads the same files for titles, descriptions and the static text
# of the pages, so each text is translated in one place.
_dictionaries: dict[str, tuple[int, dict[str, str]]] = {}


def dictionary(lang: str) -> dict[str, str]:
    from app.core.config import ROOT

    if lang == DEFAULT:
        return {}
    path = ROOT / "frontend" / "i18n" / f"{lang}.js"
    stamp = path.stat().st_mtime_ns
    cached = _dictionaries.get(lang)
    if not cached or cached[0] != stamp:
        source = path.read_text(encoding="utf-8")
        body = source[source.index("I18N.add(") + len("I18N.add(") : source.rindex(");")]
        cached = (stamp, json.loads(body))
        _dictionaries[lang] = cached
    return cached[1]


def translate(lang: str, text: str, **values) -> str:
    """Like t() in the frontend: the dictionary's version, with {name} filled in."""
    translated = dictionary(lang).get(text, text)
    for name, value in values.items():
        translated = translated.replace(f"{{{name}}}", str(value))
    return translated
