"""News of the home page brought up to date from their sources.

    Yu-Gi-Oh!    the RSS or Atom feeds in NEWS_FEEDS (Konami, YGOrganization,
                 YGOPRODeck by default): title, link, date and a short excerpt,
                 always with the source's name. The article stays on its site.
    Cardmática   the merged pull requests of the site's public repository
                 (GitHub API), without maintenance ones.

`cardmatica news-worker` refreshes them every NEWS_REFRESH_HOURS; the API
never goes out to the internet while answering a visitor. A source that fails
keeps its previous news; the bundled and the administrators' ones stay.
"""

import hashlib
import html
import json
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
from xml.etree import ElementTree

from sqlalchemy import delete, select

from app.models import NewsItem

logger = logging.getLogger(__name__)

# Fetched news older than this are dropped; there are always newer ones.
KEEP_DAYS = 180
SUMMARY_CHARS = 220
URL_CHARS = 500  # NewsItem.url
ATOM = "{http://www.w3.org/2005/Atom}"


@dataclass
class Entry:
    title: str
    url: str
    published: date
    summary: str


def plain(text: str | None, limit: int = SUMMARY_CHARS) -> str:
    """Text without HTML or Markdown marks, cut at a word."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # [text](link)
    text = re.sub(r"[*_`#>]+", "", html.unescape(text))
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    # One character is kept for the ellipsis, so the text fits its column.
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def _date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip()
    try:
        return parsedate_to_datetime(value).date()  # RSS: "Sat, 24 Oct 2026 10:00:00 +0000"
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()  # Atom
    except ValueError:
        return None


def parse_feed(content: bytes) -> list[Entry]:
    """Items of an RSS 2.0 or Atom feed with an https link and a date."""
    # A feed has no reason to declare entities; refusing them avoids expansion attacks.
    if b"<!DOCTYPE" in content[:4096].upper():
        raise ValueError("Feed con DOCTYPE: no se procesa")
    root = ElementTree.fromstring(content)
    entries = []
    for item in root.iter("item"):
        entries.append(
            (
                item.findtext("title"),
                item.findtext("link"),
                item.findtext("pubDate"),
                item.findtext("description"),
            )
        )
    for item in root.iter(f"{ATOM}entry"):
        links = item.findall(f"{ATOM}link")
        link = next(
            (node.get("href") for node in links if node.get("rel", "alternate") == "alternate"),
            None,
        )
        entries.append(
            (
                item.findtext(f"{ATOM}title"),
                link,
                item.findtext(f"{ATOM}published") or item.findtext(f"{ATOM}updated"),
                item.findtext(f"{ATOM}summary") or item.findtext(f"{ATOM}content"),
            )
        )
    found = []
    for title, link, published, summary in entries:
        link, when = (link or "").strip(), _date(published)
        if not title or not when or urlsplit(link).scheme != "https" or len(link) > URL_CHARS:
            continue
        found.append(Entry(plain(title, 140), link, when, plain(summary)))
    return found


def parse_pulls(data: list[dict], skip_prefixes: list[str]) -> list[Entry]:
    """Merged pull requests that are site news, newest first."""
    found = []
    for pull in data:
        title = re.sub(r"\s*\(#\d+\)$", "", pull.get("title") or "").strip()
        if (
            not pull.get("merged_at")
            or (pull.get("user") or {}).get("type") == "Bot"
            or any(title.startswith(prefix) for prefix in skip_prefixes)
        ):
            continue
        # The first paragraph says what changed; the rest is for developers.
        body = (pull.get("body") or "").strip().split("\n\n")[0]
        found.append(
            Entry(plain(title, 140), pull["html_url"], _date(pull["merged_at"]), plain(body))
        )
    return sorted(found, key=lambda entry: entry.published, reverse=True)


def key_for(url: str) -> str:
    return "feed:" + hashlib.sha256(url.encode()).hexdigest()[:32]


def store(session, section: str, source_name: str | None, entries: list[Entry]) -> int:
    """Add new entries and update changed ones; a link already shown is not repeated."""
    known = {
        row.url: row for row in session.scalars(select(NewsItem).where(NewsItem.url.is_not(None)))
    }
    added = 0
    for entry in entries:
        row = known.get(entry.url)
        if row is None:
            row = NewsItem(key=key_for(entry.url), url=entry.url)
            session.add(row)
            known[entry.url] = row
            added += 1
        elif not row.key.startswith("feed:"):
            continue  # Bundled or written by an administrator: theirs stays.
        row.section, row.source_name = section, source_name
        row.title, row.summary, row.published_on = (
            entry.title,
            entry.summary or entry.title,
            entry.published,
        )
    return added


def prune(session, today: date | None = None):
    limit = (today or date.today()) - timedelta(days=KEEP_DAYS)
    session.execute(
        delete(NewsItem).where(NewsItem.key.startswith("feed:"), NewsItem.published_on < limit)
    )


async def refresh(session, client, settings) -> dict:
    """Bring every source up to date; one failing source does not stop the others."""
    ttl = int(settings.news_refresh_hours * 3600) - 60
    results = {}
    for feed in settings.news_feeds:
        name, _, url = feed.rpartition("|")
        name = name.strip() or urlsplit(url).hostname
        try:
            response = await client.get(url.strip(), ttl=ttl)
            results[name] = store(session, "yugioh", name, parse_feed(response.content))
        except Exception as error:  # noqa: BLE001 - logged, the other sources go on
            logger.warning("Noticias de %s no disponibles: %s", name, error)
            results[name] = f"error: {type(error).__name__}"
    if settings.news_site_repo:
        try:
            response = await client.get(
                f"https://api.github.com/repos/{settings.news_site_repo}/pulls",
                params={
                    "state": "closed",
                    "base": "main",
                    "per_page": 30,
                    "sort": "updated",
                    "direction": "desc",
                },
                ttl=ttl,
                robots=False,
            )
            entries = parse_pulls(json.loads(response.content), settings.news_site_skip_prefixes)
            results["GitHub"] = store(session, "site", None, entries)
        except Exception as error:  # noqa: BLE001
            logger.warning("Novedades del sitio no disponibles: %s", error)
            results["GitHub"] = f"error: {type(error).__name__}"
    prune(session)
    return results
