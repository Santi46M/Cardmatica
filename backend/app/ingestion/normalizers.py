import hashlib
import json
import re
import unicodedata


def normalized_name(value: str) -> str:
    """Comparison only; display names and source text retain accents and spelling."""
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":")
        ).encode()
    ).hexdigest()


def plain_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def rarity_name(value: str) -> str:
    aliases = {
        "C": "Common",
        "R": "Rare",
        "SR": "Super Rare",
        "UR": "Ultra Rare",
        "UTR": "Ultimate Rare",
        "SCR": "Secret Rare",
        "GR": "Ghost Rare",
        "STR": "Starlight Rare",
    }
    return aliases.get(value.upper().strip(), value.strip() or "Unknown")
