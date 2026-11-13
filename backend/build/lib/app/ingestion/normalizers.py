import hashlib
import json
import re
import unicodedata

from app.services import rarities


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
    """Every spelling of a rarity becomes one name (app/services/rarities.py)."""
    return rarities.canonical(value)
