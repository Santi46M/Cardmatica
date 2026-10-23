import os
import socket
import threading
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import uvicorn
from app.db.session import get_session
from app.main import app
from app.models import CardPrinting, PriceObservation
from app.schemas.ingestion import PrintingInput
from app.services.banlists import BanlistFile, import_banlist
from app.services.ingestion import IngestionService
from playwright.sync_api import expect, sync_playwright
from sqlalchemy import select

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


def test_banlist_price_history_wantlists_and_profile(live_server, browser_page, factory):
    """Synthetic list and sales; the bundled official lists are validated elsewhere."""
    now = datetime.now(timezone.utc)
    with factory.begin() as session:
        for market, forbidden in (("TCG", ["Synthetic Test Dragon"]), ("OCG", [])):
            import_banlist(
                session,
                BanlistFile(
                    format=market,
                    effective_date=date(2026, 1, 1),
                    complete=True,
                    source_name="Synthetic test list",
                    source_url="https://example.com/synthetic-list",
                    retrieved_on=date(2026, 1, 2),
                    forbidden=forbidden,
                ),
            )
        printings = {row.code: row.id for row in session.scalars(select(CardPrinting))}
        for code, days_ago, price in (
            ("TST-EN001", 20, "10.00"),
            ("TST-EN001", 5, "14.00"),
            ("TST-EN002", 400, "30.00"),
        ):
            session.add(
                PriceObservation(
                    printing_id=printings[code],
                    observed_at=now - timedelta(days=days_ago),
                    price=Decimal(price),
                    currency="EUR",
                    quantity=1,
                    condition="NM",
                )
            )
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    expect(page.locator("#home-banlist")).to_contain_text("Sin fecha anunciada")
    expect(page.locator("#home-banlist [data-countdown]")).to_contain_text("días")
    page.locator('[data-go="Todas"]').click()
    # Type details sit on one muted line; the latest sale is the prominent column.
    expect(page.locator("#list .meta")).to_contain_text("Monstruo · Dragon · Efecto · LIGHT")
    expect(page.locator("#list")).to_contain_text("14,00")
    page.locator("#list [data-catalog-card]").first.click()
    expect(page.locator("#mb h2 .bn-forbidden")).to_be_visible()
    expect(page.locator("#mb")).to_contain_text("TCG · Prohibida")
    chart = page.locator("#price-history")
    expect(chart.locator("#ph-svg")).to_be_visible()
    expect(chart).to_contain_text("2 ventas")
    chart.locator('[data-ph-range="3650"]').click()
    expect(chart).to_contain_text("3 ventas")
    page.locator("#cur").select_option("USD")
    expect(chart).to_contain_text("US$")
    # The second printing only sold long ago: its last sale still shows with its date.
    chart.locator('[data-ph-range="365"]').click()
    chooser = page.locator("#catalog-printing")
    other = chooser.locator("option").evaluate_all("options => options.map(option => option.value)")
    chooser.select_option(other[1])
    expect(chart.locator(".warn")).to_contain_text("Sin ventas en este periodo")
    expect(chart).to_contain_text("Última venta")
    page.locator("[data-wl-open]").click()
    page.locator("#wl-list-name").fill("Para el deck")
    page.locator("#wl-edition").select_option("1st")
    page.locator("[data-wl-add]").click()
    expect(page.locator("#ts")).to_contain_text("Para el deck")
    page.keyboard.press("Escape")
    page.locator('[data-g="Wantlists"]').click()
    panel = page.locator("#wlv")
    expect(panel).to_contain_text("Para el deck (1)")
    expect(panel).to_contain_text("1st Edition")
    expect(panel).to_contain_text("Second Synthetic Set")
    panel.locator("#wl-filter-edition").select_option("Limited")
    expect(panel).to_contain_text("Ninguna carta de esta lista coincide")
    panel.locator("#wl-filter-edition").select_option("")
    panel.locator("#wl-q").fill("TST-EN002")
    expect(page.locator("#wl-count")).to_have_text("1 de 1 cartas")
    page.locator('[data-g="Perfil"]').click()
    page.locator("#pf-role").select_option("seller")
    page.locator("#pf-name").fill("Ana Pérez")
    page.locator("#pf-form button[type=submit]").click()
    expect(page.locator("#pf-error")).to_contain_text("tienda")
    page.locator("#pf-store").fill("Duelos del Sur")
    page.locator("#pf-address").fill("Av. Siempre Viva 742, Montevideo")
    page.locator("#pf-phone").fill("+598 99 123 456")
    page.locator('input[name="pf-payment"]').first.check()
    page.locator("#pf-form button[type=submit]").click()
    expect(page.locator("#pfv .profile-card")).to_contain_text("Duelos del Sur")
    page.reload()
    page.locator('[data-g="Perfil"]').click()
    expect(page.locator("#pfv .profile-card")).to_contain_text("Ana Pérez")
    expect(page.locator("#pfv")).to_contain_text("1 lista · 1 cartas")
    assert not errors


def test_cart_page_from_popup(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator('[data-g="Productos"]').click()
    page.locator("#pl tr[data-pd]").first.click()
    button = page.locator("#pt [data-add]").first
    item_id = int(button.get_attribute("data-add"))
    stock = page.evaluate("id => ITEMS[id].q", item_id)
    button.click()
    page.keyboard.press("Escape")
    page.locator("#cb").click()
    page.locator("#cbx [data-cart-expand]").click()
    expect(page.locator("#cart")).not_to_have_class("on")
    cart = page.locator("#cartv")
    expect(cart).to_contain_text("Tu carrito · 1 artículo")
    expect(cart.locator(".cart-seller")).to_have_count(1)
    plus = cart.locator('[data-cart-step="1"]')
    if stock > 1:
        plus.click()
        expect(cart.locator(".stepper output")).to_have_text("2")
        cart.locator('[data-cart-step="-1"]').click()
    else:
        expect(plus).to_be_disabled()
    expect(cart.locator(".stepper output")).to_have_text("1")
    cart.locator("[data-cart-buy]").click()
    expect(cart).to_contain_text("Pedido recibido")
    expect(page.locator("#cc")).to_have_text("0")
    assert page.evaluate("id => ITEMS[id].q", item_id) == stock - 1
    assert not errors
