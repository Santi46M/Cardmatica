import asyncio
import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from app.ingestion.normalizers import digest

logger = logging.getLogger(__name__)


class AccessDenied(RuntimeError):
    """An explicit restriction: do not bypass or retry using a different identity."""


class ExternalError(RuntimeError):
    pass


class HttpStore:
    """Shared on-disk cache and request budget across maintenance processes."""

    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "requests.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS budget (source TEXT PRIMARY KEY, next_at REAL);
                CREATE TABLE IF NOT EXISTS responses (
                    key TEXT PRIMARY KEY, status INTEGER, headers TEXT, body BLOB, fetched REAL
                );
            """)

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def read(self, key):
        with self.connect() as db:
            row = db.execute(
                "SELECT status,headers,body,fetched FROM responses WHERE key=?", (key,)
            ).fetchone()
        return row

    def write(self, key, response):
        with self.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO responses VALUES (?,?,?,?,?)",
                (
                    key,
                    response.status_code,
                    json.dumps(dict(response.headers)),
                    response.content,
                    time.time(),
                ),
            )

    def delete(self, key):
        with self.connect() as db:
            db.execute("DELETE FROM responses WHERE key=?", (key,))

    async def wait(self, source: str, interval: float):
        def reserve():
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT next_at FROM budget WHERE source=?", (source,)).fetchone()
                now = time.time()
                scheduled = max(now, row[0] if row else now)
                db.execute(
                    "INSERT OR REPLACE INTO budget VALUES (?,?)", (source, scheduled + interval)
                )
                return max(0, scheduled - now)

        await asyncio.sleep(await asyncio.to_thread(reserve))


class PoliteHttpClient:
    def __init__(self, source, settings, *, transport=None):
        self.source = source
        self.settings = settings
        self.store = HttpStore(settings.cache_directory)
        self.interval = {
            "ygoprodeck": settings.ygoprodeck_request_interval,
            "yugipedia": settings.yugipedia_request_interval,
            "konami": settings.konami_request_interval,
            "news": settings.news_request_interval,
        }[source]
        self.allowed_hosts = {
            "ygoprodeck": {"db.ygoprodeck.com", "images.ygoprodeck.com"},
            "yugipedia": {"yugipedia.com", "ms.yugipedia.com"},
            "konami": {"www.db.yugioh-card.com"},
            # Only the configured feeds and the GitHub API.
            "news": {
                urlsplit(feed.rpartition("|")[2].strip()).hostname for feed in settings.news_feeds
            }
            | {"api.github.com"},
        }[source]
        self.client = httpx.AsyncClient(
            timeout=settings.http_timeout,
            follow_redirects=False,
            transport=transport,
            headers={"User-Agent": settings.user_agent, "Accept-Encoding": "gzip, deflate"},
        )

    def check_policy(self):
        if "REPLACE_WITH_CONTACT" in self.settings.user_agent:
            raise AccessDenied("Configurar USER_AGENT descriptivo con contacto real")
        if self.source == "ygoprodeck" and not self.settings.ygoprodeck_enabled:
            raise AccessDenied("YGOPRODeck deshabilitado en la configuración")
        if self.source == "konami" and not (
            self.settings.konami_enabled and self.settings.konami_authorization_reference.strip()
        ):
            raise AccessDenied("Konami requiere autorización escrita de extracción y uso comercial")
        if self.source == "news" and not self.settings.news_enabled:
            raise AccessDenied("Noticias externas deshabilitadas en la configuración")
        if self.source == "yugipedia" and not self.settings.yugipedia_enabled:
            raise AccessDenied(
                "Yugipedia deshabilitada: revisar políticas y configurar el servicio"
            )

    def validate_url(self, url):
        parsed = urlsplit(str(url))
        if (
            parsed.scheme != "https"
            or parsed.hostname not in self.allowed_hosts
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise AccessDenied("URL externa fuera de los orígenes permitidos")

    async def close(self):
        await self.client.aclose()

    async def get(
        self, url, *, params=None, ttl=30 * 86400, refresh=False, redirects=0, robots=True
    ):
        """robots=False only for documented APIs meant for programs (GitHub's),
        whose robots.txt speaks to crawlers of the website."""
        self.check_policy()
        request_url = str(httpx.URL(url, params=params))
        self.validate_url(request_url)
        if not robots:
            return await self._fetch(request_url, ttl=ttl, refresh=refresh)
        origin = urlsplit(request_url)
        robots_url = f"{origin.scheme}://{origin.netloc}/robots.txt"
        robots_response = await self._fetch(
            robots_url, ttl=86400, refresh=False, allow_missing=True
        )
        if robots_response.status_code in (404, 410):
            pass
        elif robots_response.status_code != 200 or robots_response.text.lstrip().startswith("<"):
            raise AccessDenied("No fue posible validar robots.txt; acceso suspendido")
        else:
            robots = RobotFileParser()
            robots.parse(robots_response.text.splitlines())
            if not robots.can_fetch(self.settings.user_agent, request_url):
                raise AccessDenied("robots.txt impide esta consulta")
            crawl_delay = robots.crawl_delay(self.settings.user_agent)
            if crawl_delay:
                self.interval = max(self.interval, crawl_delay)
        response = await self._fetch(request_url, ttl=ttl, refresh=refresh)
        if response.is_redirect:
            if redirects >= 5:
                raise ExternalError("Demasiadas redirecciones")
            return await self.get(
                urljoin(request_url, response.headers["location"]),
                ttl=ttl,
                refresh=refresh,
                redirects=redirects + 1,
            )
        return response

    async def _fetch(self, url, *, ttl, refresh, allow_missing=False):
        key = digest([self.source, url, self.settings.user_agent])
        cached = self.store.read(key)
        if cached and not refresh and time.time() - cached[3] < ttl:
            return httpx.Response(
                cached[0],
                headers=json.loads(cached[1]),
                content=cached[2],
                request=httpx.Request("GET", url),
            )
        headers = {}
        if cached:
            old_headers = json.loads(cached[1])
            if old_headers.get("etag"):
                headers["If-None-Match"] = old_headers["etag"]
            if old_headers.get("last-modified"):
                headers["If-Modified-Since"] = old_headers["last-modified"]
        for attempt in range(self.settings.http_retries + 1):
            await self.store.wait(self.source, self.interval)
            try:
                async with self.client.stream("GET", url, headers=headers) as streamed:
                    content = bytearray()
                    async for chunk in streamed.aiter_bytes():
                        content.extend(chunk)
                        if len(content) > 12 * 1024 * 1024:
                            raise ExternalError("Respuesta externa superior a 12 MiB")
                    clean_headers = dict(streamed.headers)
                    clean_headers.pop("content-encoding", None)
                    response = httpx.Response(
                        streamed.status_code,
                        headers=clean_headers,
                        content=bytes(content),
                        request=streamed.request,
                    )
                if response.status_code in (401, 403):
                    raise AccessDenied(f"{self.source} rechazó el acceso ({response.status_code})")
                if response.status_code == 304 and cached:
                    response = httpx.Response(
                        200,
                        headers=json.loads(cached[1]),
                        content=cached[2],
                        request=httpx.Request("GET", url),
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt == self.settings.http_retries:
                        raise ExternalError(
                            f"{self.source}: HTTP {response.status_code} tras reintentos"
                        )
                    retry_after = response.headers.get("Retry-After", "")
                    delay = 2**attempt
                    if retry_after.isdigit():
                        delay = max(delay, int(retry_after))
                    elif retry_after:
                        try:
                            delay = max(
                                delay,
                                (
                                    parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)
                                ).total_seconds(),
                            )
                        except (ValueError, TypeError):
                            pass
                    await asyncio.sleep(delay)
                    continue
                if allow_missing and response.status_code in (404, 410):
                    self.store.write(key, response)
                    return response
                if not response.is_redirect:
                    response.raise_for_status()
                if "text/html" in response.headers.get("content-type", "") and any(
                    marker in response.text[:65536].lower()
                    for marker in ("cf-chl-", "challenge-platform", "g-recaptcha", "hcaptcha")
                ):
                    raise AccessDenied("Desafío de acceso detectado; no se intenta eludirlo")
                if response.status_code == 200:
                    self.store.write(key, response)
                logger.info("source=%s status=%s cached=false", self.source, response.status_code)
                return response
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == self.settings.http_retries:
                    raise ExternalError(f"{self.source}: fallo de red tras reintentos") from exc
                await asyncio.sleep(2**attempt)
        raise ExternalError("No se obtuvo respuesta")
