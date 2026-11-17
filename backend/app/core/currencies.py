"""How many of each currency make one euro, the storefront's exchange rates.

The same values as frontend/demo/data.js (DEMO.currencies), which shows prices
with them; backend/tests/test_listings.py checks that both agree. They are the
demo's fixed rates, not a market quote.
"""

from decimal import Decimal

PER_EURO = {
    "ARS": Decimal("1600"),
    "BOB": Decimal("7.6"),
    "BRL": Decimal("6.2"),
    "PYG": Decimal("8600"),
    "UYU": Decimal("46"),
    "USD": Decimal("1.1"),
    "EUR": Decimal("1"),
}


def convert(amount: Decimal, source: str, target: str) -> Decimal:
    return Decimal(amount) / PER_EURO[source] * PER_EURO[target]
