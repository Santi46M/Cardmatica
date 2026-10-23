"""Choose a few representative printings when the full list is not wanted.

A light catalogue (for trying the site, or a first load) keeps each card's
original printing plus its most recent printings in *other* rarities, so the
list still shows how a card's rarity varies without storing every reprint.
"""

from datetime import date

from app.schemas.ingestion import PrintingInput

# Printings without a known set date sort as the newest, after dated ones.
UNDATED = date.max


def pick_printings(printings: list[PrintingInput], limit: int) -> list[PrintingInput]:
    """Return at most ``limit`` printings, each with a different rarity.

    The first is the oldest printing (the card's original release); the rest
    are the most recent printings whose rarity is not chosen yet. Ties sort by
    code so the result is the same on every run.
    """
    by_age = sorted(printings, key=lambda item: (item.set_release_date or UNDATED, item.code))
    if not by_age:
        return []
    chosen = [by_age[0]]
    rarities = {by_age[0].rarity}
    for printing in reversed(by_age[1:]):
        if len(chosen) >= limit:
            break
        if printing.rarity not in rarities:
            chosen.append(printing)
            rarities.add(printing.rarity)
    return chosen
