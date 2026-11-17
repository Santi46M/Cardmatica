"""Printings whose rarity YGOPRODeck has wrong, with where the right one is documented.

Used only while YGOPRODeck still sends something that is not a rarity ("2",
"3", "New"): once it is fixed there, its own value is taken again. Add a line
only with a source that names the printing's code and its rarity.
"""

# printing code -> (rarity, where it is documented)
RARITIES = {
    "LAVD-ENS14": ("Common", "https://yugipedia.com/wiki/LAVD-ENS14"),
    "LAVD-ENL26": ("Common", "https://www.tcgstacked.com/yugioh/card/LAVD-ENL26"),
    "L26D-ENX09": ("Common", "https://www.cardtrader.com/en/cards/380489"),
}
