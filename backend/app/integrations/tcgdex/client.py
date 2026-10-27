"""TCGdex's API for the Pokémon TCG (https://tcgdex.dev/).

The catalogue is walked set by set, the newest set first: the list of sets,
then each set's card list, then each card. A card in Spanish or Portuguese is
asked twice, in English too, because TCGdex translates its type and rarity
words (see parser.py). Answers are kept for two days; requests are spaced by
TCGDEX_REQUEST_INTERVAL.
"""

from app.integrations.http import ExternalError, PoliteHttpClient
from app.integrations.tcgdex.parser import API, DIGITAL_SERIES, LANGUAGES, parse_card

CACHE_SECONDS = 172800


class TcgdexClient:
    def __init__(self, http: PoliteHttpClient):
        self.http = http
        self._sets = {}

    async def _json(self, path, *, refresh=False):
        # A documented API for programs (see docs/source-policies.md).
        response = await self.http.get(
            f"{API}{path}", ttl=CACHE_SECONDS, refresh=refresh, robots=False
        )
        return response.json()

    async def set_info(self, language, set_id):
        """A set's own object (release date, abbreviation, series, card list)."""
        group = "ja" if language == "ja" else "en"
        key = (group, set_id)
        if key not in self._sets:
            self._sets[key] = await self._json(f"{group}/sets/{set_id}")
        return self._sets[key]

    async def card(self, identifier, language="en", refresh=False):
        if language not in LANGUAGES:
            raise ExternalError(f"Idioma de TCGdex no admitido: {language}")
        group = "ja" if language == "ja" else "en"
        data = await self._json(f"{group}/cards/{identifier}", refresh=refresh)
        if not isinstance(data, dict) or "id" not in data or "set" not in data:
            raise ExternalError("TCGdex no devolvió una carta")
        localized = None
        if language not in ("en", "ja"):
            localized = await self._json(f"{language}/cards/{identifier}", refresh=refresh)
            if not isinstance(localized, dict) or localized.get("id") != data["id"]:
                raise ExternalError(f"La carta no existe en {language} en TCGdex")
        set_info = await self.set_info(language, data["set"]["id"])
        return parse_card(data, language, localized, set_info)

    async def batch(self, cursor, *, language="en", incremental=False):
        """The cards of one set, the newest set first; Pocket sets are skipped."""
        if language not in LANGUAGES:
            raise ExternalError(f"Idioma de TCGdex no admitido: {language}")
        sets = await self._json(f"{language}/sets", refresh=incremental)
        if not isinstance(sets, list) or not sets:
            raise ExternalError("Listado de sets de TCGdex vacío o no reconocido")
        # TCGdex lists sets from the oldest to the newest.
        ordered = list(reversed(sets))
        index = int(cursor.get("set_index", 0))
        while index < len(ordered):
            info = await self.set_info(language, ordered[index]["id"])
            if (info.get("serie") or {}).get("id") not in DIGITAL_SERIES:
                break
            index += 1
        if index >= len(ordered):
            return [], {"set_index": index}, True
        detail = await self._json(f"{language}/sets/{ordered[index]['id']}", refresh=incremental)
        identifiers = [card["id"] for card in detail.get("cards") or []]
        done = index + 1 >= len(ordered)
        return identifiers, {"set_index": index + 1}, done
