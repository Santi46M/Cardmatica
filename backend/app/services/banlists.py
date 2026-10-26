import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import delete, func, select

from app.ingestion.normalizers import normalized_name
from app.models import BanlistList, BanlistListEntry, CardName
from app.schemas.catalog import BanlistListView, BanlistStatusView

BUNDLED = Path(__file__).resolve().parent.parent / "data" / "banlists"
STATUSES = ("forbidden", "limited", "semi_limited")
MAX_COPIES = {"forbidden": 0, "limited": 1, "semi_limited": 2, "unlimited": 3, "unknown": None}


class BanlistFile(BaseModel):
    """A published list transcribed with its source; names and statuses only."""

    format: Literal["TCG", "OCG"]
    effective_date: date
    complete: bool
    source_name: str = Field(min_length=3, max_length=200)
    source_url: HttpUrl
    retrieved_on: date
    scope_note: str | None = Field(default=None, max_length=1000)
    forbidden: list[str] = []
    limited: list[str] = []
    semi_limited: list[str] = []

    @model_validator(mode="after")
    def unique_names(self):
        seen = {}
        for status in STATUSES:
            for name in getattr(self, status):
                key = normalized_name(name)
                if not key:
                    raise ValueError("Nombre de carta vacío en la lista")
                if key in seen:
                    raise ValueError(f"{name!r} aparece como {seen[key]} y {status}")
                seen[key] = status
        if self.retrieved_on < self.effective_date and self.complete:
            # A list read before it takes effect can still change during its announcement.
            raise ValueError("Una lista completa debe consultarse desde su fecha de vigencia")
        return self


def load_file(path: Path) -> BanlistFile:
    return BanlistFile.model_validate(json.loads(path.read_text(encoding="utf-8")))


def bundled_files() -> list[Path]:
    return sorted(BUNDLED.glob("*.json"))


def import_banlist(session, data: BanlistFile) -> dict:
    """Upsert one dated list. Re-importing the same file is idempotent."""
    row = session.scalar(
        select(BanlistList).where(
            BanlistList.format == data.format, BanlistList.effective_date == data.effective_date
        )
    )
    if row is None:
        row = BanlistList(format=data.format, effective_date=data.effective_date)
        session.add(row)
    row.complete = data.complete
    row.source_name = data.source_name
    row.source_url = str(data.source_url)
    row.retrieved_on = data.retrieved_on
    row.scope_note = data.scope_note
    session.flush()
    session.execute(delete(BanlistListEntry).where(BanlistListEntry.banlist_id == row.id))
    names = []
    for status in STATUSES:
        for name in getattr(data, status):
            key = normalized_name(name)
            names.append(key)
            session.add(
                BanlistListEntry(banlist_id=row.id, name=name, normalized_name=key, status=status)
            )
    session.flush()
    matched = session.scalar(
        select(func.count(func.distinct(CardName.card_id))).where(
            CardName.language == "en", CardName.normalized.in_(names)
        )
    )
    return {
        "format": data.format,
        "effective_date": data.effective_date.isoformat(),
        "entries": len(names),
        "catalog_cards_on_list": matched or 0,
    }


def list_in_force(session, market: str, today: date | None = None) -> BanlistList | None:
    """The latest list of one format whose date has already arrived."""
    return session.scalar(
        select(BanlistList)
        .where(BanlistList.format == market, BanlistList.effective_date <= (today or date.today()))
        .order_by(BanlistList.effective_date.desc())
        .limit(1)
    )


def current_lists(session, today: date | None = None) -> list[BanlistList]:
    """Latest list already in force for each format."""
    rows = (list_in_force(session, market, today) for market in ("TCG", "OCG"))
    return [row for row in rows if row]


def list_view(session, row: BanlistList) -> BanlistListView:
    counts = dict(
        session.execute(
            select(BanlistListEntry.status, func.count())
            .where(BanlistListEntry.banlist_id == row.id)
            .group_by(BanlistListEntry.status)
        ).all()
    )
    return BanlistListView(
        format=row.format,
        effective_date=row.effective_date,
        complete=row.complete,
        source_name=row.source_name,
        source_url=row.source_url,
        retrieved_on=row.retrieved_on,
        scope_note=row.scope_note,
        counts={status: counts.get(status, 0) for status in STATUSES},
    )


def status_view(row: BanlistList, status: str) -> BanlistStatusView:
    return BanlistStatusView(
        format=row.format,
        effective_date=row.effective_date,
        status=status,
        max_copies=MAX_COPIES[status],
        complete=row.complete,
        source_name=row.source_name,
        source_url=row.source_url,
        scope_note=row.scope_note,
    )


def english_names(card) -> set[str]:
    return {name.normalized for name in card.names if name.language == "en"}


def card_statuses(session, card, today: date | None = None) -> list[BanlistStatusView]:
    """Match by English name: lists are published by name, not by catalogue identifier."""
    names = english_names(card)
    result = []
    for row in current_lists(session, today):
        entry = (
            session.scalar(
                select(BanlistListEntry.status).where(
                    BanlistListEntry.banlist_id == row.id,
                    BanlistListEntry.normalized_name.in_(names),
                )
            )
            if names
            else None
        )
        result.append(status_view(row, entry or ("unlimited" if row.complete else "unknown")))
    return result


def statuses_for_cards(session, cards, market, today: date | None = None) -> dict:
    """Status of a page of cards on the list in force for one market, in two queries."""
    if not market or not cards:
        return {}
    row = list_in_force(session, market, today)
    if row is None:
        return {}
    names = {card.id: english_names(card) for card in cards}
    wanted = set().union(*names.values())
    entries = (
        dict(
            session.execute(
                select(BanlistListEntry.normalized_name, BanlistListEntry.status).where(
                    BanlistListEntry.banlist_id == row.id,
                    BanlistListEntry.normalized_name.in_(wanted),
                )
            ).all()
        )
        if wanted
        else {}
    )
    fallback = "unlimited" if row.complete else "unknown"
    return {
        card_id: status_view(
            row, next((entries[name] for name in sorted(card_names) if name in entries), fallback)
        )
        for card_id, card_names in names.items()
    }
