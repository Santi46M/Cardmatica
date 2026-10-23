import { countItems, listCount } from "./wantlists.js";
import { readJson, writeJson } from "./storage.js";

const h = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])
    );

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

const sells = (role) => role === "seller" || role === "both";

function summaryHtml() {
    if (!profile) return "";
    const role = ROLES.find(([value]) => value === profile.role)?.[1] || "";
    return `<div class="gl pnl profile-card"><div>${window.flag ? window.flag(profile.country) : ""}<b>${h(
        profile.name
    )}</b> · ${h(role)}${
        profile.store ? ` · Tienda <b>${h(profile.store)}</b>` : ""
    }</div><small>${h(profile.address)}, ${h(profile.country)} · ${h(profile.phone)}</small><small>Pagos aceptados: ${h(
        profile.payments.join(", ")
    )}</small></div>`;
}

export function renderProfile(container) {
    const value = profile || { role: "buyer", country: "Uruguay", payments: [] };
    container.innerHTML = `<h3>Mi perfil</h3>${summaryHtml()}<form class="gl pnl" id="pf-form" novalidate><div class="fm"><label>Quiero registrarme como<select id="pf-role">${ROLES.map(
        ([key, label]) => `<option value="${key}"${value.role === key ? " selected" : ""}>${label}</option>`
    ).join("")}</select></label><label>Nombre completo<input id="pf-name" autocomplete="name" maxlength="120" value="${h(
        value.name
    )}"></label><label id="pf-store-field"${sells(value.role) ? "" : " hidden"}>Nombre de la tienda<input id="pf-store" autocomplete="organization" maxlength="80" value="${h(
        value.store
    )}"></label><label>País<select id="pf-country" autocomplete="country-name">${COUNTRIES.map(
        (country) => `<option${value.country === country ? " selected" : ""}>${country}</option>`
    ).join("")}</select></label><label class="full">Dirección<input id="pf-address" autocomplete="street-address" maxlength="200" value="${h(
        value.address
    )}"></label><label>Teléfono<input id="pf-phone" type="tel" autocomplete="tel" maxlength="30" value="${h(
        value.phone
    )}"></label><fieldset class="full"><legend>Métodos de pago</legend><div class="chk">${PAYMENTS.map(
        (method) =>
            `<label><input type="checkbox" name="pf-payment" value="${h(method)}"${
                value.payments.includes(method) ? " checked" : ""
            }> ${h(method)}</label>`
    ).join("")}</div></fieldset></div><p id="pf-error" class="warn" role="alert" hidden></p><p><button class="btn" type="submit">Guardar perfil</button></p><small>Por ahora el perfil se guarda solo en este navegador: todavía no hay cuentas en el servidor, y un perfil de vendedor aún no publica una tienda.</small></form><div class="gl pnl" style="margin-top:12px"><b>Wantlists</b><small>${listCount()} ${
        listCount() === 1 ? "lista" : "listas"
    } · ${countItems()} cartas</small><p><button class="btn s" data-go="Wantlists">Gestionar wantlists</button></p></div>`;
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
    if (!data.name) return ["pf-name", "Escribe tu nombre completo."];
    if (sells(data.role) && !data.store) return ["pf-store", "Escribe el nombre de tu tienda."];
    if (!data.address) return ["pf-address", "Escribe tu dirección para los envíos."];
    if (data.phone.replace(/\D/g, "").length < 6)
        return ["pf-phone", "El teléfono debe tener al menos 6 dígitos."];
    if (!data.payments.length) return [null, "Elige al menos un método de pago."];
    return null;
}

export function installProfile({ panel }) {
    document.addEventListener("submit", (event) => {
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
        profile = data;
        if (!writeJson(KEY, profile)) {
            message.textContent = "Tu navegador no permite guardar datos en este sitio.";
            message.hidden = false;
            return;
        }
        window.toast?.("Perfil guardado");
        renderProfile(panel());
    });
    document.addEventListener("change", (event) => {
        if (event.target.id === "pf-role")
            document.getElementById("pf-store-field").hidden = !sells(event.target.value);
    });
}
