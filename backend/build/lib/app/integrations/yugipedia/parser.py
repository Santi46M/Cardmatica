import re
from datetime import date
from urllib.parse import quote

import mwparserfromhell
from bs4 import BeautifulSoup

from app.ingestion.normalizers import digest, plain_text, rarity_name
from app.schemas.ingestion import CardRecord, ErratumInput, NameInput, PrintingInput, TextInput

LANGUAGES = {
    "en": ("en", "TCG"),
    "na": ("en", "TCG"),
    "eu": ("en", "TCG"),
    "au": ("en", "TCG"),
    "fr": ("fr", "TCG"),
    "fc": ("fr", "TCG"),
    "de": ("de", "TCG"),
    "it": ("it", "TCG"),
    "sp": ("es", "TCG"),
    "pt": ("pt", "TCG"),
    "jp": ("ja", "OCG"),
    "ja": ("ja", "OCG"),
    "kr": ("ko", "OCG"),
    "sc": ("zh", "OCG"),
    "tc": ("zh-Hant", "OCG"),
    "ae": ("ae", "OCG"),
}


def clean(value):
    return mwparserfromhell.parse(str(value)).strip_code(normalize=True, collapse=True).strip()


def members(value):
    return list(
        dict.fromkeys(
            clean(item).strip(" *")
            for item in re.split(r"\n|<br\s*/?>|;", str(value))
            if clean(item).strip(" *")
        )
    )


def parse_card(page: dict) -> tuple[CardRecord | None, dict]:
    revisions = page.get("revisions", [])
    if not revisions:
        return None, {}
    revision = revisions[0]
    slot = revision.get("slots", {}).get("main", {})
    content = slot.get("content", slot.get("*", revision.get("*", "")))
    wiki = mwparserfromhell.parse(content)
    template = next(
        (
            template
            for template in wiki.filter_templates()
            if str(template.name).strip().casefold() == "cardtable2"
        ),
        None,
    )
    if template is None:
        return None, {}
    fields = {
        str(param.name).strip().replace(" ", "_"): str(param.value).strip()
        for param in template.params
    }
    database_id = clean(fields.get("database_id", ""))
    cid = int(database_id) if database_id.isdigit() else None
    passcode = clean(fields.get("password", ""))
    names = [NameInput(language="en", name=clean(fields.get("name", page["title"])))]
    for lang in ("es", "fr", "de", "it", "pt", "ja", "ko", "sc", "tc"):
        if fields.get(lang + "_name"):
            names.append(
                NameInput(
                    language={"sc": "zh", "tc": "zh-Hant"}.get(lang, lang),
                    name=clean(fields[lang + "_name"]),
                )
            )
    for alias in members(fields.get("alt_name", "")):
        names.append(NameInput(language="en", name=alias, current=False))
    texts = []
    for prefix, language in (
        ("", "en"),
        ("es_", "es"),
        ("ja_", "ja"),
        ("fr_", "fr"),
        ("de_", "de"),
        ("it_", "it"),
        ("pt_", "pt"),
        ("ko_", "ko"),
    ):
        if fields.get(prefix + "text"):
            texts.append(
                TextInput(
                    language=language,
                    text=clean(fields[prefix + "text"]),
                    pendulum_text=clean(fields.get(prefix + "pendulum_effect", "")) or None,
                )
            )
    printings, limitations = [], []
    for prefix, (language, market) in LANGUAGES.items():
        for row in fields.get(prefix + "_sets", "").splitlines():
            columns = [clean(column) for column in row.split(";")]
            if len(columns) < 4:
                if row.strip():
                    limitations.append(f"Fila de impresión no reconocida en {prefix}_sets")
                continue
            released, code, set_name, rarities = columns[:4]
            if not code or not set_name:
                continue
            try:
                released = date.fromisoformat(released)
            except ValueError:
                released = None
            for rarity in rarities.split(","):
                printings.append(
                    PrintingInput(
                        code=code,
                        set_key=set_name,
                        set_name=set_name,
                        rarity=rarity_name(rarity),
                        language=language,
                        market=market,
                        release_date=released,
                    )
                )

    def integer(key):
        value = clean(fields.get(key, ""))
        return int(value) if value.isdigit() else None

    subtypes = [
        clean(part).strip() for part in fields.get("types", "").split("/") if clean(part).strip()
    ]
    record = CardRecord(
        source="yugipedia",
        external_id=str(page["pageid"]),
        url="https://yugipedia.com/wiki/" + quote(page["title"].replace(" ", "_"), safe="/()"),
        language="en",
        revision=str(revision["revid"]),
        konami_id=cid,
        passcode=passcode.zfill(8) if passcode.isdigit() and len(passcode) <= 8 else None,
        names=names,
        card_type=clean(fields.get("card_type", "")) or ("Monster" if subtypes else None),
        subtypes=subtypes,
        attribute=clean(fields.get("attribute", "")) or None,
        level=integer("level"),
        rank=integer("rank"),
        link_rating=integer("link"),
        atk=clean(fields.get("atk", "")) or None,
        defense=clean(fields.get("def", "")) or None,
        pendulum_scale=integer("pendulum_scale"),
        printings=printings,
        texts=texts,
        limitations=limitations,
    )
    return record, fields


def classify_group(page: dict) -> str | None:
    categories = {
        category["title"].removeprefix("Category:").casefold()
        for category in page.get("categories", [])
    }
    archetype = bool(categories & {"archetypes", "tcg and ocg archetypes", "ocg/tcg archetypes"})
    series = bool(categories & {"series", "card series", "ocg/tcg series"})
    return (
        "archetype" if archetype and not series else "series" if series and not archetype else None
    )


def parse_errata(html: str) -> tuple[list[ErratumInput], list[str]]:
    """Only explicit same-language before/after documentation is accepted."""
    soup = BeautifulSoup(html, "html.parser")
    entries = []
    for table in soup.select("table"):
        headers = [
            header.get_text(" ", strip=True).casefold()
            for header in table.select("tr:first-child th")
        ]
        if not {"language", "old text", "new text"}.issubset(headers):
            continue
        for row in table.select("tr")[1:]:
            cells = [cell.get_text("\n", strip=True) for cell in row.select("td")]
            if len(cells) < len(headers):
                continue
            data = dict(zip(headers, cells, strict=False))
            language = {"english": "en", "spanish": "es", "japanese": "ja"}.get(
                data["language"].casefold(), data["language"]
            )
            if not re.fullmatch(r"[a-z]{2}(?:-[A-Za-z]+)?", language):
                continue
            if plain_text(data["old text"]) == plain_text(data["new text"]):
                continue
            entries.append(
                ErratumInput(
                    key=digest([language, data["old text"], data["new text"]]),
                    language=language,
                    old_text=data["old text"],
                    new_text=data["new text"],
                    explanation=data.get(
                        "explanation", "Cambio documentado por Yugipedia; requiere revisión"
                    ),
                )
            )
    return entries, [] if entries else [
        "Errata no estructurada con idioma y versiones inequívocos; revisar la página de origen"
    ]
