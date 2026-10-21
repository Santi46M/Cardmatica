from bs4 import BeautifulSoup, Tag

from app.integrations.konami.parser import KonamiMarkupError, card_ids


def parse_banlist(html, *, format, effective_date, source_url):
    """The effective date and format are reviewed, never inferred from fetch time."""
    soup = BeautifulSoup(html, "html.parser")
    status = None
    entries = {}
    labels = [
        (("semi-limited list", "準制限カード"), "semi_limited"),
        (("forbidden list", "禁止カード"), "forbidden"),
        (("limited list", "制限カード"), "limited"),
        (("no longer on the list", "制限解除"), "unlimited"),
    ]
    for node in soup.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name in {"h2", "h3", "h4", "h5"}:
            heading = node.get_text(" ", strip=True).casefold()
            found = next(
                (
                    value
                    for patterns, value in labels
                    if any(pattern in heading for pattern in patterns)
                ),
                None,
            )
            if found:
                status = found
        elif status and "t_row" in node.get("class", []):
            for cid in card_ids(str(node)):
                entries[cid] = {
                    "identifier": str(cid),
                    "mode": "banlist",
                    "banlist": {
                        "format": format,
                        "effective_date": effective_date.isoformat(),
                        "status": status,
                        "source_url": source_url,
                    },
                }
    if not entries:
        raise KonamiMarkupError(
            "Banlist sin secciones y CIDs reconocibles; revisar formato y marcado"
        )
    return list(entries.values())
