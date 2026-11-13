"""What moderators and administrators did, for the panel's record (app/api/admin.py)."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StaffAction, User
from app.services.accounts import as_aware

# Who acted when it was a script with ADMIN_TOKEN, not an account.
TOKEN_ACTOR = "ADMIN_TOKEN"


def record(
    session: Session,
    actor: User | None,
    action: str,
    target: User | None = None,
    detail: str | None = None,
) -> None:
    session.add(
        StaffAction(
            actor_id=actor.id if actor else None,
            actor=actor.email if actor else TOKEN_ACTOR,
            action=action,
            target_id=target.id if target else None,
            target=target.email if target else None,
            detail=detail[:300] if detail else None,
        )
    )


def recent(session: Session, limit: int, target_id: UUID | None = None) -> list[dict]:
    query = select(StaffAction).order_by(StaffAction.created_at.desc()).limit(limit)
    if target_id:
        query = query.where(StaffAction.target_id == target_id)
    return [
        {
            "at": as_aware(row.created_at),
            "actor": row.actor,
            "action": row.action,
            "target": row.target,
            "detail": row.detail,
        }
        for row in session.scalars(query)
    ]
