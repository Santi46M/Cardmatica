from app.integrations.http import ExternalError, PoliteHttpClient
from app.integrations.ygoprodeck.parser import BASE, parse_card

CACHE_SECONDS = 172800


class YgoprodeckClient:
    def __init__(self, http: PoliteHttpClient):
        self.http = http
        self._cards = {}
        self._sets = None

    async def sets(self):
        if self._sets is None:
            response = await self.http.get(BASE + "cardsets.php", ttl=CACHE_SECONDS)
            self._sets = response.json()
            if not isinstance(self._sets, list):
                raise ExternalError("Respuesta de sets YGOPRODeck no reconocida")
        return self._sets

    async def card(self, identifier, language="en", refresh=False):
        key = (str(identifier), language)
        data = self._cards.get(key)
        if data is None:
            params = {"id" if str(identifier).isdigit() else "name": str(identifier), "misc": "yes"}
            if language != "en":
                params["language"] = language
            response = await self.http.get(BASE + "cardinfo.php", params=params, ttl=CACHE_SECONDS)
            rows = response.json().get("data", [])
            if len(rows) != 1:
                raise ExternalError("Se esperaba una carta identificada exactamente en YGOPRODeck")
            data = rows[0]
            self._cards[(str(data["id"]), language)] = data
        return parse_card(data, language, await self.sets())

    async def batch(self, cursor, *, language="en", incremental=False):
        offset = int(cursor.get("api_offset", 0))
        params = {"num": 100, "offset": offset, "sort": "id", "misc": "yes"}
        if language != "en":
            params["language"] = language
        # No modification feed exists: incremental runs revalidate bounded pages.
        response = await self.http.get(
            BASE + "cardinfo.php", params=params, ttl=CACHE_SECONDS, refresh=incremental
        )
        payload = response.json()
        rows = payload.get("data")
        if not isinstance(rows, list) or not rows:
            raise ExternalError("Listado de YGOPRODeck vacío o estructura no reconocida")
        identifiers = list(dict.fromkeys(str(row["id"]) for row in rows))
        self._cards.clear()
        for row in rows:
            self._cards[(str(row["id"]), language)] = row
        meta = payload.get("meta", {})
        if "rows_remaining" not in meta:
            raise ExternalError("Falta metadata de paginación de YGOPRODeck")
        remaining = int(meta.get("rows_remaining", 0))
        following = int(meta["next_page_offset"]) if remaining > 0 else offset + len(rows)
        if remaining > 0 and following <= offset:
            raise ExternalError("Paginación sin avance; sincronización suspendida")
        return identifiers, {"api_offset": following}, remaining <= 0
