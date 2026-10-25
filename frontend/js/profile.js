import { escapeHtml } from "./html.js";
import { lang, t } from "./lang.js";
import { countItems, listCount } from "./wantlists.js";
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
    return `<section class="gl pnl" id="pf-prefs"><b>${t("Personalización")}</b><div class="fm"><label>${t(
        "Idioma"
    )}<select class="lang-select" id="pf-pref-language">${languages}</select></label><label>${t(
        "Moneda"
    )}<select id="pf-pref-currency">${currencies}</select></label><label>${t("Mercado")}<select id="pf-pref-market">${option(
        "TCG",
        t("TCG (cartas occidentales)"),
        window.market
    )}${option("OCG", t("OCG (cartas asiáticas)"), window.market)}</select></label><label>${t(
        "Vista del catálogo"
    )}<select id="pf-pref-view">${option("list", t("Lista"), view)}${option(
        "grid",
        t("Cuadrícula"),
        view
    )}</select></label></div><small>${t(
        currentUser() ? "Se aplican al instante y se guardan en tu cuenta." : "Se aplican al instante y se guardan en este navegador."
    )}</small></section>`;
}

const sells = (role) => role === "seller" || role === "both";

function summaryHtml() {
    if (!profile) return "";
    const role = t(ROLES.find(([value]) => value === profile.role)?.[1] || "");
    return `<div class="gl pnl profile-card"><div>${window.flag ? window.flag(profile.country) : ""}<b>${h(
        profile.name
    )}</b> · ${h(role)}${
        profile.store ? ` · ${t("Tienda")} <b>${h(profile.store)}</b>` : ""
    }</div><small>${h(profile.address)}, ${h(t(profile.country))} · ${h(profile.phone)}</small><small>${h(
        t("Pagos aceptados: {methods}", { methods: profile.payments.map((method) => t(method)).join(", ") })
    )}</small></div>`;
}

export function renderProfile(container) {
    const value = profile || { role: "buyer", country: "Uruguay", payments: [] };
    container.innerHTML = `<h3>${t("Mi perfil")}</h3>${summaryHtml()}<form class="gl pnl" id="pf-form" novalidate><div class="fm"><label>${t(
        "Quiero registrarme como"
    )}<select id="pf-role">${ROLES.map(
        ([key, label]) => `<option value="${key}"${value.role === key ? " selected" : ""}>${t(label)}</option>`
    ).join("")}</select></label><label>${t("Nombre completo")}<input id="pf-name" autocomplete="name" maxlength="120" value="${h(
        value.name
    )}"></label><label id="pf-store-field"${sells(value.role) ? "" : " hidden"}>${t("Nombre de la tienda")}<input id="pf-store" autocomplete="organization" maxlength="80" value="${h(
        value.store
    )}"></label><label>${t("País")}<select id="pf-country" autocomplete="country-name">${COUNTRIES.map(
        (country) =>
            `<option value="${country}"${value.country === country ? " selected" : ""}>${t(country)}</option>`
    ).join("")}</select></label><label class="full">${t("Dirección")}<input id="pf-address" autocomplete="street-address" maxlength="200" value="${h(
        value.address
    )}"></label><label>${t("Teléfono")}<input id="pf-phone" type="tel" autocomplete="tel" maxlength="30" value="${h(
        value.phone
    )}"></label><fieldset class="full"><legend>${t("Métodos de pago")}</legend><div class="chk">${PAYMENTS.map(
        (method) =>
            `<label><input type="checkbox" name="pf-payment" value="${h(method)}"${
                value.payments.includes(method) ? " checked" : ""
            }> ${h(t(method))}</label>`
    ).join("")}</div></fieldset></div><p id="pf-error" class="warn" role="alert" hidden></p><p><button class="btn" type="submit">${t(
        "Guardar perfil"
    )}</button></p><small>${t(
        currentUser()
            ? "El perfil se guarda en tu cuenta. Un perfil de vendedor todavía no publica una tienda."
            : "Sin sesión iniciada, el perfil se guarda solo en este navegador. Inicia sesión para guardarlo en tu cuenta."
    )}</small></form><div class="gl pnl" style="margin-top:12px"><b>${t("Listas de deseados")}</b><small>${t(
        listCount() === 1 ? "{count} lista" : "{count} listas",
        { count: listCount() }
    )} · ${t("{count} cartas", { count: countItems() })}</small><p><button class="btn s" data-go="Deseados">${t(
        "Ver mis listas"
    )}</button></p></div>${preferencesHtml()}`;
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
        payments: [...document.querySelectorAll('input[name="pf-payment"]:checked')].map(
            (input) => input.value
        )
    };
}

function problem(data) {
    if (!data.name) return ["pf-name", t("Escribe tu nombre completo.")];
    if (sells(data.role) && !data.store) return ["pf-store", t("Escribe el nombre de tu tienda.")];
    if (!data.address) return ["pf-address", t("Escribe tu dirección para los envíos.")];
    if (data.phone.replace(/\D/g, "").length < 6)
        return ["pf-phone", t("El teléfono debe tener al menos 6 dígitos.")];
    if (!data.payments.length) return [null, t("Elige al menos un método de pago.")];
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
        if (event.target.id === "pf-role")
            document.getElementById("pf-store-field").hidden = !sells(event.target.value);
    });
}
