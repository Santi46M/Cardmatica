// "Mi stock": the cards a seller has for sale. A card is found by name or
// code, then its printing, condition, language, units and price are chosen;
// below, what is already on sale, to change or take off.
// Reads and writes /api/v1/listings (backend/app/api/listings.py); buyers see
// it under each card and in "Vendedores" (market.js).
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";
import { request } from "./session-api.js";
import { currentUser } from "./auth.js";
import { accountNavHtml } from "./account-nav.js";
import { currentProfile } from "./profile.js";
import { finishName } from "./catalog-view.js";
import { rarityBadge } from "./rarities.js";
import { LISTINGS, conditionHtml, finishText, forgetOffers, languageText, photoThumb, priceHtml } from "./market.js";

const h = escapeHtml;
const LANGUAGES = ["ES", "EN", "PT", "FR", "DE", "IT", "JP", "KO", "ZH"];
// The catalogue says "ja"; a seller says "JP", as Cardmarket does.
const FROM_CATALOGUE = { ja: "JP" };
const SEARCH_RESULTS = 8;
// Above this, in US dollars, a copy needs the seller's photo
// (PHOTO_FROM_USD in backend/app/services/listings.py).
const PHOTO_FROM_USD = 10;
// Photos are shrunk before sending: enough to see the copy, light to upload.
const PHOTO_SIDE = 1600;
const SEARCH_DELAY_MS = 250;

// The card being put on sale and its printings, while the form is open.
let chosen = null;
let panel = () => null;

// The profile, once read (it can just have changed); before, what the server said.
function sells() {
    const profile = currentProfile();
    return profile ? ["seller", "both"].includes(profile.role) : Boolean(currentUser()?.sells);
}

const plural = (count, one, many) => t(count === 1 ? one : many, { count });

const options = (items, current) =>
    items.map(([value, label]) => `<option value="${h(value)}"${value === current ? " selected" : ""}>${h(label)}</option>`).join("");

function conditionOptions() {
    return options(window.DEMO.conditions.map((item) => [item.code, `${item.code} · ${t(item.name)}`]), "NM");
}

function currencyOptions() {
    return options(window.CURRENCIES.map((item) => [item.code, item.code]), window.currency);
}

function languageOptions(current) {
    return options(LANGUAGES.map((code) => [code, languageText(code)]), current);
}

function printingLabel(printing) {
    return `${printing.code} · ${printing.set_name} · ${t(printing.rarity)}`;
}

function cardFieldsHtml() {
    if (!chosen) return "";
    const printing = chosen.printings[0];
    const finishes = printing?.finishes || [];
    const language = FROM_CATALOGUE[printing?.language] || (printing?.language || "en").toUpperCase();
    return html`
        <div class="fm">
            <label class="full">${t("Impresión")}
                <select id="st-printing" required>${options(chosen.printings.map((item) => [item.id, printingLabel(item)]), printing?.id)}</select>
            </label>
            <label id="st-finish-field"${finishes.length ? "" : " hidden"}>${t("Acabado")}
                <select id="st-finish">${options(finishes.map((finish) => [finish, finishName(finish)]), finishes[0])}</select>
            </label>
            <label>${t("Estado")}<select id="st-condition">${conditionOptions()}</select></label>
            <label>${t("Idioma")}<select id="st-language">${languageOptions(LANGUAGES.includes(language) ? language : "EN")}</select></label>
            <label>${t("Unidades")}<input id="st-quantity" type="number" min="1" max="9999" step="1" value="1" required></label>
            <label>${t("Precio por unidad")}
                <span class="st-price"><input id="st-price" type="number" min="0.01" step="0.01" inputmode="decimal" required><select id="st-currency" aria-label="${t("Moneda")}">${currencyOptions()}</select></span>
            </label>
            <label class="full">${t("Comentario (opcional)")}<input id="st-comment" maxlength="200" placeholder="${t("Ej.: firmada, con funda, primera edición")}"></label>
            <label class="full">${t("Foto de la carta")}
                <input id="st-photo" type="file" accept="image/png,image/jpeg,image/webp">
                <small id="st-photo-note">${photoNote(window.currency, 0)}</small>
            </label>
            <img id="st-photo-preview" class="st-photo-preview" alt="${t("Tu foto de la carta")}" hidden>
        </div>
        <p><button class="btn" type="submit">${t("Poner en venta")}</button> <button class="ghost" type="button" data-st-cancel>${t("Elegir otra carta")}</button></p>`;
}

// The rule in the seller's currency: "10 USD" is "≈ 460 UYU" in Uruguay.
function dollarsIn(currency) {
    const rate = (code) => window.CURRENCIES.find((item) => item.code === code)?.perEuro || 1;
    return (PHOTO_FROM_USD / rate("USD")) * rate(currency);
}

const needsPhoto = (price, currency) => Number(price) > dollarsIn(currency);

function photoNote(currency, price) {
    const limit = dollarsIn(currency);
    const decimals = window.CURRENCIES.find((item) => item.code === currency)?.decimals ?? 2;
    const amount = `${limit.toLocaleString(window.I18N.lang, { maximumFractionDigits: decimals })} ${currency}`;
    return needsPhoto(price, currency)
        ? t("Obligatoria: la carta vale más de {amount} (10 USD).", { amount })
        : t("Opcional hasta {amount} (10 USD); obligatoria por encima.", { amount });
}

// A photo from the phone or the computer, shrunk to JPEG for sending.
async function photoData(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
}

// The photo chosen in the form, ready to send.
let formPhoto = null;

function formHtml() {
    const picked = chosen
        ? html`<p class="st-chosen"><b>${h(chosen.card.name)}</b> <small>${plural(chosen.printings.length, "{count} impresión", "{count} impresiones")}</small></p>`
        : html`
            <label class="st-search">${t("Busca la carta por nombre o código")}
                <input id="st-q" type="search" autocomplete="off" placeholder="${t("Nombre, código, set o arquetipo")}">
            </label>
            <div id="st-results" class="st-results" role="list"></div>`;
    return html`
        <form class="gl pnl" id="st-form" novalidate>
            <b>${t("Añadir cartas a la venta")}</b>
            ${picked}
            ${cardFieldsHtml()}
            <p id="st-error" class="warn" role="alert" hidden></p>
        </form>`;
}

function rowHtml(listing) {
    const id = h(listing.id);
    return html`
        <tr>
            <td>
                <div class="st-card">
                    ${photoThumb(listing)}
                    <div>
                        <button class="lk" data-catalog-card="${h(listing.card_id)}">${h(listing.card_name)}</button>
                        <small>${rarityBadge(listing, listing.game)} ${h(listing.code)}${listing.comment ? ` · ${h(listing.comment)}` : ""}</small>
                        <label class="lk st-photo-change">${listing.photo_url ? t("Cambiar foto") : t("Añadir foto")}<input type="file" accept="image/png,image/jpeg,image/webp" data-st-photo="${id}" hidden></label>
                    </div>
                </div>
            </td>
            <td>${conditionHtml(listing.condition)} ${languageText(listing.language)}${finishText(listing.finish)}</td>
            <td class="num"><input class="st-edit" type="number" min="1" max="9999" step="1" value="${listing.quantity}" data-st-quantity="${id}" aria-label="${t("Unidades")}"></td>
            <td class="num">
                <span class="st-price"><input class="st-edit" type="number" min="0.01" step="0.01" value="${h(listing.price)}" data-st-amount="${id}" aria-label="${t("Precio por unidad")}"><small>${h(listing.currency)}</small></span>
                <small>≈ ${priceHtml(listing)}</small>
            </td>
            <td class="num st-actions">
                <button class="btn s" data-st-save="${id}">${t("Guardar")}</button>
                <button class="ghost s" data-st-remove="${id}">${t("Quitar")}</button>
            </td>
        </tr>`;
}

async function loadMine() {
    const slot = document.getElementById("st-mine");
    if (!slot) return;
    try {
        const rows = await request(`${LISTINGS}/mine`);
        const units = rows.reduce((sum, row) => sum + row.quantity, 0);
        document.getElementById("st-count").textContent = [
            plural(rows.length, "{count} artículo", "{count} artículos"),
            plural(units, "{count} unidad", "{count} unidades")
        ].join(" · ");
        slot.innerHTML = rows.length
            ? html`
                <table>
                    <thead>
                        <tr>
                            <th>${t("Carta")}</th>
                            <th>${t("Estado")}</th>
                            <th class="num">${t("Unidades")}</th>
                            <th class="num">${t("Precio")}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows.map(rowHtml).join("")}</tbody>
                </table>`
            : `<p class="empty">${t("Todavía no tienes cartas a la venta.")}</p>`;
    } catch (error) {
        slot.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

export function renderStock(container) {
    const user = currentUser();
    container.dataset.sells = String(Boolean(user) && sells());
    if (!user) {
        container.innerHTML = html`
            <h3>${t("Mi stock")}</h3>
            <div class="gl pnl">
                <p>${t("Inicia sesión con una cuenta de vendedor para poner cartas a la venta.")}</p>
                <p><button class="btn s" data-go="Acceso" data-auth-mode="login">${t("Iniciar sesión")}</button></p>
            </div>`;
        return;
    }
    if (!sells()) {
        container.innerHTML = html`
            <h3>${t("Mi stock")}</h3>
            <div class="gl pnl">
                <p>${t("Para vender, elige «Vendedor» o «Comprador y vendedor» en tu perfil.")}</p>
                <p><button class="btn s" data-go="Perfil">${t("Ir a mi perfil")}</button></p>
            </div>`;
        return;
    }
    const store = currentProfile()?.store || user.display_name;
    container.innerHTML = html`
        <h3>${t("Mi stock")} <small class="catalog-status">${h(store)}</small></h3>
        ${accountNavHtml("Stock", true)}
        <div id="st-form-slot">${formHtml()}</div>
        <section class="gl pnl">
            <b>${t("En venta")}</b> <small id="st-count"></small>
            <div class="wrap" id="st-mine"><p class="catalog-status">${t("Cargando…")}</p></div>
            <small>${t("Los compradores ven tus ofertas en cada carta y en «Vendedores», con el precio en su moneda.")}</small>
        </section>`;
    loadMine();
}

function redrawForm() {
    const slot = document.getElementById("st-form-slot");
    if (slot) slot.innerHTML = formHtml();
    document.getElementById(chosen ? "st-printing" : "st-q")?.focus();
}

function showError(message) {
    const box = document.getElementById("st-error");
    box.textContent = message;
    box.hidden = !message;
}

// ---- Finding the card ---------------------------------------------------------

let searchTimer;
let searchGeneration = 0;

async function search(text) {
    const results = document.getElementById("st-results");
    const generation = ++searchGeneration;
    if (text.length < 2) {
        results.innerHTML = "";
        return;
    }
    const params = new URLSearchParams({ q: text, game: window.game, page_size: SEARCH_RESULTS });
    try {
        const data = await request(`/api/v1/cards?${params}`);
        if (generation !== searchGeneration) return;
        results.innerHTML = data.items.length
            ? data.items
                  .map(
                      (card) =>
                          `<button type="button" class="ghost st-result" role="listitem" data-st-card="${h(card.id)}">${h(card.name)}<small>${plural(card.printing_count, "{count} impresión", "{count} impresiones")}</small></button>`
                  )
                  .join("")
            : `<p class="empty">${t("No hay cartas con ese nombre en este juego.")}</p>`;
    } catch (error) {
        results.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

async function choose(cardId) {
    try {
        const [card, printings] = await Promise.all([
            request(`/api/v1/cards/${cardId}?language=${window.I18N.lang}`),
            request(`/api/v1/cards/${cardId}/printings?page_size=100`)
        ]);
        chosen = { card, printings: printings.items };
        redrawForm();
    } catch (error) {
        window.toast?.(error.message);
    }
}

// ---- Putting on sale, changing, taking off -------------------------------------

async function submit(form) {
    const value = (id) => document.getElementById(id).value.trim();
    const finishField = document.getElementById("st-finish-field");
    const body = {
        printing_id: value("st-printing"),
        condition: value("st-condition"),
        language: value("st-language"),
        finish: finishField.hidden ? null : value("st-finish") || null,
        quantity: Number(value("st-quantity")),
        price: value("st-price"),
        currency: value("st-currency"),
        comment: value("st-comment") || null,
        photo: formPhoto
    };
    if (!(body.quantity >= 1)) return showError(t("Indica cuántas unidades vendes."));
    if (!(Number(body.price) > 0)) return showError(t("Indica el precio por unidad."));
    if (!body.photo && needsPhoto(body.price, body.currency))
        return showError(t("Esta carta vale más de 10 USD: añade una foto de la copia que vendes."));
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
        await request(LISTINGS, { method: "POST", body });
        forgetOffers();
        window.toast?.(t("Puesta en venta"));
        // The same card again is common (another condition or language).
        document.getElementById("st-quantity").value = 1;
        document.getElementById("st-price").value = "";
        document.getElementById("st-comment").value = "";
        clearFormPhoto();
        showError("");
        loadMine();
    } catch (error) {
        showError(error.message);
    } finally {
        button.disabled = false;
    }
}

async function save(id) {
    const quantity = Number(document.querySelector(`[data-st-quantity="${id}"]`).value);
    const price = document.querySelector(`[data-st-amount="${id}"]`).value;
    try {
        await request(`${LISTINGS}/${id}`, { method: "PATCH", body: { quantity, price } });
        forgetOffers();
        window.toast?.(t("Cambios guardados"));
        loadMine();
    } catch (error) {
        window.toast?.(error.message);
    }
}

// Taking off asks for a second click on the same button within a few seconds.
const CONFIRM_MS = 4000;

async function remove(button) {
    if (!button.dataset.armed) {
        button.dataset.armed = "1";
        const label = button.textContent;
        button.textContent = t("¿Seguro? Toca otra vez");
        setTimeout(() => {
            delete button.dataset.armed;
            button.textContent = label;
        }, CONFIRM_MS);
        return;
    }
    try {
        await request(`${LISTINGS}/${button.dataset.stRemove}`, { method: "DELETE" });
        forgetOffers();
        window.toast?.(t("Quitada de la venta"));
        loadMine();
    } catch (error) {
        window.toast?.(error.message);
    }
}

function clearFormPhoto() {
    formPhoto = null;
    document.getElementById("st-photo").value = "";
    document.getElementById("st-photo-preview").hidden = true;
}

async function pickFormPhoto(input) {
    const file = input.files[0];
    if (!file) return clearFormPhoto();
    try {
        formPhoto = await photoData(file);
        const preview = document.getElementById("st-photo-preview");
        preview.src = formPhoto;
        preview.hidden = false;
        showError("");
    } catch {
        clearFormPhoto();
        showError(t("No se pudo leer la foto"));
    }
}

async function replacePhoto(input) {
    const file = input.files[0];
    if (!file) return;
    try {
        const photo = await photoData(file);
        await request(`${LISTINGS}/${input.dataset.stPhoto}`, { method: "PATCH", body: { photo } });
        forgetOffers();
        window.toast?.(t("Foto guardada"));
        loadMine();
    } catch (error) {
        window.toast?.(error.message || t("No se pudo leer la foto"));
    }
}

function updatePhotoNote() {
    const note = document.getElementById("st-photo-note");
    if (note) note.textContent = photoNote(document.getElementById("st-currency").value, document.getElementById("st-price").value);
}

export function installStock({ panel: find }) {
    panel = find;
    document.addEventListener("input", (event) => {
        if (event.target.id === "st-price") updatePhotoNote();
        if (event.target.id !== "st-q") return;
        clearTimeout(searchTimer);
        const text = event.target.value.trim();
        searchTimer = setTimeout(() => search(text), SEARCH_DELAY_MS);
    });
    document.addEventListener("change", (event) => {
        if (event.target.id === "st-currency") updatePhotoNote();
        if (event.target.id === "st-photo") pickFormPhoto(event.target);
        if (event.target.dataset?.stPhoto) replacePhoto(event.target);
        if (event.target.id !== "st-printing") return;
        const printing = chosen?.printings.find((item) => item.id === event.target.value);
        const finishes = printing?.finishes || [];
        document.getElementById("st-finish-field").hidden = !finishes.length;
        document.getElementById("st-finish").innerHTML = options(finishes.map((finish) => [finish, finishName(finish)]), finishes[0]);
    });
    document.addEventListener("submit", (event) => {
        if (event.target.id !== "st-form") return;
        event.preventDefault();
        if (chosen) submit(event.target);
    });
    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-st-card], [data-st-cancel], [data-st-save], [data-st-remove]");
        if (!button) return;
        const { stCard, stSave, stRemove } = button.dataset;
        if (stCard) choose(stCard);
        else if (stSave) save(stSave);
        else if (stRemove) remove(button);
        else {
            chosen = null;
            formPhoto = null;
            redrawForm();
        }
    });
    // The profile arrives after the session, and can change: whether this
    // person may sell is drawn again when it does, not on every save.
    for (const name of ["cm:account", "cm:profile"])
        document.addEventListener(name, () => {
            const container = panel();
            if (container && container.dataset.sells !== String(Boolean(currentUser()) && sells()))
                renderStock(container);
        });
}
