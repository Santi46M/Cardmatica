"""The cards a signed-in person opened lately, newest first.

Guests keep the same list in their browser (frontend/js/recent-cards.js); on
signing in it is merged here, so it follows the person to every device. Only
the latest KEEP are stored: enough for the home page, no more.
"""

from datetime import timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import Card, CardView, User

KEEP = 24


def recent_ids(session: Session, user: User) -> list[UUID]:
    return list(
        session.scalars(
            select(CardView.card_id)
            .where(CardView.user_id == user.id)
            .order_by(CardView.viewed_at.desc())
            .limit(KEEP)
        )
    )


def record(session: Session, user: User, card_ids: list[UUID]) -> list[UUID]:
    """Put these cards (newest first) on top of the list; unknown cards are skipped."""
    wanted = list(dict.fromkeys(card_ids))[:KEEP]
    known = set(session.scalars(select(Card.id).where(Card.id.in_(wanted))))
    stored = {
        row.card_id: row
        for row in session.scalars(
            select(CardView).where(CardView.user_id == user.id, CardView.card_id.in_(known))
        )
    }
    now = utcnow()
    # A second apart, so the order given is kept.
    for position, card_id in enumerate(card_id for card_id in wanted if card_id in known):
        viewed_at = now - timedelta(seconds=position)
        if card_id in stored:
            stored[card_id].viewed_at = viewed_at
        else:
            session.add(CardView(user_id=user.id, card_id=card_id, viewed_at=viewed_at))
    session.flush()
    keep = recent_ids(session, user)
    session.execute(
        delete(CardView).where(CardView.user_id == user.id, CardView.card_id.not_in(keep))
    )
    return keep
