"""Every rarity of every game has its icon (frontend/js/rarities.js)."""

import re

from app.core.config import ROOT
from app.services import rarities

SCRIPT = (ROOT / "frontend/js/rarities.js").read_text(encoding="utf-8")


KEY = re.compile(r'^\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z]\w*)):', re.M)


def block(name, after=0):
    """The keys of one object literal of the script: `const NAME = {...}` or `game: {...}`."""
    start = SCRIPT.index(name, after)
    depth, end = 0, start
    for end in range(SCRIPT.index("{", start), len(SCRIPT)):
        depth += {"{": 1, "}": -1}.get(SCRIPT[end], 0)
        if depth == 0:
            break
    body = SCRIPT[SCRIPT.index("{", start) + 1 : end]
    return {quoted or bare for quoted, bare in KEY.findall(body)}


def test_every_rarity_has_an_icon():
    pictures = block("const PICTURES = {")
    for game, table in rarities._TABLES.items():
        drawn = block(f"    {game}: {{", SCRIPT.index("const DRAWN"))
        names = {name for rows in table.values() for name, _code, _aliases in rows}
        covered = drawn | (pictures if game == "yugioh" else set())
        assert names - covered == set(), game


def test_every_picture_exists():
    for name in re.findall(
        r':\s*"([a-z0-9-]+)"', SCRIPT[SCRIPT.index("const PICTURES") : SCRIPT.index("const DRAWN")]
    ):
        assert (ROOT / f"frontend/assets/rarities/{name}.png").is_file(), name
