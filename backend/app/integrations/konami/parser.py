import re
from datetime import datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup

from app.schemas.ingestion import CardRecord, NameInput, PrintingInput, TextInput


class KonamiMarkupError(ValueError):
    pass


def card_ids(html: str) -> list[int]:
    soup = BeautifulSoup(html, "html.parser")
    values = []
    for node in soup.select("[href], input.link_value"):
        url = node.get("href") or node.get("value", "")
        query = parse_qs(urlsplit(url).query)
        if query.get("ope") == ["2"] and query.get("cid", [""])[0].isdigit():
            values.append(int(query["cid"][0]))
    return list(dict.fromkeys(values))


def next_page(html: str, current_url: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    link = soup.select_one('a[rel="next"], .page_num a.next, .pagination a.next')
    return urljoin(current_url, link["href"]) if link and link.get("href") else None


def parse_card(html: str, cid: int, language: str, url: str) -> CardRecord:
    soup = BeautifulSoup(html, "html.parser")
    for ruby in soup.select("rt, rp"):
        ruby.decompose()
    title = soup.select_one("#cardname h1, #cardname .card_name, h1.card_name, #cardname")
    if not title or not title.get_text(strip=True):
        raise KonamiMarkupError("No se encontró el nombre oficial; revisar cambios del HTML")
    values = {}
    for box in soup.select(".item_box"):
        label = box.select_one(".item_box_title")
        value = box.select_one(".item_box_value")
        if label and value:
            values[label.get_text(" ", strip=True).casefold()] = value.get_text(" ", strip=True)

    def item(*labels):
        return next((values[label] for label in labels if label in values), None)

    def number(value):
        match = re.search(r"\d+", value or "")
        return int(match[0]) if match else None

    type_line = soup.select_one("#CardType, .species")
    type_text = (
        type_line.get_text(" ", strip=True)
        if type_line
        else item("types", "tipo", "card type") or ""
    )
    subtypes = [part.strip(" []") for part in type_text.split("/") if part.strip(" []")]
    label = (item("card type", "tipo de carta") or type_text).casefold()
    kind = (
        "Spell"
        if any(s in label for s in ("spell", "magia"))
        else "Trap"
        if any(s in label for s in ("trap", "trampa"))
        else "Monster"
        if subtypes or item("atk", "attack")
        else None
    )
    text = soup.select_one("#CardText, .item_box_text")
    pendulum = soup.select_one("#PendulumText, .pendulum_effect")
    texts = (
        [
            TextInput(
                language=language,
                text=text.get_text("\n", strip=True),
                pendulum_text=pendulum.get_text("\n", strip=True) if pendulum else None,
                current=True,
            )
        ]
        if text
        else []
    )
    market = "OCG" if language in {"ja", "ko", "ae", "zh"} else "TCG"
    printings, limitations = [], []
    for row in soup.select("#CardSet .t_row, #card_set_list .t_row, .card_set_list .t_row"):
        code = row.select_one(".card_number, .card_set_number")
        name = row.select_one(".pack_name, .card_set_name")
        if not code or not name:
            continue
        rarity = row.select_one(".rarity, .card_rarity")
        date_node = row.select_one(".time, .release_date")
        released = None
        if date_node:
            for pattern in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
                try:
                    released = datetime.strptime(date_node.get_text(strip=True), pattern).date()
                    break
                except ValueError:
                    continue
        link = name.select_one("a[href]")
        pid = parse_qs(urlsplit(link["href"]).query).get("pid", [None])[0] if link else None
        printings.append(
            PrintingInput(
                code=code.get_text(strip=True),
                set_key=f"konami:{pid}" if pid else name.get_text(" ", strip=True),
                set_name=name.get_text(" ", strip=True),
                rarity=rarity.get_text(strip=True) if rarity else "Unknown",
                language=language,
                market=market,
                release_date=released,
            )
        )
    if not texts:
        limitations.append(
            "Texto oficial ausente o selector no reconocido; no se sustituyó con texto comunitario"
        )
    if not printings:
        limitations.append(
            "No se reconocieron impresiones oficiales; requiere revisión del marcado"
        )
    return CardRecord(
        source="konami",
        external_id=str(cid),
        konami_id=cid,
        url=url,
        language=language,
        names=[NameInput(language=language, name=title.get_text(" ", strip=True))],
        card_type=kind,
        subtypes=subtypes,
        attribute=item("attribute", "atributo"),
        level=number(item("level", "nivel")),
        rank=number(item("rank", "rango")),
        link_rating=number(item("link", "link rating")),
        atk=item("atk", "attack"),
        defense=item("def", "defense"),
        pendulum_scale=number(item("pendulum scale", "escala de péndulo")),
        texts=texts,
        printings=printings,
        limitations=limitations,
    )
