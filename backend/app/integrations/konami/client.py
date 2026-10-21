from app.integrations.http import ExternalError, PoliteHttpClient
from app.integrations.konami.banlist import parse_banlist
from app.integrations.konami.parser import card_ids, next_page, parse_card

BASE = "https://www.db.yugioh-card.com/yugiohdb/"


class KonamiClient:
    def __init__(self, http: PoliteHttpClient):
        self.http = http

    async def banlist(self, *, language, format, effective_date):
        response = await self.http.get(
            BASE + "forbidden_limited.action", params={"request_locale": language}, refresh=True
        )
        return parse_banlist(
            response.text,
            format=format,
            effective_date=effective_date,
            source_url=str(response.request.url),
        )

    async def card(self, identifier, language="en", refresh=False):
        cid = int(identifier)
        response = await self.http.get(
            BASE + "card_search.action",
            params={"ope": "2", "cid": cid, "request_locale": language},
            refresh=refresh,
        )
        return parse_card(response.text, cid, language, str(response.request.url))

    async def batch(self, cursor, *, language="en", incremental=False):
        # No undocumented last-modified endpoint is assumed. Revalidate known pages.
        url = cursor.get("next_url") or BASE + "card_search.action?ope=1&request_locale=" + language
        response = await self.http.get(url, refresh=incremental)
        identifiers = card_ids(response.text)
        if not identifiers:
            raise ExternalError(
                "Listado oficial sin CIDs reconocibles; se detiene para revisar el parser"
            )
        following = next_page(response.text, str(response.request.url))
        return [str(cid) for cid in identifiers], {"next_url": following}, following is None
