"""Scryfall's API for Magic: The Gathering (https://scryfall.com/docs/api).

The catalogue is walked through its search, newest printings first, a page of
up to 175 card objects at a time, in one language per job: `game:paper
lang:es` lists every paper printing in Spanish. A query can narrow it further
(`e:ecl` for one set). Answers are kept for a day, as Scryfall asks (its data
changes once a day), and requests are spaced by SCRYFALL_REQUEST_INTERVAL.
"""

from app.integrations.http import ExternalError, PoliteHttpClient
from app.integrations.scryfall.parser import API, LANGUAGES, parse_card

CACHE_SECONDS = 86400


class ScryfallClient:
    def __init__(self, http: PoliteHttpClient, query: str | None = None):
        self.http = http
        self.query = query
        self._cards = {}

    async def _json(self, url, *, params=None, refresh=False):
        # A documented API for programs, like GitHub's: its robots.txt speaks
        # to crawlers of the website (see docs/source-policies.md).
        response = await self.http.get(
            url, params=params, ttl=CACHE_SECONDS, refresh=refresh, robots=False
        )
        return response.json()

    async def card(self, identifier, language="en", refresh=False):
        data = self._cards.get(str(identifier))
        if data is None:
            data = await self._json(f"{API}cards/{identifier}", refresh=refresh)
            if data.get("object") != "card":
                raise ExternalError("Scryfall no devolvió una carta")
        return parse_card(data)

    async def batch(self, cursor, *, language="en", incremental=False):
        if language not in LANGUAGES:
            raise ExternalError(f"Idioma de Scryfall no admitido: {language}")
        page = int(cursor.get("api_page", 1))
        query = f"game:paper lang:{language}" + (f" ({self.query})" if self.query else "")
        payload = await self._json(
            f"{API}cards/search",
            params={
                "q": query,
                "unique": "prints",
                "order": "released",
                "dir": "desc",
                "include_multilingual": "true",
                "page": page,
            },
            refresh=incremental,
        )
        rows = payload.get("data")
        if payload.get("object") != "list" or not isinstance(rows, list):
            raise ExternalError("Búsqueda de Scryfall con estructura no reconocida")
        self._cards.clear()
        for row in rows:
            self._cards[row["id"]] = row
        identifiers = [row["id"] for row in rows]
        more = bool(payload.get("has_more"))
        return identifiers, {"api_page": page + 1}, not more
