"""Opt-in real-source smoke check. Never run by pytest or on catalogue visits."""

import argparse
import asyncio
import json

from app.ingestion.sync import SyncRunner
from app.models import Archetype, Card, CardArtwork, CardImage, CardPrinting, CardSet, SyncJob
from app.schemas.catalog import JobRequest
from sqlalchemy import func, select

SAMPLE = [
    "Blue-Eyes White Dragon",
    "Dark Magician",
    "Decode Talker",
    "Odd-Eyes Pendulum Dragon",
    "Number 39: Utopia",
]


async def main(images=False):
    runner = SyncRunner()
    jobs = []
    for name in SAMPLE:
        for mode in ["card", "images"] if images else ["card"]:
            identifier = runner.enqueue(
                JobRequest(
                    source="ygoprodeck",
                    mode=mode,
                    identifier=name,
                    max_cards=100,
                )
            )
            await runner.run(identifier)
            with runner.factory() as session:
                job = session.get(SyncJob, identifier)
                jobs.append(
                    {
                        "id": str(identifier),
                        "card": name,
                        "mode": mode,
                        "status": job.status,
                        "processed": job.processed,
                        "failures": job.failures,
                    }
                )
                if job.status != "completed":
                    raise RuntimeError(f"Validación real incompleta: {jobs[-1]}")
    with runner.factory() as session:
        counts = {
            model.__tablename__: session.scalar(select(func.count()).select_from(model))
            for model in (Card, CardPrinting, CardSet, Archetype, CardArtwork, CardImage)
        }
        counts["cached_artworks"] = session.scalar(
            select(func.count()).select_from(CardArtwork).where(CardArtwork.local_path.is_not(None))
        )
        cards = [
            {"name": row.display_name, "ygoprodeck_id": row.ygoprodeck_id, "id": str(row.id)}
            for row in session.scalars(select(Card).order_by(Card.display_name))
        ]
        assert counts["cards"] >= len(SAMPLE)
        assert counts["card_printings"] > len(SAMPLE)
        if images:
            assert counts["cached_artworks"] >= len(SAMPLE)
    print(
        json.dumps({"counts": counts, "cards": cards, "jobs": jobs}, ensure_ascii=False, indent=2)
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", action="store_true")
    parser.add_argument(
        "--confirm-live-access",
        action="store_true",
        required=True,
        help="Confirma revisión de las políticas; realiza consultas reales",
    )
    args = parser.parse_args()
    asyncio.run(main(images=args.images))
