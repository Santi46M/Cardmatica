import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, schema
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.schemas.ingestion import CardRecord, NameInput, PrintingInput, TextInput


@pytest.fixture
def factory(tmp_path):
    if os.environ.get("CARDMATICA_TEST_POSTGRES") == "1":
        engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10})
        name = "test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(schema.CreateSchema(name))
        scoped = engine.execution_options(schema_translate_map={None: name})
        Base.metadata.create_all(scoped)
        yield sessionmaker(scoped, expire_on_commit=False)
        with engine.begin() as connection:
            connection.execute(schema.DropSchema(name, cascade=True))
        engine.dispose()
    else:
        engine = create_engine(
            f"sqlite:///{tmp_path / 'tests.sqlite'}", connect_args={"check_same_thread": False}
        )

        @event.listens_for(engine, "connect")
        def foreign_keys(dbapi_connection, _):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(engine)
        yield sessionmaker(engine, expire_on_commit=False)
        engine.dispose()


@pytest.fixture
def session(factory):
    with factory() as session:
        yield session


@pytest.fixture
def settings(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "image_directory", tmp_path / "images")
    monkeypatch.setattr(settings, "cache_directory", tmp_path / "cache")
    monkeypatch.setattr(settings, "admin_token", "test-token-" + "x" * 40)
    return settings


@pytest.fixture
def client(factory, settings):
    def override():
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def record():
    """Entirely synthetic fixtures, never production seed data or source extracts."""
    return CardRecord(
        source="konami",
        external_id="990001",
        konami_id=990001,
        url="https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=990001",
        language="en",
        fetched_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        names=[NameInput(language="en", name="Synthetic Test Dragon")],
        passcode="99000001",
        card_type="Monster",
        subtypes=["Dragon", "Effect"],
        attribute="LIGHT",
        level=8,
        atk="3000",
        defense="?",
        printings=[
            PrintingInput(
                code="TST-EN001",
                set_key="Synthetic Test Set",
                set_name="Synthetic Test Set",
                rarity="Ultra Rare",
                language="en",
                market="TCG",
                edition="1st",
                artwork="A1",
            )
        ],
        texts=[TextInput(language="en", text="Synthetic official test text.", current=True)],
    )


@pytest.fixture
def wiki_record(record):
    return CardRecord.model_validate(
        {
            **record.model_dump(),
            **{
                "source": "yugipedia",
                "external_id": "12345",
                "url": "https://yugipedia.com/wiki/Synthetic_Test_Dragon",
                "fetched_at": datetime(2026, 2, 1, tzinfo=timezone.utc),
            },
        }
    )
