"""The card games of the site and the markets each one is sold in.

Every market code belongs to one game, so a filter by market is also a filter
by game: "TCG" and "OCG" are Yu-Gi-Oh!, "MTG" is Magic: The Gathering, and
"PKM" and "PKMJ" are Pokémon's international and Japanese markets (sets,
numbers and rarities differ between them, as the OCG does for Yu-Gi-Oh!).

The frontend has the same table, with names and tabs, in frontend/games.js.
"""

from typing import Literal, get_args

Game = Literal["yugioh", "magic", "pokemon"]
Market = Literal["TCG", "OCG", "MTG", "PKM", "PKMJ"]

GAMES: tuple[str, ...] = get_args(Game)
MARKETS: tuple[str, ...] = get_args(Market)

# game → its markets, the first one being the default.
GAME_MARKETS: dict[str, tuple[str, ...]] = {
    "yugioh": ("TCG", "OCG"),
    "magic": ("MTG",),
    "pokemon": ("PKM", "PKMJ"),
}
MARKET_GAME = {market: game for game, markets in GAME_MARKETS.items() for market in markets}
DEFAULT_GAME = "yugioh"


def markets_of(game: str | None) -> tuple[str, ...]:
    return GAME_MARKETS.get(game or DEFAULT_GAME, ())


def game_of(market: str | None) -> str | None:
    return MARKET_GAME.get(market) if market else None


def default_market(game: str | None) -> str:
    return markets_of(game)[0]


def sql_list(values) -> str:
    """'A','B' for a CHECK constraint."""
    return ",".join(f"'{value}'" for value in values)
