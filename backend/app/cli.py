import argparse
import asyncio
import json
import sys
from datetime import date, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import session_factory
from app.ingestion.sync import SyncRunner, worker
from app.models import Card, CardArtwork, CardImage, SyncError, SyncJob, User
from app.models.accounts import ROLES
from app.schemas.catalog import JobRequest
from app.schemas.ingestion import CardRecord
from app.services.accounts import normalize_email, remove_expired
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


async def refresh_news(*, forever=False):
    """Bring the news up to date now, or every NEWS_REFRESH_HOURS when forever."""
    from app.integrations.http import PoliteHttpClient
    from app.services import news_feeds

    settings = get_settings()
    while True:
        client = PoliteHttpClient("news", settings)
        try:
            with session_factory().begin() as session:
                print(
                    json.dumps(
                        await news_feeds.refresh(session, client, settings),
                        ensure_ascii=False,
                        indent=2,
                    ),
                    flush=True,
                )
        finally:
            await client.close()
        if not forever:
            return 0
        await asyncio.sleep(settings.news_refresh_hours * 3600)


def preview_images(max_cards: int, runner=None):
    """Download the general artwork of every catalogue card for the local preview.

    Only for private development environments: the artwork stays unverified and
    is never served in production (see docs/source-policies.md).
    """
    from sqlalchemy import exists
    from sqlalchemy.orm import aliased

    settings = get_settings()
    if not settings.local_image_preview:
        raise ValueError(
            "Activar DEPLOYMENT_MODE=local y ALLOW_LOCAL_IMAGE_PREVIEW=true antes de descargar"
        )
    runner = runner or SyncRunner()
    downloaded = exists().where(CardArtwork.card_id == Card.id, CardArtwork.local_path.is_not(None))
    with runner.factory() as session:
        # Yu-Gi-Oh!: by YGOPRODeck's id. Magic and Pokémon: by the printing
        # their artwork comes from ("en:me03-001" for TCGdex, with its language).
        identifiers = [
            ("ygoprodeck", str(value), "en")
            for value in session.scalars(
                select(Card.ygoprodeck_id)
                .where(Card.ygoprodeck_id.is_not(None), ~downloaded)
                .order_by(Card.display_name)
                .limit(max_cards)
            )
        ]
        stored = aliased(CardArtwork)
        has_picture = (
            exists()
            .where(stored.card_id == Card.id, stored.local_path.is_not(None))
            .correlate(Card)
        )
        pending = session.execute(
            select(Card.id, CardArtwork.source_slug, CardArtwork.external_id)
            .join(Card, Card.id == CardArtwork.card_id)
            .where(CardArtwork.source_slug.in_(["scryfall", "tcgdex"]), ~has_picture)
            .order_by(Card.display_name, CardArtwork.external_id)
        )
        # One picture per card is enough for the preview.
        cards = set()
        for card_id, source, external in pending:
            if len(identifiers) >= max_cards:
                break
            if card_id in cards:
                continue
            cards.add(card_id)
            language, _, identifier = external.rpartition(":")
            identifiers.append((source, identifier, language or "en"))
    failed = 0
    for source, identifier, language in identifiers:
        job_id = runner.enqueue(
            JobRequest(source=source, mode="images", identifier=identifier, language=language)
        )
        asyncio.run(runner.run(job_id))
        with runner.factory() as session:
            if session.get(SyncJob, job_id).status in {"failed", "completed_with_errors"}:
                failed += 1
    print(json.dumps({"cards": len(identifiers), "failed": failed}))
    return 1 if failed else 0


# Where the card text of each language comes from: YGOPRODeck translates into
# French, German, Italian and Portuguese; Spanish (and the Asian languages)
# only Yugipedia has, which must be enabled first (YUGIPEDIA_ENABLED).
TEXT_SOURCES = {"pt": "ygoprodeck", "fr": "ygoprodeck", "de": "ygoprodeck", "it": "ygoprodeck"}
TEXT_LANGUAGES = [*TEXT_SOURCES, "es", "ja", "ko"]


def card_texts(language: str, max_cards: int, runner=None):
    """Bring the name and effect text in one language for catalogue cards that lack it."""
    from sqlalchemy import exists

    from app.models import CardName, CardTextVersion

    settings = get_settings()
    source = TEXT_SOURCES.get(language, "yugipedia")
    if source == "yugipedia" and not settings.yugipedia_enabled:
        raise ValueError(
            f"YGOPRODeck no tiene textos en «{language}»: los tiene Yugipedia. Revisar sus "
            "condiciones de uso y activar YUGIPEDIA_ENABLED=true para traerlos."
        )
    runner = runner or SyncRunner()
    has_text = exists().where(
        CardTextVersion.card_id == Card.id, CardTextVersion.language == language
    )
    # Yugipedia finds a card by the title of its page, the English name.
    english = (
        select(CardName.name)
        .where(CardName.card_id == Card.id, CardName.language == "en", CardName.is_current)
        .limit(1)
        .correlate(Card)
        .scalar_subquery()
    )
    identifier = Card.ygoprodeck_id if source == "ygoprodeck" else english
    with runner.factory() as session:
        identifiers = list(
            session.scalars(
                select(identifier)
                .select_from(Card)
                .where(identifier.is_not(None), ~has_text)
                .order_by(Card.display_name)
                .limit(max_cards)
            )
        )
    failed = 0
    for value in identifiers:
        job_id = runner.enqueue(
            JobRequest(source=source, mode="card", identifier=str(value), language=language)
        )
        asyncio.run(runner.run(job_id))
        with runner.factory() as session:
            if session.get(SyncJob, job_id).status in {"failed", "completed_with_errors"}:
                failed += 1
    print(json.dumps({"language": language, "cards": len(identifiers), "failed": failed}))
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cardmatica")
    commands = parser.add_subparsers(dest="command", required=True)

    sync = commands.add_parser("sync", help="Importar o actualizar cartas desde una fuente")
    sync.add_argument("source", choices=["ygoprodeck", "yugipedia", "scryfall", "tcgdex"])
    sync.add_argument(
        "mode", choices=["initial", "incremental", "card", "images", "errata", "retry", "banlist"]
    )
    sync.add_argument("--identifier")
    sync.add_argument("--language", default="en")
    sync.add_argument("--since", type=datetime.fromisoformat)
    sync.add_argument("--retry-job", type=UUID)
    sync.add_argument("--max-cards", type=int, default=3)
    sync.add_argument(
        "--max-printings",
        type=int,
        help="Importar como máximo N impresiones por carta, cada una de una rareza distinta",
    )
    sync.add_argument("--banlist-format", choices=["TCG", "OCG"])
    sync.add_argument("--effective-date", type=date.fromisoformat)
    sync.add_argument(
        "--query", help="Scryfall: búsqueda que acota el recorrido, p. ej. «e:ecl» para un set"
    )
    sync.add_argument("--enqueue-only", action="store_true")

    resume = commands.add_parser("resume", help="Seguir un trabajo pausado o fallido")
    resume.add_argument("job_id", type=UUID)
    resume.add_argument("--max-cards", type=int, default=3)

    work = commands.add_parser("worker", help="Procesar los trabajos en cola")
    work.add_argument("--once", action="store_true")
    work.add_argument("--poll-seconds", type=float, default=5)

    importing = commands.add_parser("import-jsonl", help="Importar una exportación autorizada")
    importing.add_argument("path", type=Path)
    importing.add_argument("--authorization-reference", required=True)

    banlist = commands.add_parser(
        "import-banlist", help="Importar listas Forbidden & Limited fechadas con su procedencia"
    )
    banlist.add_argument("paths", nargs="*", type=Path)

    commands.add_parser("fetch-news", help="Actualizar ahora las noticias desde sus fuentes")
    commands.add_parser(
        "news-worker", help="Actualizar las noticias cada NEWS_REFRESH_HOURS, sin parar"
    )

    images = commands.add_parser(
        "preview-images",
        help="Descargar ilustraciones de las cartas del catálogo para la vista local de prueba",
    )
    images.add_argument("--max-cards", type=int, default=100)

    texts = commands.add_parser(
        "card-texts",
        help="Traer el nombre y el texto de efecto en otro idioma para las cartas que no lo tienen",
    )
    texts.add_argument("language", choices=TEXT_LANGUAGES)
    texts.add_argument("--max-cards", type=int, default=100)

    photos = commands.add_parser(
        "product-images",
        help="Descargar las fotos provisionales de los productos de la demo (solo vista local)",
    )
    photos.add_argument("--refresh", action="store_true", help="Volver a descargar todas")

    commands.add_parser(
        "cleanup", help="Borrar sesiones vencidas y enlaces de correo usados o vencidos"
    )

    role = commands.add_parser(
        "set-role", help="Dar o quitar un rol a una cuenta (p. ej. el primer administrador)"
    )
    role.add_argument("email")
    role.add_argument("role", choices=list(ROLES))

    approval = commands.add_parser(
        "image-rights", help="Registrar la revisión de derechos de una imagen"
    )
    approval.add_argument("image_id", type=UUID)
    approval.add_argument("status", choices=["approved", "denied", "unverified"])
    approval.add_argument("--authorization-reference")
    approval.add_argument(
        "--artwork", action="store_true", help="Ilustración general, no escaneo de impresión"
    )
    return parser


# ---- One function per command: (args, parser) → exit code -------------------


def run_preview_images(args, parser):
    if not 1 <= args.max_cards <= 5000:
        parser.error("max-cards debe estar entre 1 y 5000")
    return preview_images(args.max_cards)


def run_card_texts(args, parser):
    if not 1 <= args.max_cards <= 20000:
        parser.error("max-cards debe estar entre 1 y 20000")
    try:
        return card_texts(args.language, args.max_cards)
    except ValueError as error:
        parser.error(str(error))


def run_product_images(args, parser):
    from app.services.product_images import download_all

    result = asyncio.run(download_all(get_settings(), refresh=args.refresh))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    # It failed only if nothing at all could be saved or kept.
    return 1 if result["failed"] and not result["saved"] and not result["kept"] else 0


def run_cleanup(args, parser):
    with session_factory().begin() as session:
        print(json.dumps(remove_expired(session)))
    return 0


def run_set_role(args, parser):
    email = normalize_email(args.email)
    with session_factory().begin() as session:
        user = session.scalar(select(User).where(User.email == email))
        if not user:
            parser.error("No existe una cuenta con ese correo")
        user.role = args.role
    print(json.dumps({"email": email, "role": args.role}))
    return 0


def run_worker(args, parser):
    if args.poll_seconds < 1:
        parser.error("poll-seconds debe ser al menos 1")
    asyncio.run(worker(once=args.once, poll_seconds=args.poll_seconds))
    return 0


def run_image_rights(args, parser):
    if args.status == "approved" and not args.authorization_reference:
        parser.error("La aprobación requiere evidencia de permiso comercial")
    with session_factory().begin() as session:
        row = session.get(CardArtwork if args.artwork else CardImage, args.image_id)
        if not row:
            parser.error("Imagen inexistente")
        row.rights_status = args.status
        row.authorization_reference = args.authorization_reference
    return 0


def run_sync(args, parser):
    """`sync` queues a new job and `resume` reopens a stopped one; both then run it here."""
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
            max_printings=args.max_printings,
            banlist_format=args.banlist_format,
            effective_date=args.effective_date,
            query=args.query,
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


COMMANDS = {
    "sync": run_sync,
    "resume": run_sync,
    "worker": run_worker,
    "import-jsonl": lambda args, parser: import_records(args.path, args.authorization_reference),
    "import-banlist": lambda args, parser: import_banlists(args.paths),
    "fetch-news": lambda args, parser: asyncio.run(refresh_news()),
    "news-worker": lambda args, parser: asyncio.run(refresh_news(forever=True)),
    "preview-images": run_preview_images,
    "card-texts": run_card_texts,
    "product-images": run_product_images,
    "cleanup": run_cleanup,
    "set-role": run_set_role,
    "image-rights": run_image_rights,
}


def main():
    configure_logging()
    parser = build_parser()
    args = parser.parse_args()
    return COMMANDS[args.command](args, parser)


if __name__ == "__main__":
    sys.exit(main())
