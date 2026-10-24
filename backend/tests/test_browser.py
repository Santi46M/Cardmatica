import os
import re
import socket
import threading
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import uvicorn
from playwright.sync_api import expect, sync_playwright
from sqlalchemy import select

from app.db.session import get_session
from app.main import app
from app.models import Card, CardArtwork, CardPrinting, PriceObservation
from app.schemas.ingestion import PrintingInput
from app.services.banlists import BanlistFile, import_banlist
from app.services.ingestion import IngestionService

pytestmark = pytest.mark.skipif(
    os.environ.get("CARDMATICA_BROWSER_TESTS") != "1",
    reason="Activar CARDMATICA_BROWSER_TESTS=1 para Chrome/Chromium",
)


@pytest.fixture
def live_server(factory, settings, record):
    # Each test starts with a fresh per-IP attempt budget (all tests share 127.0.0.1).
    from app.services import accounts

    accounts.limiter.clear()
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
        # The Content-Security-Policy must not block anything any page uses.
        blocked = []
        page.on(
            "console",
            lambda message: (
                "Content Security Policy" in message.text and blocked.append(message.text)
            ),
        )
        yield page
        browser.close()
        assert not blocked


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
    initial = page.evaluate("id => LISTINGS[id].quantity", item_id)
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
    assert page.evaluate("id => LISTINGS[id].quantity", item_id) == initial - 1
    assert not errors


def test_demo_seller_inventory_card_and_currency(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator('[data-g="Vendedores"]').click()
    expect(page.locator("#vl tr[data-v]")).to_have_count(8)
    page.locator("#vl tr[data-v]").first.click()
    expect(page.locator("#mb")).to_contain_text("Comercio de demostración")
    page.locator("#vk").select_option("Producto")
    expect(page.locator("#vt [data-pd]").first).to_be_visible()
    page.locator("#vk").select_option("Monstruo")
    page.locator("#vt [data-card]").first.click()
    expect(page.locator("#mb")).to_contain_text("Historial de precio")
    expect(page.locator("#mb .cd-stats")).to_contain_text("ATK ")
    expect(page.locator("#cd-facts")).to_contain_text("Disponibles")
    expect(page.locator("#ot .cd-offer [data-add]").first).to_be_visible()
    page.locator('[data-cr="90"]').click()
    expect(page.locator('[data-cr="90"]')).to_have_attribute("aria-pressed", "true")
    page.locator("#cur").select_option("ARS")
    expect(page.locator("#ot")).to_contain_text("ARS")
    page.keyboard.press("Escape")
    expect(page.locator("#md")).not_to_have_class("on")
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
    expect(page.locator("#list .meta")).to_contain_text(
        "Monstruo de Efecto · Dragón · LUZ · Nivel 8"
    )
    expect(page.locator("#list")).to_contain_text("14,00")
    page.locator("#list [data-catalog-card]").first.click()
    expect(page.locator("#mb h2 .bn-forbidden")).to_be_visible()
    expect(page.locator("#mb")).to_contain_text("TCG · Prohibida")
    chart = page.locator("#price-history")
    expect(chart.locator("#ph-svg")).to_be_visible()
    expect(chart.locator("#ph-svg")).to_have_attribute("aria-label", re.compile("2 ventas"))
    expect(page.locator("#cd-prices")).to_contain_text("Media 30 días")
    chart.locator('[data-ph-range="3650"]').click()
    expect(chart.locator("#ph-svg")).to_have_attribute("aria-label", re.compile("3 ventas"))
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
    page.locator('[data-g="Deseados"]').click()
    panel = page.locator("#wlv")
    expect(panel).to_contain_text("Para el deck (1)")
    expect(panel).to_contain_text("1st Edition")
    expect(panel).to_contain_text("Second Synthetic Set")
    panel.locator("#wl-filter-edition").select_option("Limited")
    expect(panel).to_contain_text("Ninguna carta de esta lista coincide")
    panel.locator("#wl-filter-edition").select_option("")
    panel.locator("#wl-q").fill("TST-EN002")
    expect(page.locator("#wl-count")).to_have_text("1 de 1 cartas")
    page.locator("#account-button").click()
    page.locator('#account-menu [data-go="Perfil"]').first.click()
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
    expect(page.locator("#account-button")).to_have_text("AP")
    page.locator("#account-button").click()
    expect(page.locator("#account-menu")).to_contain_text("Duelos del Sur")
    expect(page.locator("#account-menu .acc-item[disabled]").first).to_contain_text("Próximamente")
    page.keyboard.press("Escape")
    expect(page.locator("#account-menu")).to_be_hidden()
    page.locator("#pf-pref-currency").select_option("BRL")
    expect(page.locator("#cur")).to_have_value("BRL")
    page.reload()
    page.locator("#account-button").click()
    page.locator('#account-menu [data-go="Perfil"]').first.click()
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
    stock = page.evaluate("id => LISTINGS[id].quantity", item_id)
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
    assert page.evaluate("id => LISTINGS[id].quantity", item_id) == stock - 1
    assert not errors


def test_list_url_state_grid_preview_shortcut_and_price_alerts(live_server, browser_page, factory):
    with factory.begin() as session:
        import_banlist(
            session,
            BanlistFile(
                format="TCG",
                effective_date=date(2026, 1, 1),
                complete=True,
                source_name="Synthetic test list",
                source_url="https://example.com/synthetic-list",
                retrieved_on=date(2026, 1, 2),
                limited=["Synthetic Test Dragon"],
            ),
        )
        printing = session.scalar(select(CardPrinting).where(CardPrinting.code == "TST-EN001"))
        session.add(
            PriceObservation(
                printing_id=printing.id,
                observed_at=datetime.now(timezone.utc) - timedelta(days=3),
                price=Decimal("8.00"),
                currency="EUR",
                quantity=1,
            )
        )
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    # "/" jumps to the search box from anywhere outside a form field.
    page.locator("body").press("/")
    expect(page.locator("#q")).to_be_focused()
    page.locator("#q").fill("Synthetic")
    expect(page.locator("#list .bn-limited")).to_be_visible()
    page.locator("#rar").select_option("Ultra Rare")
    expect(page).to_have_url(re.compile(r"tab=Todas.*q=Synthetic.*rar=Ultra\+Rare"))
    # The filters survive a reload because they live in the URL.
    page.reload()
    expect(page.locator("#q")).to_have_value("Synthetic")
    expect(page.locator("#rar")).to_have_value("Ultra Rare")
    expect(page.locator("#list")).to_contain_text("Synthetic Test Dragon")
    # Hovering the name shows a preview without opening the card.
    page.locator("#list [data-preview]").first.hover()
    expect(page.locator("#card-preview")).to_be_visible()
    expect(page.locator("#card-preview")).to_contain_text("Última venta")
    page.mouse.move(5, 5)
    expect(page.locator("#card-preview")).to_be_hidden()
    # Opening a card adds it to the URL; Back closes it and keeps the filters.
    page.locator("#list [data-catalog-card]").first.click()
    expect(page.locator("#md")).to_have_class(re.compile("on"))
    expect(page).to_have_url(re.compile(r"/carta/[0-9a-f-]+"))
    page.go_back()
    expect(page.locator("#md")).not_to_have_class(re.compile("on"))
    expect(page).not_to_have_url(re.compile("/carta/"))
    expect(page.locator("#rar")).to_have_value("Ultra Rare")
    # Grid view, remembered in the URL.
    page.locator('[data-view="grid"]').click()
    expect(page.locator("#catalog-grid .card-tile")).to_have_count(1)
    table = page.locator("#list").locator("xpath=ancestor::div[contains(@class,'pn')]")
    expect(table).to_be_hidden()
    expect(page).to_have_url(re.compile("view=grid"))
    # A wantlist target price above the last sale raises an alert.
    page.locator("#catalog-grid .card-tile").first.click()
    page.locator("[data-wl-open]").click()
    page.locator("#wl-list-name").fill("Objetivos")
    # Printings are grouped by set: "code · rarity" under the set's name.
    expect(page.locator('#wl-printing optgroup[label="Synthetic Test Set"]')).to_have_count(1)
    page.locator("#wl-printing").select_option(label="TST-EN001 · Ultra Rare")
    page.locator("[data-wl-add]").click()
    page.keyboard.press("Escape")
    page.locator('[data-g="Deseados"]').click()
    page.locator("[data-wl-alert]").fill("10")
    page.locator("[data-wl-alert]").press("Tab")
    expect(page.locator('#tabs [data-g="Deseados"]')).to_have_text("Lista de deseados (1)")
    expect(page.locator("#wlv .wl-alerts")).to_contain_text("Synthetic Test Dragon")
    page.locator("[data-wl-seen]").click()
    expect(page.locator('#tabs [data-g="Deseados"]')).to_have_text("Lista de deseados")
    expect(page.locator("#wlv .wl-alerts")).to_have_count(0)
    # Back to top appears once the page is scrolled.
    page.set_viewport_size({"width": 800, "height": 300})
    page.locator("#account-button").click()
    page.locator('#account-menu [data-go="Perfil"]').first.click()
    page.mouse.wheel(0, 2000)
    expect(page.locator("#to-top")).to_be_visible()
    page.locator("#to-top").click()
    expect(page.locator("#to-top")).to_be_hidden()
    assert not errors


def test_provisional_artwork_is_marked_everywhere(
    live_server, browser_page, factory, settings, monkeypatch
):
    """Synthetic image file; marks unlicensed preview artwork with a red warning."""
    from PIL import Image

    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(settings, "allow_local_image_preview", True)
    settings.image_directory.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (59, 86), "teal").save(settings.image_directory / "art.png")
    with factory.begin() as session:
        card = session.scalar(select(Card))
        session.add(
            CardArtwork(
                card_id=card.id,
                source_slug="ygoprodeck",
                external_id="synthetic-art",
                source_url="https://images.ygoprodeck.com/images/cards/0.jpg",
                local_path="art.png",
                thumbnail_path="art.png",
            )
        )
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{live_server}/?tab=Todas")
    warning = page.locator("#list .img-warn")
    expect(warning).to_be_visible()
    expect(warning).to_have_attribute("data-tip", re.compile("provisional.*sin licencia"))
    expect(page.locator("#list img.catalog-image")).to_have_js_property("complete", True)
    page.locator("#list [data-preview]").first.hover()
    expect(page.locator("#card-preview")).to_contain_text("Imagen provisional")
    page.locator('[data-view="grid"]').click()
    expect(page.locator("#catalog-grid .img-warn")).to_be_visible()
    page.locator("#catalog-grid .card-tile").first.click()
    expect(page.locator("#mb .cd-image .img-warn")).to_be_visible()
    assert not errors


def test_type_filters_follow_the_tab(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{live_server}/?tab=Todas")
    groups = page.locator("#f-type optgroup")
    expect(groups).to_have_count(3)
    # "Todas las trampas" and the three kinds of trap, in whole phrases.
    expect(page.locator('#f-type optgroup[label="Trampas"] option')).to_have_text(
        ["Todas las trampas", "Trampas normales", "Trampas continuas", "Trampas de contraefecto"]
    )
    page.locator('[data-g="Monstruo"]').click()
    expect(page.locator("#f-type")).to_have_count(0)
    expect(page.locator("#f-race option", has_text="Dragón")).to_have_count(1)
    page.locator("#f-frame").select_option("Synchro")
    expect(page.locator("#catalog-status")).to_contain_text("no contiene resultados")
    page.locator("#f-frame").select_option("Effect")
    expect(page.locator("#list")).to_contain_text("Synthetic Test Dragon")
    assert "clase=Effect" in page.url
    # Level, Rank and Link are separate groups with only the numbers the catalogue has.
    expect(page.locator('#f-level optgroup[label="Nivel"] option')).to_have_text(["Nivel 8"])
    expect(page.locator('#f-level optgroup[label="Link"]')).to_have_count(0)
    page.locator("#f-level").select_option("level:8")
    expect(page.locator("#list")).to_contain_text("Synthetic Test Dragon")
    page.reload()
    expect(page.locator("#f-frame")).to_have_value("Effect")
    page.locator('[data-g="Magia"]').click()
    expect(page.locator("#f-property option", has_text="Juego rápido")).to_have_count(1)
    expect(page.locator("#f-frame")).to_have_count(0)
    assert not errors


def test_register_sign_out_and_sign_in_from_the_account_menu(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator("#account-button").click()
    expect(page.locator("#account-menu")).to_contain_text("Invitado")
    page.locator('#account-menu [data-auth-mode="register"]').click()
    expect(page.locator("#auth-register")).to_be_visible()
    page.locator("#auth-name").fill("Martín")
    page.locator("#auth-email").fill("martin@example.com")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-register button[type=submit]").click()
    expect(page.locator("#authv [data-auth-error]")).to_contain_text("términos")
    page.locator("#auth-terms").check()
    page.locator("#auth-register button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("Cuenta creada")
    expect(page.locator("#account-button")).to_have_text("M")
    page.reload()
    expect(page.locator("#account-button")).to_have_text("M")
    page.locator("#account-button").click()
    page.locator('#account-menu [data-go="Seguridad"]').click()
    expect(page.locator("#auth-sessions")).to_contain_text("(esta)")
    page.locator("#account-button").click()
    page.locator("#account-menu [data-auth-logout]").click()
    expect(page.locator("#ts")).to_contain_text("Sesión cerrada")
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="login"]').click()
    page.locator("#auth-email").fill("martin@example.com")
    page.locator("#auth-password").fill("equivocada")
    page.locator("#auth-login button[type=submit]").click()
    expect(page.locator("#authv [data-auth-error]")).to_contain_text("incorrectos")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-login button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("Hola, Martín")
    assert not errors


def test_browser_data_moves_into_the_account(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{live_server}/?tab=Todas")
    page.locator("#list [data-catalog-card]").first.click()
    page.locator("[data-wl-open]").first.click()
    page.locator("#wl-list-name").fill("Antes de la cuenta")
    page.locator("[data-wl-add]").click()
    page.keyboard.press("Escape")
    page.locator("#cur").select_option("UYU")
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="register"]').click()
    page.locator("#auth-name").fill("Lucía")
    page.locator("#auth-email").fill("lucia@example.com")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-terms").check()
    page.locator("#auth-register button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("se guardaron en tu cuenta")
    page.wait_for_load_state("networkidle")
    # A fresh browser profile: the lists and the currency come from the account.
    page.context.clear_cookies()
    page.evaluate("localStorage.clear()")
    page.goto(live_server)
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="login"]').click()
    page.locator("#auth-email").fill("lucia@example.com")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-login button[type=submit]").click()
    expect(page.locator("#cur")).to_have_value("UYU")
    page.locator('[data-g="Deseados"]').click()
    expect(page.locator("#wlv")).to_contain_text("Antes de la cuenta")
    expect(page.locator("#wlv")).to_contain_text("Synthetic Test Dragon")
    page.locator("#account-button").click()
    page.locator("#account-menu [data-auth-logout]").click()
    page.locator('[data-g="Deseados"]').click()
    expect(page.locator("#wlv")).not_to_contain_text("Antes de la cuenta")
    assert not errors


def test_card_address_and_legal_pages(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{live_server}/?tab=Todas")
    page.locator("#list [data-catalog-card]").first.click()
    expect(page).to_have_url(re.compile(r"/carta/[0-9a-f-]{36}"))
    address = page.url
    # The card's own address opens the card directly, with its name in the title.
    page.goto(address)
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    expect(page).to_have_title(re.compile("Synthetic Test Dragon"))
    page.keyboard.press("Escape")
    expect(page).not_to_have_url(re.compile("/carta/"))
    page.locator('.site-footer a[href="/privacidad"]').click()
    expect(page.locator("h1")).to_have_text("Política de privacidad")
    page.goto(f"{live_server}/pagina-inventada")
    expect(page.locator("h1")).to_have_text("Esta página no existe")
    assert not errors


def test_admin_panel_for_admin_accounts(live_server, browser_page, factory):
    from sqlalchemy import select

    from app.models import User

    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="register"]').click()
    page.locator("#auth-name").fill("Admin")
    page.locator("#auth-email").fill("admin@example.com")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-terms").check()
    page.locator("#auth-register button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("Cuenta creada")
    page.locator("#account-button").click()
    expect(page.locator('#account-menu [data-go="Admin"]')).to_have_count(0)
    with factory.begin() as session:
        session.scalar(select(User).where(User.email == "admin@example.com")).role = "admin"
    page.reload()
    page.locator("#account-button").click()
    # The menu fills in the admin entry as soon as the account is known.
    page.locator('#account-menu [data-go="Admin"]').click()
    expect(page.locator("#admv .admin-stats")).to_contain_text("Cuentas")
    expect(page.locator("#admin-users")).to_contain_text("admin@example.com")
    page.locator("#admin-search").fill("nadie")
    expect(page.locator("#admin-users")).to_contain_text("Ninguna cuenta coincide")
    assert not errors


def test_email_links_confirm_and_reset(live_server, browser_page, monkeypatch):
    sent = []
    monkeypatch.setattr("app.services.mail.send", lambda to, subject, body: sent.append(body))
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="register"]').click()
    page.locator("#auth-name").fill("Sofía")
    page.locator("#auth-email").fill("sofia@example.com")
    page.locator("#auth-password").fill("una frase larga de prueba")
    page.locator("#auth-terms").check()
    page.locator("#auth-register button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("Cuenta creada")
    page.locator("#account-button").click()
    expect(page.locator("#account-menu")).to_contain_text("sin confirmar")
    page.keyboard.press("Escape")
    confirm = re.search(r"/verificar\?token=[\w-]+", sent[-1]).group(0)
    page.goto(live_server + confirm)
    expect(page.locator("#authv")).to_contain_text("Correo confirmado")
    assert "token=" not in page.url
    page.locator("#account-button").click()
    expect(page.locator("#account-menu")).not_to_contain_text("sin confirmar")
    page.locator("#account-menu [data-auth-logout]").click()
    page.locator("#account-button").click()
    page.locator('#account-menu [data-auth-mode="login"]').click()
    page.locator('#authv [data-auth-mode="forgot"]').click()
    page.locator("#auth-email").fill("sofia@example.com")
    page.locator("#auth-forgot button[type=submit]").click()
    expect(page.locator("#authv")).to_contain_text("te enviamos un enlace")
    reset = re.search(r"/restablecer\?token=[\w-]+", sent[-1]).group(0)
    page.goto(live_server + reset)
    page.locator("#auth-password").fill("otra frase larga nueva")
    page.locator("#auth-reset button[type=submit]").click()
    expect(page.locator("#authv")).to_contain_text("Contraseña cambiada")
    page.locator("#auth-email").fill("sofia@example.com")
    page.locator("#auth-password").fill("otra frase larga nueva")
    page.locator("#auth-login button[type=submit]").click()
    expect(page.locator("#ts")).to_contain_text("Hola, Sofía")
    assert not errors


def test_launch_checklist(live_server, browser_page, factory):
    from sqlalchemy import select

    from app.models import UsageCount

    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    # The call to action is visible without scrolling, on a laptop and a phone.
    for width, height in [(1280, 720), (390, 740)]:
        page.set_viewport_size({"width": width, "height": height})
        box = page.locator(".hero2 .btn").first.bounding_box()
        assert box and box["y"] + box["height"] <= height
    page.set_viewport_size({"width": 1280, "height": 900})
    expect(page.locator("h1")).to_have_count(1)
    assert page.locator('link[rel="icon"][type="image/svg+xml"]').count() == 1
    assert page.locator('meta[property="og:image"]').get_attribute("content").startswith("http")
    page.locator('[data-g="Trampa"]').click()
    expect(page).to_have_title(re.compile("^Trampas"))
    assert "contraefecto" in page.locator('meta[name="description"]').get_attribute("content")
    page.locator('[data-g="Todas"]').click()
    expect(page.locator("#list [data-catalog-card]").first).to_be_visible()
    # Every image has a text alternative.
    assert page.locator("img:not([alt])").count() == 0
    page.locator("#list [data-catalog-card]").first.click()
    expect(page).to_have_title(re.compile("Synthetic Test Dragon"))
    page.wait_for_load_state("networkidle")
    with factory() as session:
        keys = {row.key for row in session.scalars(select(UsageCount))}
    assert {"tab:Inicio", "tab:Trampa", "carta"} <= keys
    assert not errors


def test_dialog_keeps_and_returns_focus(live_server, browser_page):
    page = browser_page
    page.goto(f"{live_server}/?tab=Todas")
    row = page.locator("#list [data-catalog-card]").first
    row.focus()
    page.keyboard.press("Enter")
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    expect(page.locator("#md .box")).to_be_focused()
    for _ in range(40):
        page.keyboard.press("Tab")
        assert page.evaluate("document.getElementById('md').contains(document.activeElement)")
    page.keyboard.press("Escape")
    expect(page.locator("#list [data-catalog-card]").first).to_be_focused()


def test_search_suggestions_open_a_card(live_server, browser_page):
    page = browser_page
    page.goto(live_server)
    search = page.locator("#q")
    search.press_sequentially("dragon synth", delay=20)
    option = page.locator("#q-suggest [role=option]").first
    expect(option).to_contain_text("Synthetic Test Dragon")
    expect(search).to_have_attribute("aria-expanded", "true")
    # Escape closes the list and keeps the text and the results.
    page.keyboard.press("Escape")
    expect(page.locator("#q-suggest")).to_be_hidden()
    expect(search).to_have_value("dragon synth")
    search.press("Backspace")
    search.press_sequentially("h")
    expect(option).to_be_visible()
    page.keyboard.press("ArrowDown")
    expect(option).to_have_attribute("aria-selected", "true")
    page.keyboard.press("Enter")
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    expect(page.locator("#q-suggest")).to_be_hidden()


def test_phone_layout(live_server, browser_page):
    """At 360 px: nothing wider than the screen, compact header, filters behind a button."""
    page = browser_page
    page.set_viewport_size({"width": 360, "height": 740})
    page.goto(f"{live_server}/?tab=Wantlists")
    # The current tab is scrolled into view in the one-row tab strip.
    current = page.locator('#tabs [aria-pressed="true"]')
    box = current.bounding_box()
    assert box and box["x"] >= 0 and box["x"] + box["width"] <= 360
    page.locator('[data-g="Todas"]').click()
    expect(page.locator("#list [data-catalog-card]").first).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth") <= 360
    header = page.locator("header").bounding_box()
    assert header and header["height"] < 200
    for selector in ["#account-button", "#cb", "#cur"]:
        item = page.locator(selector).bounding_box()
        assert item and item["x"] + item["width"] <= 360, selector
    # Filters wait behind one button; the order stays visible.
    expect(page.locator("#rar")).to_be_hidden()
    expect(page.locator("#srt")).to_be_visible()
    page.locator(".filters-toggle").click()
    expect(page.locator("#rar")).to_be_visible()
    # The header slides away while scrolling down and comes back on the way up.
    page.evaluate("document.body.style.paddingBottom = '3000px'")
    page.mouse.wheel(0, 800)
    expect(page.locator("header")).to_have_class(re.compile("tucked"))
    page.mouse.wheel(0, -300)
    expect(page.locator("header")).not_to_have_class(re.compile("tucked"))
    # A card covers the whole screen, header included.
    page.evaluate("window.scrollTo(0, 0)")
    page.locator("#list [data-catalog-card]").first.click()
    expect(page.locator("#mb")).to_contain_text("Synthetic official test text.")
    assert page.evaluate("document.documentElement.scrollWidth") <= 360
    assert page.locator("#md .box").bounding_box()["y"] < 60


def test_rarity_filter_grouped_by_family(live_server, browser_page):
    page = browser_page
    page.goto(f"{live_server}/?tab=Todas")
    expect(page.locator("#list [data-catalog-card]").first).to_be_visible()
    basic = page.locator('#rar optgroup[label="Básicas"] option')
    expect(basic).to_have_text(["Super Rare", "Ultra Rare"])
    page.locator("#rar").select_option("Super Rare")
    page.locator("#list [data-catalog-card]").first.click()
    # The card opens on the printing of the rarity being looked for.
    expect(page.locator(".card-detail .rr").first).to_have_text("Super Rare")
    expect(page.locator(".card-detail .rr").first).to_have_attribute("data-tone", "super")


def test_shopping_wizard_plans_by_shipments_or_price(live_server, browser_page):
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{live_server}/?tab=Deseados")
    # The plan itself, with offers made up for the test.
    plans = page.evaluate(
        """async () => {
            const { planPurchase } = await import("/frontend/js/shopping-wizard.js");
            const x = { id: "x", name: "X", quantity: 1 }, y = { id: "y", name: "Y", quantity: 1 };
            const z = { id: "z", name: "Z", quantity: 2 };
            const offer = (id, seller, price, available = 1) => ({ id, seller, price, available });
            const candidates = [
                { want: x, offers: [offer(1, "A", 1), offer(2, "B", 0.9)] },
                { want: y, offers: [offer(3, "A", 1), offer(4, "C", 0.9)] },
                { want: z, offers: [offer(5, "A", 3)], reason: "" },
            ];
            const shipping = { perSeller: 0.05, freeFrom: 25 };
            const result = (priority) => {
                const plan = planPurchase(candidates, { priority, shipping });
                return { sellers: plan.sellers.map((group) => group.seller).sort(), total: plan.total,
                         missing: plan.missing.map((item) => item.reason) };
            };
            return { shipments: result("shipments"), price: result("price") };
        }"""
    )
    assert plans["shipments"]["sellers"] == ["A"]
    assert plans["price"]["sellers"] == ["A", "B", "C"]
    assert plans["price"]["total"] < plans["shipments"]["total"]
    assert plans["shipments"]["missing"] == ["Solo se encontraron 1 de 2"]
    # With a list of cards the demo store sells.
    items = [
        {
            "id": f"i{index}",
            "cardId": f"00000000-0000-0000-0000-00000000000{index}",
            "name": name,
            "market": "TCG",
            "cardType": "Monster",
            "subtypes": [],
            "printingId": None,
            "code": None,
            "setName": None,
            "rarity": None,
            "language": "",
            "edition": "",
            "quantity": 2,
            "addedAt": "2026-10-24T00:00:00Z",
        }
        for index, name in enumerate(["Dark Magician", "Mirror Force", "Kuriboh", "No Existe"])
    ]
    state = {
        "lists": [{"id": "L1", "name": "Mazo", "items": items, "createdAt": "2026-10-24T00:00:00Z"}]
    }
    page.evaluate("state => localStorage.setItem('cm_wantlists_v1', JSON.stringify(state))", state)
    page.reload()
    page.locator("[data-wz-run]").click()
    summary = page.locator(".wz-summary")
    expect(summary).to_contain_text("de 8 cartas")
    expect(page.locator(".wz-missing")).to_contain_text("No Existe")
    page.locator('[data-wz-priority="price"]').click()
    expect(page.locator('[data-wz-priority="price"]')).to_have_attribute("aria-checked", "true")
    found = int(summary.inner_text().split(" de ")[0])
    page.locator('[data-wz-cart="all"]').click()
    expect(page.locator("#cc")).to_have_text(str(found))
    assert not errors


def test_latest_set_banner_and_set_page(live_server, browser_page, factory, record):
    from datetime import date

    from app.schemas.ingestion import PrintingInput
    from app.services.ingestion import IngestionService

    # The demo store sells boxes and packs of a set with this name.
    copy = record.model_copy(
        update={
            "konami_id": 994001,
            "external_id": "994001",
            "passcode": "99400100",
            "printings": [
                PrintingInput(
                    code="CRFR-EN001",
                    set_key="Crimson Frontier",
                    set_name="Crimson Frontier",
                    language="en",
                    market="TCG",
                    set_release_date=date(2026, 9, 12),
                )
            ],
        },
        deep=True,
    )
    with factory.begin() as session:
        IngestionService(session).ingest(copy)
    page = browser_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(live_server)
    banner = page.locator(".promo a")
    expect(banner).to_contain_text("Crimson Frontier")
    banner.click()
    expect(page).to_have_url(re.compile(r"/set/[0-9a-f-]{36}$"))
    expect(page.locator(".scope-head h2")).to_have_text("Crimson Frontier")
    expect(page.locator(".scope-products")).to_contain_text("Caja sellada Crimson Frontier")
    expect(page.locator("#list [data-catalog-card]")).to_have_count(1)
    expect(page.locator(".promo")).to_have_count(0)
    # From the card, its set name opens the set page again.
    page.locator("#list [data-catalog-card]").first.click()
    page.locator('.card-detail [data-scope="set"]').click()
    expect(page.locator("#md")).not_to_have_class(re.compile("on"))
    expect(page.locator(".scope-head h2")).to_have_text("Crimson Frontier")
    # A tab leaves the set page; the banner can be closed for good.
    page.locator('[data-g="Inicio"]').click()
    expect(page).to_have_url(re.compile(r"/$"))
    page.locator("[data-promo-close]").click()
    page.reload()
    expect(page.locator("#home h1")).to_be_visible()
    expect(page.locator(".promo")).to_have_count(0)
    assert not errors
