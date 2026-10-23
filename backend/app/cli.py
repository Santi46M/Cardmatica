import argparse
import asyncio
import json
import sys
from datetime import date, datetime
from pathlib import Path
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import session_factory
from app.ingestion.sync import SyncRunner, worker
from app.models import Card, CardArtwork, CardImage, SyncError, SyncJob
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import CardRecord
from app.services.banlists import bundled_files, import_banlist, load_file
from app.services.ingestion import IngestionService


def import_records(path: Path, authorization: str):
    if not authorization.strip():
        raise ValueError("Registrar una referencia de autorización de uso del archivo")
    # JSON Lines streams large exports without loading the complete catalogue.
    settings = get_settings()
    factory = session_factory()
    with factory.begin() as session:
        job = SyncJob(
            source="authorized_import",
            mode="import",
            status="running",
            parameters={"authorization_reference": authorization, "filename": path.name},
        )
        session.add(job)
        session.flush()
        job_id = job.id
    count, failures = 0, 0
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = CardRecord.model_validate_json(line)
                if record.source == "konami" and not settings.konami_authorization_reference:
                    raise ValueError(
                        "Configurar la autorización comercial de Konami antes de importar datos oficiales"
                    )
                with factory.begin() as session:
                    IngestionService(session).ingest(record)
                count += 1
            except Exception as exc:
                failures += 1
                with factory.begin() as session:
                    session.add(
                        SyncError(
                            job_id=job_id,
                            source="authorized_import",
                            code=type(exc).__name__,
                            message=str(exc)[:2000],
                            payload={"line": line_number},
                        )
                    )
    with factory.begin() as session:
        job = session.get(SyncJob, job_id)
        job.processed, job.failures = count, failures
        job.status = "completed_with_errors" if failures else "completed"
    print(json.dumps({"job_id": str(job_id), "imported": count, "failed": failures}))
    return 1 if failures else 0


def import_banlists(paths: list[Path]):
    """Load dated lists from JSON files; without paths, the lists bundled with the app."""
    files = paths or bundled_files()
    if not files:
        raise ValueError("No hay archivos de banlist para importar")
    factory = session_factory()
    results = []
    for path in files:
        data = load_file(path)
        with factory.begin() as session:
            results.append({"file": path.name, **import_banlist(session, data)})
    print(json.dumps(results, ensure_ascii=False))
    return 0


def preview_images(max_cards: int, runner=None):
    """Download the general artwork of every catalogue card for the local preview.

    Only for private development environments: the artwork stays unverified and
    is never served in production (see docs/source-policies.md).
    """
    from sqlalchemy import exists, select

    settings = get_settings()
    if not settings.local_image_preview:
        raise ValueError(
            "Activar DEPLOYMENT_MODE=local y ALLOW_LOCAL_IMAGE_PREVIEW=true antes de descargar"
        )
    runner = runner or SyncRunner()
    downloaded = exists().where(
        CardArtwork.card_id == Card.id, CardArtwork.local_path.is_not(None)
    )
    with runner.factory() as session:
        identifiers = list(
            session.scalars(
                select(Card.ygoprodeck_id)
                .where(Card.ygoprodeck_id.is_not(None), ~downloaded)
                .order_by(Card.display_name)
                .limit(max_cards)
            )
        )
    failed = 0
    for identifier in identifiers:
        job_id = runner.enqueue(
            JobRequest(source="ygoprodeck", mode="images", identifier=str(identifier))
        )
        asyncio.run(runner.run(job_id))
        with runner.factory() as session:
            if session.get(SyncJob, job_id).status in {"failed", "completed_with_errors"}:
                failed += 1
    print(json.dumps({"cards": len(identifiers), "failed": failed}))
    return 1 if failed else 0


def main():
    configure_logging()
    parser = argparse.ArgumentParser(prog="cardmatica")
    commands = parser.add_subparsers(dest="command", required=True)
    sync = commands.add_parser("sync")
    sync.add_argument("source", choices=["ygoprodeck", "yugipedia"])
    sync.add_argument(
        "mode", choices=["initial", "incremental", "card", "images", "errata", "retry", "banlist"]
    )
    sync.add_argument("--identifier")
    sync.add_argument("--language", default="en")
    sync.add_argument("--since", type=datetime.fromisoformat)
    sync.add_argument("--retry-job", type=UUID)
    sync.add_argument("--max-cards", type=int, default=3)
    sync.add_argument("--banlist-format", choices=["TCG", "OCG"])
    sync.add_argument("--effective-date", type=date.fromisoformat)
    sync.add_argument("--enqueue-only", action="store_true")
    resume = commands.add_parser("resume")
    resume.add_argument("job_id", type=UUID)
    resume.add_argument("--max-cards", type=int, default=3)
    work = commands.add_parser("worker")
    work.add_argument("--once", action="store_true")
    work.add_argument("--poll-seconds", type=float, default=5)
    importing = commands.add_parser("import-jsonl")
    importing.add_argument("path", type=Path)
    importing.add_argument("--authorization-reference", required=True)
    banlist = commands.add_parser(
        "import-banlist", help="Importar listas Forbidden & Limited fechadas con su procedencia"
    )
    banlist.add_argument("paths", nargs="*", type=Path)
    images = commands.add_parser(
        "preview-images",
        help="Descargar ilustraciones de las cartas del catálogo para la vista local de prueba",
    )
    images.add_argument("--max-cards", type=int, default=100)
    approval = commands.add_parser("image-rights")
    approval.add_argument("image_id", type=UUID)
    approval.add_argument("status", choices=["approved", "denied", "unverified"])
    approval.add_argument("--authorization-reference")
    approval.add_argument(
        "--artwork", action="store_true", help="Ilustración general, no escaneo de impresión"
    )
    args = parser.parse_args()
    if args.command == "import-jsonl":
        return import_records(args.path, args.authorization_reference)
    if args.command == "preview-images":
        if not 1 <= args.max_cards <= 5000:
            parser.error("max-cards debe estar entre 1 y 5000")
        return preview_images(args.max_cards)
    if args.command == "import-banlist":
        return import_banlists(args.paths)
    if args.command == "worker":
        if args.poll_seconds < 1:
            parser.error("poll-seconds debe ser al menos 1")
        asyncio.run(worker(once=args.once, poll_seconds=args.poll_seconds))
        return 0
    if args.command == "image-rights":
        if args.status == "approved" and not args.authorization_reference:
            parser.error("La aprobación requiere evidencia de permiso comercial")
        with session_factory().begin() as session:
            row = session.get(CardArtwork if args.artwork else CardImage, args.image_id)
            if not row:
                parser.error("Imagen inexistente")
            row.rights_status = args.status
            row.authorization_reference = args.authorization_reference
        return 0
    runner = SyncRunner()
    if args.command == "resume":
        if not 1 <= args.max_cards <= 100000:
            parser.error("max-cards debe estar entre 1 y 100000")
        with runner.factory.begin() as session:
            job = session.get(SyncJob, args.job_id, with_for_update=True)
            if not job or job.status not in {"paused", "failed"}:
                parser.error("Solo se reanudan trabajos pausados o fallidos")
            job.parameters = {**job.parameters, "max_cards": args.max_cards}
            job.status = "pending"
        job_id = args.job_id
    else:
        request = JobRequest(
            source=args.source,
            mode=args.mode,
            identifier=args.identifier,
            language=args.language,
            since=args.since,
            retry_job_id=args.retry_job,
            max_cards=args.max_cards,
            banlist_format=args.banlist_format,
            effective_date=args.effective_date,
        )
        job_id = runner.enqueue(request)
        if args.enqueue_only:
            print(job_id)
            return 0
    asyncio.run(runner.run(job_id))
    with runner.factory() as session:
        job = session.get(SyncJob, job_id)
        print(
            json.dumps(
                {
                    "job_id": str(job_id),
                    "status": job.status,
                    "processed": job.processed,
                    "failures": job.failures,
                }
            )
        )
        return 1 if job.status in {"failed", "completed_with_errors"} else 0


if __name__ == "__main__":
    sys.exit(main())
