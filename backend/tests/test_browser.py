import os
import socket
import threading
import time

import pytest
import uvicorn
from app.db.session import get_session
from app.main import app
from app.schemas.ingestion import PrintingInput
from app.services.ingestion import IngestionService
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.skipif(
    os.environ.get("CARDMATICA_BROWSER_TESTS") != "1",
    reason="Activar CARDMATICA_BROWSER_TESTS=1 para Chrome/Chromium",
)


@pytest.fixture
def live_server(factory, settings, record):
    record.printings.append(
        PrintingInput(
            code="TST-EN002",
            set_key="Second Synthetic Set",
            set_name="Second Synthetic Set",
            rarity="Super Rare",
            language="en",
            market="TCG",
            edition="unlimited",
            artwork="A2",
        )
    )
    with factory.begin() as session:
        IngestionService(session).ingest(record)

    def override():
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override
    with socket.socket() as socket_probe:
        socket_probe.bind(("127.0.0.1", 0))
        port = socket_probe.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("El servidor de pruebas no inició")
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)
    app.dependency_overrides.clear()


@pytest.fixture
def browser_page():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome" if os.name == "nt" else None)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        yield page
        browser.close()


def test_catalog_printing_switch_currency_and_market(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    expect(page.locator("#home")).to_contain_text("Synthetic Test Dragon")
    page.locator('[data-go="Todas"]').click()
    expect(page.locator("#list")).to_contain_text("Synthetic Test Dragon")
    page.locator("#list [data-catalog-card]").first.click()
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    select = page.locator("#catalog-printing")
    first = select.input_value()
    other = select.locator("option").evaluate_all("options => options.map(option => option.value)")
    select.select_option(next(identifier for identifier in other if identifier != first))
    expect(page.locator("#mb")).to_contain_text("Super Rare")
    expect(page.locator("#mb")).to_contain_text("Second Synthetic Set")
    expect(page.locator("#mb .catalog-image-fallback")).to_contain_text("derechos verificados")
    page.locator("#cur").select_option("USD")
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    page.keyboard.press("Escape")
    page.locator('[data-mk="OCG"]').click()
    expect(page.locator("#list")).to_contain_text("No hay cartas almacenadas")
    page.reload()
    expect(page.locator('[data-mk="OCG"]')).to_have_attribute("aria-pressed", "true")
    assert not errors


def test_existing_product_cart_add_remove_checkout(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator('[data-g="Productos"]').click()
    page.locator("#pl tr[data-pd]").first.click()
    button = page.locator("#pt [data-add]").first
    item_id = int(button.get_attribute("data-add"))
    initial = page.evaluate("id => ITEMS[id].q", item_id)
    button.click()
    expect(page.locator("#cc")).to_have_text("1")
    page.locator("#cb").click()
    expect(page.locator("#cbx")).to_contain_text("Comercio de demostración")
    page.locator("#cbx [data-rm]").click()
    expect(page.locator("#cc")).to_have_text("0")
    page.locator('#cbx [data-close="cart"]').click()
    page.locator("#pt [data-add]").first.click()
    page.locator("#cb").click()
    page.locator("#cbx [data-buy]").click()
    expect(page.locator("#cbx")).to_contain_text("Pedido recibido")
    assert page.evaluate("id => ITEMS[id].q", item_id) == initial - 1
    assert not errors
