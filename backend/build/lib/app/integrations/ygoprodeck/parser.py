import re
from datetime import date

from pydantic import HttpUrl

from app.schemas.ingestion import (
    ArtworkInput,
    CardRecord,
    GroupInput,
    NameInput,
    PrintingInput,
    TextInput,
)

BASE = "https://db.ygoprodeck.com/api/v7/"
LANGUAGES = {
    "EN": "en",
    "FR": "fr",
    "DE": "de",
    "IT": "it",
    "PT": "pt",
    "SP": "es",
    "JP": "ja",
    "JA": "ja",
    "KR": "ko",
    "AE": "ae",
}


def parse_card(data: dict, language="en", sets=()) -> CardRecord:
    """Do not derive printing rarity/artwork/edition from a general card image."""
    identifier = int(data["id"])
    card_type = data["type"]
    kind = (
        "Spell"
        if card_type == "Spell Card"
        else "Trap"
        if card_type == "Trap Card"
        else "Skill"
        if "Skill" in card_type
        else "Monster"
    )
    subtypes = [part for part in card_type.split() if part not in {"Monster", "Card", "Skill"}]
    if data.get("race") and data["race"] not in subtypes:
        subtypes.insert(0, data["race"])
    misc = (data.get("misc_info") or [{}])[0]
    markets = sorted(
        {value.upper() for value in misc.get("formats", []) if value.lower() in {"tcg", "ocg"}}
    )
    limitations = [
        "Las ilustraciones generales no verifican rareza, set ni edición de una impresión.",
        "YGOPRODeck no acredita licencia comercial del arte ni texto de Konami.",
    ]
    printings = []
    for printing in data.get("card_sets", []):
        code = printing["set_code"].strip().upper()
        suffix = re.search(r"-([A-Z]{2})[A-Z0-9]+$", code)
        # Pre-language English set codes (e.g. LOB-001) only accepted from English records.
        legacy = bool(re.search(r"-\d+$", code)) and language == "en"
        locale = LANGUAGES.get(suffix[1]) if suffix else "en" if legacy else None
        if not locale:
            limitations.append(f"Idioma de impresión no verificable: {code}; no importada.")
            continue
        market = "OCG" if locale in {"ja", "ko", "ae"} else "TCG"
        printings.append(
            PrintingInput(
                code=code,
                set_key=printing["set_name"],
                set_name=printing["set_name"],
                rarity=printing.get("set_rarity") or "Unknown",
                language=locale,
                market=market,
            )
        )
    # Release information is set-level; it is not the release date of every printing.
    set_dates = {item["set_name"]: item.get("tcg_date") for item in sets}
    for printing in printings:
        if printing.market == "TCG" and set_dates.get(printing.set_name):
            printing.set_release_date = date.fromisoformat(set_dates[printing.set_name])
            printing.set_source_url = HttpUrl(BASE + "cardsets.php")
    artworks = [
        ArtworkInput(
            external_id=str(image["id"]),
            source_url=image["image_url"],
            small_source_url=image.get("image_url_small"),
        )
        for image in data.get("card_images", [])
    ]
    return CardRecord(
        source="ygoprodeck",
        external_id=str(identifier),
        ygoprodeck_id=identifier,
        url=f"{BASE}cardinfo.php?id={identifier}&misc=yes"
        + (f"&language={language}" if language != "en" else ""),
        language=language,
        konami_id=misc.get("konami_id"),
        passcode=str(identifier).zfill(8)
        if 0 < identifier <= 99999999 and kind != "Skill" and "Token" not in card_type
        else None,
        names=[NameInput(language=language, name=data["name"])],
        card_type=kind,
        subtypes=subtypes,
        attribute=data.get("attribute"),
        level=data.get("level") if "Xyz" not in card_type else None,
        rank=data.get("level") if "Xyz" in card_type else None,
        link_rating=data.get("linkval"),
        pendulum_scale=data.get("scale"),
        atk=str(data["atk"]) if data.get("atk") is not None else None,
        defense=str(data["def"]) if data.get("def") is not None else None,
        available_markets=markets,
        printings=printings,
        artworks=artworks,
        groups=[GroupInput(name=data["archetype"], kind="archetype")]
        if data.get("archetype")
        else [],
        texts=[TextInput(language=language, text=data["desc"], current=True)]
        if data.get("desc")
        else [],
        limitations=list(dict.fromkeys(limitations)),
    )
