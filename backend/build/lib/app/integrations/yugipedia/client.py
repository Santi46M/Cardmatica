import asyncio
from datetime import datetime, timezone
from urllib.parse import quote

from app.ingestion.normalizers import digest
from app.integrations.http import AccessDenied, ExternalError, PoliteHttpClient
from app.integrations.yugipedia.images import match_scan
from app.integrations.yugipedia.parser import classify_group, members, parse_card, parse_errata
from app.schemas.ingestion import GroupInput

API = "https://yugipedia.com/api.php"


class YugipediaClient:
    def __init__(self, http: PoliteHttpClient):
        self.http = http

    async def query(self, *, refresh=False, ttl=30 * 86400, **parameters):
        for attempt in range(self.http.settings.http_retries + 1):
            response = await self.http.get(
                API,
                params={"format": "json", "formatversion": "2", "maxlag": "5", **parameters},
                refresh=refresh or attempt > 0,
                ttl=ttl,
            )
            try:
                data = response.json()
            except ValueError as exc:
                raise ExternalError("MediaWiki devolvió una respuesta no JSON") from exc
            if "error" not in data:
                return data
            self.http.store.delete(
                digest([self.http.source, str(response.request.url), self.http.settings.user_agent])
            )
            code = data["error"].get("code", "unknown")
            if code in {"readapidenied", "permissiondenied", "blocked"}:
                raise AccessDenied(f"MediaWiki rechazó el acceso: {code}")
            if code not in {"maxlag", "ratelimited"} or attempt == self.http.settings.http_retries:
                raise ExternalError(f"MediaWiki: {code}")
            await asyncio.sleep(max(5, 2**attempt))
        raise ExternalError("MediaWiki no respondió tras los reintentos")

    async def pages(self, titles, *, refresh=False):
        data = await self.query(
            action="query",
            titles="|".join(titles),
            redirects=1,
            prop="revisions|categories",
            rvprop="ids|timestamp|content",
            rvslots="main",
            cllimit="max",
            refresh=refresh,
        )
        pages = {
            page["title"]: page
            for page in data.get("query", {}).get("pages", [])
            if not page.get("missing")
        }
        continuation = data.get("continue")
        while continuation:
            extra = await self.query(
                action="query",
                titles="|".join(titles),
                redirects=1,
                prop="categories",
                cllimit="max",
                **continuation,
            )
            for page in extra.get("query", {}).get("pages", []):
                if page["title"] in pages:
                    pages[page["title"]].setdefault("categories", []).extend(
                        page.get("categories", [])
                    )
            continuation = extra.get("continue")
        return list(pages.values())

    async def linked_page(self, title, kind):
        """Discover a gallery/errata target from real links, without guessing a URL."""
        continuation = {}
        namespaces = {"gallery", "card gallery"} if kind == "gallery" else {"errata", "card errata"}
        while True:
            data = await self.query(
                action="query", titles=title, prop="links", pllimit="max", **continuation
            )
            for page in data.get("query", {}).get("pages", []):
                for link in page.get("links", []):
                    target = link["title"]
                    prefix, _, remainder = target.partition(":")
                    if (
                        prefix.casefold() in namespaces and remainder.strip() == title
                    ) or target == title + "/" + kind.capitalize():
                        return target
            continuation = data.get("continue")
            if not continuation:
                return None

    async def card(self, identifier, language="en", refresh=False, include_images=False):
        pages = await self.pages([str(identifier)], refresh=refresh)
        if not pages:
            raise ExternalError("Página de Yugipedia inexistente")
        record, fields = parse_card(pages[0])
        if record is None:
            return None
        groups = []
        for field, relation in (
            ("archseries", "member"),
            ("supports_archetypes", "supports"),
            ("anti-supports_archetypes", "anti_supports"),
            ("related_to_archseries", "related"),
        ):
            for name in members(fields.get(field, "")):
                group_pages = await self.pages([name])
                kind = classify_group(group_pages[0]) if group_pages else None
                if kind:
                    groups.append(GroupInput(name=name, kind=kind, relation=relation))
                else:
                    record.limitations.append(f"Grupo sin clasificación verificable: {name}")
        record.groups = groups
        record.groups_complete = "archseries" in fields and not any(
            limitation.startswith("Grupo sin clasificación") for limitation in record.limitations
        )
        if include_images:
            gallery_title = await self.linked_page(pages[0]["title"], "gallery")
            if not gallery_title:
                record.limitations.append("No se encontró un vínculo de galería verificable")
                return record
            gallery = await self.query(
                action="query",
                titles=gallery_title,
                prop="images",
                imlimit="max",
                refresh=refresh,
            )
            files = []
            while True:
                for page in gallery.get("query", {}).get("pages", []):
                    files.extend(image["title"] for image in page.get("images", []))
                if "continue" not in gallery:
                    break
                gallery = await self.query(
                    action="query",
                    titles=gallery_title,
                    prop="images",
                    imlimit="max",
                    **gallery["continue"],
                )
            enriched, mapped = [], set()
            for title in dict.fromkeys(files):
                info = await self.image_info(title)
                candidate = match_scan(record, title, info or {})
                if candidate:
                    enriched.append(candidate)
                    mapped.add((candidate.code, candidate.language, candidate.rarity))
                else:
                    record.limitations.append(f"Imagen sin correspondencia inequívoca: {title}")
            record.printings = [
                printing
                for printing in record.printings
                if (printing.code, printing.language, printing.rarity) not in mapped
            ] + enriched
        return record

    async def errata(self, title, *, refresh=False):
        target = await self.linked_page(title, "errata")
        if not target:
            return [], ["No se encontró un vínculo de erratas verificable"]
        data = await self.query(action="parse", page=target, prop="text", refresh=refresh)
        entries, limitations = parse_errata(data.get("parse", {}).get("text", ""))
        for entry in entries:
            entry.source_url = "https://yugipedia.com/wiki/" + quote(target.replace(" ", "_"))
        return entries, limitations

    async def image_info(self, file_title, *, refresh=False):
        data = await self.query(
            action="query",
            titles=file_title,
            prop="imageinfo",
            iiprop="url|extmetadata|sha1|mime",
            iiurlwidth=480,
            refresh=refresh,
        )
        pages = data.get("query", {}).get("pages", [])
        return next((page["imageinfo"][0] for page in pages if page.get("imageinfo")), None)

    async def batch(self, cursor, *, language="en", incremental=False):
        continuation = cursor.get("continue", {})
        if incremental:
            since = cursor.get("since")
            if not since:
                raise ValueError("La sincronización incremental requiere --since ISO-8601")
            until = cursor.get("until") or datetime.now(timezone.utc).isoformat()
            data = await self.query(
                action="query",
                list="recentchanges",
                rctype="edit|new",
                rcprop="title|timestamp|ids",
                rcdir="newer",
                rcstart=since,
                rcend=until,
                rclimit=50,
                ttl=0,
                refresh=True,
                **continuation,
            )
            titles = [item["title"] for item in data.get("query", {}).get("recentchanges", [])]
            titles = [title.removesuffix("/Errata").removesuffix("/Gallery") for title in titles]
            titles = [
                title.split(":", 1)[1]
                if title.split(":", 1)[0] in {"Card Errata", "Card Gallery", "Gallery"}
                else title
                for title in titles
            ]
        else:
            until = None
            data = await self.query(
                action="query",
                list="embeddedin",
                eititle="Template:CardTable2",
                einamespace=0,
                eifilterredir="nonredirects",
                eilimit=50,
                **continuation,
            )
            titles = [item["title"] for item in data.get("query", {}).get("embeddedin", [])]
        new_cursor = {"continue": data.get("continue", {})}
        if incremental:
            new_cursor.update(since=since, until=until)
        return list(dict.fromkeys(titles)), new_cursor, "continue" not in data
