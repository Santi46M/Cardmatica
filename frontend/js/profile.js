// "Mi perfil" and "Personalización": the person's details and preferences, in
// the account when signed in and in this browser otherwise.
import { escapeHtml, html } from "./html.js";
import { lang, t } from "./lang.js";
import { countItems, listCount } from "./wantlists.js";
import { accountNavHtml } from "./account-nav.js";
import { stockTotals } from "./market.js";
import { currentUser } from "./auth.js";
import { request } from "./session-api.js";
import { readJson, writeJson } from "./storage.js";

const h = escapeHtml;

const KEY = "cm_profile_v1";
const ROLES = [
    ["buyer", "Comprador"],
    ["seller", "Vendedor"],
    ["both", "Comprador y vendedor"]
];
const COUNTRIES = ["Argentina", "Bolivia", "Brasil", "Paraguay", "Uruguay"];
const PAYMENTS = [
    "Transferencia bancaria",
    "Mercado Pago",
    "PIX",
    "Efectivo en mano",
    "PayPal",
    "Tarjeta de crédito o débito"
];
let profile = readJson(KEY, null);

export const ROLE_LABELS = Object.fromEntries(ROLES);

const ACCOUNT = "/api/v1/account";

// The saved profile, or null before the first save. The account menu reads it.
export function currentProfile() {
    return profile;
}

// "Personalización": preferences that already exist elsewhere on the page,
// gathered here. Each control drives the original one, so both stay in sync.
function preferencesHtml() {
    const view = readJson("cm_view", "list");
    const currencies = window.currencyOptions?.(window.currency) || "";
    const option = (value, label, current) =>
        `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
    const languages = window.I18N.languages.map(([code, name]) => option(code, name, lang)).join("");
    // The markets of the game on screen (frontend/games.js).
    const markets = window.GAMES[window.game].markets
        .map((item) => option(item.code, `${t(item.name)} (${t(item.title)})`, window.market))
        .join("");
    const views = option("list", t("Lista"), view) + option("grid", t("Cuadrícula"), view);
    const where = currentUser()
        ? "Se aplican al instante y se guardan en tu cuenta."
        : "Se aplican al instante y se guardan en este navegador.";
    return html`
        <section class="gl pnl" id="pf-prefs">
            <b>${t("Personalización")}</b>
            <div class="fm">
                <label>${t("Idioma")}<select class="lang-select" id="pf-pref-language">${languages}</select></label>
                <label>${t("Moneda")}<select id="pf-pref-currency">${currencies}</select></label>
                <label>${t("Mercado")}<select id="pf-pref-market">${markets}</select></label>
                <label>${t("Vista del catálogo")}<select id="pf-pref-view">${views}</select></label>
            </div>
            <small>${t(where)}</small>
        </section>`;
}

const sells = (role) => role === "seller" || role === "both";

// ---- The account's card -----------------------------------------------------
// "Mi perfil" opens with the person as a trading card of their own: the
// initials as its art, the role and country as its type line, and the two
// numbers that matter as its stats (items and units for a seller, lists and
// cards for a buyer). Framed in the colours of the game on screen.

function initials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words.at(-1)[0] : name.slice(0, 2)).toUpperCase() || "?";
}

function memberSince(user) {
    const date = new Date(user.created_at);
    return date.toLocaleDateString(window.I18N.locale, { month: "long", year: "numeric" });
}

function cardStatsHtml(role) {
    const stat = (label, id, value) =>
        `<span><small>${t(label)}</small><b id="${id}">${value}</b></span>`;
    // A seller's figures arrive with their stock (fillStock); without an account there is none.
    const pending = currentUser() ? "…" : "—";
    return sells(role)
        ? stat("Artículos", "pf-stat-items", pending) + stat("Unidades", "pf-stat-units", pending)
        : stat("Listas", "pf-stat-lists", listCount()) + stat("Cartas buscadas", "pf-stat-wanted", countItems());
}

function identityHtml(value) {
    const user = currentUser();
    const [from, to] = window.GAMES[window.game]?.colors || ["#2a6f97", "#6fd3f2"];
    const name = value.name || user?.display_name || t("Invitado");
    const role = t(ROLE_LABELS[value.role] || "");
    const country = value.country ? `${window.flag?.(value.country) || ""}${h(t(value.country))}` : "";
    const store = sells(value.role) && value.store ? t("Tienda: {store}", { store: h(value.store) }) : "";
    const facts = user
        ? [
              t("Miembro desde {date}", { date: memberSince(user) }),
              user.email_verified ? `✓ ${t("Correo confirmado")}` : t("Correo sin confirmar"),
              store
          ]
        : [store, t("Sin sesión iniciada: lo que guardes queda en este navegador.")];
    const actions = user
        ? sells(value.role)
            ? `<button class="btn s" data-real-seller="${h(user.id)}">${t("Ver mi tienda pública")}</button>`
            : ""
        : `<button class="btn s" data-go="Acceso" data-auth-mode="login">${t("Iniciar sesión")}</button>
           <button class="ghost s" data-go="Acceso" data-auth-mode="register">${t("Crear cuenta")}</button>`;
    return html`
        <aside class="acct-side">
            <div class="idc" style="--idc-from:${from};--idc-to:${to}">
                <div class="idc-name"><b>${h(name)}</b></div>
                <div class="idc-art" aria-hidden="true">${h(initials(name))}</div>
                <div class="idc-type">${h(role)}${country ? ` · ${country}` : ""}</div>
                <div class="idc-text">${facts.filter(Boolean).map((fact) => `<p>${fact}</p>`).join("")}</div>
                <div class="idc-stats">${cardStatsHtml(value.role)}</div>
            </div>
            <div class="acct-actions">${actions}</div>
        </aside>`;
}

// ---- A seller's stock at a glance: what the card does not say -------------

function tilesHtml(role) {
    if (!sells(role)) return "";
    const tile = (label, id) =>
        html`<button class="gl acct-tile" data-go="Stock"><small>${t(label)}</small><b id="${id}">…</b></button>`;
    return `<div class="acct-tiles">${tile("Valor del stock", "pf-tile-value")}${tile("Con foto", "pf-tile-photos")}</div>`;
}

// A seller's figures come from their stock (backend/app/api/listings.py).
async function fillStock(role) {
    if (!currentUser() || !sells(role)) return;
    let totals;
    try {
        totals = stockTotals(await request("/api/v1/listings/mine"));
    } catch {
        return;
    }
    const put = (id, value) => {
        const slot = document.getElementById(id);
        if (slot) slot.textContent = value;
    };
    put("pf-stat-items", totals.items);
    put("pf-stat-units", totals.units);
    put("pf-tile-value", window.formatPrice(totals.value));
    put("pf-tile-photos", `${totals.photos} / ${totals.items}`);
}

const selected = (yes) => (yes ? " selected" : "");

function formHtml(value) {
    const roles = ROLES.map(([key, label]) => `<option value="${key}"${selected(value.role === key)}>${t(label)}</option>`).join("");
    const countries = COUNTRIES.map(
        (country) => `<option value="${country}"${selected(value.country === country)}>${t(country)}</option>`
    ).join("");
    const payments = PAYMENTS.map(
        (method) =>
            `<label><input type="checkbox" name="pf-payment" value="${h(method)}"${value.payments.includes(method) ? " checked" : ""}> ${h(t(method))}</label>`
    ).join("");
    const sellerOnly = sells(value.role) ? "" : " hidden";
    const where = t(
        currentUser()
            ? "Solo pedimos lo necesario: la dirección y el teléfono, para los envíos; los métodos de pago, si vendes."
            : "Sin sesión iniciada, el perfil se guarda solo en este navegador. Inicia sesión para guardarlo en tu cuenta."
    );
    return html`
        <form class="gl pnl" id="pf-form" novalidate>
            <b>${t("Datos de la cuenta")}</b>
            <div class="fm">
                <label>${t("Quiero")}<select id="pf-role">${roles}</select></label>
                <label>${t("Nombre completo")}<input id="pf-name" autocomplete="name" maxlength="120" value="${h(value.name)}"></label>
                <label id="pf-store-field"${sellerOnly}>${t("Nombre de la tienda")}<input id="pf-store" autocomplete="organization" maxlength="80" value="${h(value.store)}"></label>
                <label>${t("País")}<select id="pf-country" autocomplete="country-name">${countries}</select></label>
                <label>${t("Teléfono (opcional)")}<input id="pf-phone" type="tel" autocomplete="tel" maxlength="30" value="${h(value.phone)}"></label>
                <label class="full">${t("Dirección (opcional, para envíos)")}<input id="pf-address" autocomplete="street-address" maxlength="200" value="${h(value.address)}"></label>
                <fieldset class="full" id="pf-payments"${sellerOnly}>
                    <legend>${t("Métodos de pago que aceptas")}</legend>
                    <div class="chk">${payments}</div>
                </fieldset>
            </div>
            <p id="pf-error" class="warn" role="alert" hidden></p>
            <div class="acct-save">
                <button class="btn" type="submit">${t("Guardar perfil")}</button>
                <small>${where}</small>
            </div>
        </form>`;
}

export function renderProfile(container) {
    // Before the first save, what the server knows: a seller made by staff sells.
    const value = {
        role: currentUser()?.sells ? "seller" : "buyer",
        name: "",
        store: "",
        country: "Uruguay",
        address: "",
        phone: "",
        payments: [],
        ...Object.fromEntries(Object.entries(profile || {}).filter(([, field]) => field !== null && field !== ""))
    };
    container.innerHTML = html`
        <h3>${t("Mi perfil")}</h3>
        ${currentUser() ? accountNavHtml("Perfil", sells(value.role)) : ""}
        <div class="acct">
            ${identityHtml(value)}
            <div class="acct-main">
                ${tilesHtml(value.role)}
                ${formHtml(value)}
                ${preferencesHtml()}
            </div>
        </div>`;
    fillStock(value.role);
}

function read() {
    const field = (id) => document.getElementById(id).value.trim();
    return {
        role: field("pf-role"),
        name: field("pf-name"),
        store: sells(field("pf-role")) ? field("pf-store") : "",
        country: field("pf-country"),
        address: field("pf-address"),
        phone: field("pf-phone"),
        // A buyer's payment methods are not needed, so they are not sent.
        payments: sells(field("pf-role"))
            ? [...document.querySelectorAll('input[name="pf-payment"]:checked')].map((input) => input.value)
            : []
    };
}

function problem(data) {
    if (!data.name) return ["pf-name", t("Escribe tu nombre completo.")];
    if (sells(data.role) && !data.store) return ["pf-store", t("Escribe el nombre de tu tienda.")];
    if (data.phone && data.phone.replace(/\D/g, "").length < 6)
        return ["pf-phone", t("El teléfono debe tener al menos 6 dígitos.")];
    if (sells(data.role) && !data.payments.length) return [null, t("Elige al menos un método de pago.")];
    return null;
}

// Signed in, the profile lives in the account; otherwise in this browser.
async function saveProfile(data) {
    if (currentUser()) await request(`${ACCOUNT}/profile`, { method: "PUT", body: data });
    else if (!writeJson(KEY, data)) throw new Error(t("Tu navegador no permite guardar datos en este sitio."));
    profile = data;
}

// ---- Preferences: currency, market and catalogue view ------------------------

function currentPreferences() {
    return { currency: window.currency, market: window.market, view: readJson("cm_view", "list") };
}

// Applying the account's preferences changes the page controls; that must not
// send them back to the server.
let applying = false;

function applyPreferences(preferences) {
    applying = true;
    try {
        if (preferences.currency && preferences.currency !== window.currency) {
            const select = document.getElementById("cur");
            select.value = preferences.currency;
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (preferences.market && preferences.market !== window.market)
            document.querySelector(`[data-mk="${preferences.market}"]`)?.click();
        if (preferences.view && preferences.view !== readJson("cm_view", "list")) {
            writeJson("cm_view", preferences.view);
            document.dispatchEvent(new CustomEvent("cm:view", { detail: preferences.view }));
        }
    } finally {
        applying = false;
    }
}

let preferenceTimer;
function savePreferencesSoon() {
    if (applying || !currentUser()) return;
    clearTimeout(preferenceTimer);
    // The market button changes window.market after this click handler runs.
    preferenceTimer = setTimeout(() => {
        if (!currentUser()) return;
        request(`${ACCOUNT}/preferences`, { method: "PUT", body: currentPreferences() }).catch(() => {
            // Signing out meanwhile is not an error worth announcing.
            if (currentUser()) window.toast?.(t("No se pudieron guardar tus preferencias en la cuenta"));
        });
    }, 300);
}

// On sign-in: the account's data replaces the browser's. The first time, what
// the browser had is moved into the account so nothing is lost.
async function syncWithAccount(panel) {
    clearTimeout(preferenceTimer);
    if (!currentUser()) {
        profile = readJson(KEY, null);
    } else {
        try {
            const data = await request(ACCOUNT);
            const local = readJson(KEY, null);
            if (!data.profile && local) {
                await request(`${ACCOUNT}/profile`, { method: "PUT", body: local }).catch(() => null);
                data.profile = local;
            }
            profile = data.profile;
            const saved = Object.values(data.preferences).some(Boolean);
            if (saved) applyPreferences(data.preferences);
            // First sign-in: keep what this browser had chosen, right away.
            else await request(`${ACCOUNT}/preferences`, { method: "PUT", body: currentPreferences() });
        } catch {
            if (currentUser()) window.toast?.(t("No se pudo leer tu perfil de la cuenta"));
        }
    }
    document.dispatchEvent(new CustomEvent("cm:profile"));
    if (window.tab === "Perfil") renderProfile(panel());
}

export function installProfile({ panel }) {
    document.addEventListener("cm:account", () => syncWithAccount(panel));
    document.addEventListener("cm:view", savePreferencesSoon);
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-mk]")) savePreferencesSoon();
    });
    document.addEventListener("submit", async (event) => {
        if (event.target.id !== "pf-form") return;
        event.preventDefault();
        const data = read();
        const error = problem(data);
        const message = document.getElementById("pf-error");
        if (error) {
            message.textContent = error[1];
            message.hidden = false;
            if (error[0]) document.getElementById(error[0]).focus();
            return;
        }
        const button = event.target.querySelector("button[type=submit]");
        button.disabled = true;
        button.textContent = t("Guardando…");
        try {
            await saveProfile(data);
        } catch (failure) {
            message.textContent = failure.message;
            message.hidden = false;
            return;
        } finally {
            button.disabled = false;
            button.textContent = t("Guardar perfil");
        }
        window.toast?.(t(currentUser() ? "Perfil guardado en tu cuenta" : "Perfil guardado"));
        document.dispatchEvent(new CustomEvent("cm:profile"));
        renderProfile(panel());
    });
    document.addEventListener("change", (event) => {
        const { id, value } = event.target;
        if (id === "cur") savePreferencesSoon();
        if (id === "pf-pref-currency") {
            const select = document.getElementById("cur");
            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (id === "pf-pref-language") window.I18N.choose(value);
        if (id === "pf-pref-market") document.querySelector(`[data-mk="${value}"]`)?.click();
        if (id === "pf-pref-view") {
            writeJson("cm_view", value);
            document.dispatchEvent(new CustomEvent("cm:view", { detail: value }));
        }
        if (event.target.id === "pf-role") {
            document.getElementById("pf-store-field").hidden = !sells(event.target.value);
            document.getElementById("pf-payments").hidden = !sells(event.target.value);
        }
    });
}
