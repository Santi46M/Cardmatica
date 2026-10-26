// Account menu: the round avatar at the top right and its dropdown, in the
// style of Cardmarket and TCGplayer. Entries that already work open their
// panel; the rest show what is coming next (see the roadmap) and are disabled.
import { escapeHtml, html } from "./html.js";
import { lang, t } from "./lang.js";
import { currentUser } from "./auth.js";
import { currentProfile, ROLE_LABELS } from "./profile.js";
import { countItems } from "./wantlists.js";

const h = escapeHtml;

// [label, data-go tab (null while not built yet), optional id to scroll to]
// As on Cardmarket: the account, what you buy, what you sell, then settings.
// What already works comes first in each section.
const SECTIONS = [
    [
        "Mi cuenta",
        [
            ["Mi perfil", "Perfil"],
            ["Personalización", "Perfil", "pf-prefs"],
            ["Seguridad e inicio de sesión", "Seguridad"],
            ["Mensajes", null]
        ]
    ],
    [
        "Compras",
        [
            ["Carrito", "Carrito"],
            ["Lista de deseados", "Deseados"],
            ["Asistente de compra", "Deseados", "wl-wizard"],
            ["Mis pedidos", null],
            ["Vendedores favoritos", null]
        ]
    ],
    [
        "Ventas",
        [
            ["Mi stock", null],
            ["Ventas y cobros", null]
        ]
    ],
    [
        "Configuración",
        [
            ["Pagos y saldo", null],
            ["Direcciones y envíos", null],
            ["Notificaciones por correo", null]
        ]
    ]
];

function initials(name) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    return words.length ? (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase() : "";
}

const PERSON_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';

// The account name wins over the profile kept in this browser.
function displayName() {
    return currentUser()?.display_name || currentProfile()?.name || "";
}

function avatarHtml() {
    const letters = initials(displayName());
    return letters ? `<span>${h(letters)}</span>` : PERSON_ICON;
}

function itemHtml([label, tab, anchor]) {
    if (!tab)
        return `<button role="menuitem" class="acc-item" disabled aria-disabled="true">${h(t(label))}<small>${t("Próximamente")}</small></button>`;
    const badge = tab === "Deseados" && countItems() ? `<small>${countItems()}</small>` : "";
    const scroll = anchor ? ` data-acc-scroll="${h(anchor)}"` : "";
    return `<button role="menuitem" class="acc-item" data-go="${h(tab)}"${scroll}>${h(t(label))}${badge}</button>`;
}

function whoHtml() {
    const user = currentUser();
    const profile = currentProfile();
    const store = profile?.store ? ` · ${h(profile.store)}` : "";
    if (user) {
        const unconfirmed = user.email_verified ? "" : ` · <span class="warn-text">${t("sin confirmar")}</span>`;
        return `<b>${h(user.display_name)}</b><small>${h(user.email)}${unconfirmed}${store}</small>`;
    }
    // Without an account, the profile kept in this browser still names the person.
    if (profile)
        return `<b>${h(profile.name)}</b><small>${h(t(ROLE_LABELS[profile.role] || ""))}${store} · ${t("sin cuenta")}</small>`;
    return `<b>${t("Invitado")}</b><small>${t("Inicia sesión o crea una cuenta")}</small>`;
}

// Signed out: the way in comes first. Signed in: the way out comes last.
function accessHtml() {
    if (currentUser())
        return `<div class="acc-section"><button role="menuitem" class="acc-item" data-auth-logout>${t("Cerrar sesión")}</button></div>`;
    return html`
        <div class="acc-access">
            <button role="menuitem" class="btn s acc-item-main" data-go="Acceso" data-auth-mode="login">${t("Iniciar sesión")}</button>
            <button role="menuitem" class="ghost acc-item-main" data-go="Acceso" data-auth-mode="register">${t("Crear cuenta")}</button>
        </div>`;
}

// Only administrators see the way into the panel.
function adminHtml() {
    if (currentUser()?.role !== "admin") return "";
    return sectionHtml(["Administración", [["Panel de administración", "Admin"]]]);
}

function sectionHtml([title, items]) {
    return html`
        <div class="acc-section" role="group" aria-label="${h(t(title))}">
            <span class="acc-title">${h(t(title))}</span>
            ${items.map(itemHtml).join("")}
        </div>`;
}

// The site's three languages, each written in itself (frontend/i18n.js).
function languageHtml() {
    const buttons = window.I18N.languages
        .map(
            ([code, name]) =>
                `<button role="menuitem" class="ghost" data-lang="${code}" lang="${code}" aria-pressed="${code === lang}">${name}</button>`
        )
        .join("");
    return html`
        <div class="acc-section" role="group" aria-label="${t("Idioma")}">
            <span class="acc-title">${t("Idioma")}</span>
            <div class="acc-langs">${buttons}</div>
        </div>`;
}

function menuHtml() {
    const signedIn = Boolean(currentUser());
    const role = signedIn ? t(ROLE_LABELS[currentProfile()?.role] || "") : "";
    const note = t(
        signedIn
            ? "Tu perfil, listas de deseados y preferencias se guardan en tu cuenta. El carrito es de la tienda de demostración y queda en este navegador."
            : "Sin cuenta, el perfil y las listas de deseados se guardan solo en este navegador."
    );
    return [
        `<div class="acc-who"><span class="acc-avatar big" aria-hidden="true">${avatarHtml()}</span><div>${whoHtml()}${role ? `<small>${h(role)}</small>` : ""}</div></div>`,
        signedIn ? "" : accessHtml(),
        ...SECTIONS.map(sectionHtml),
        languageHtml(),
        adminHtml(),
        signedIn ? accessHtml() : "",
        `<p class="acc-note">${note}</p>`
    ].join("");
}

export function installAccountMenu() {
    const bar = document.querySelector("header .bar");
    const wrap = document.createElement("div");
    wrap.className = "acc";
    wrap.innerHTML = html`
        <button class="acc-avatar" id="account-button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" title="${t("Mi cuenta")}"></button>
        <div class="acc-menu gl" id="account-menu" role="menu" aria-labelledby="account-button" hidden></div>`;
    bar.append(wrap);
    const button = wrap.querySelector("#account-button");
    const menu = wrap.querySelector("#account-menu");
    const refreshAvatar = () => {
        const name = displayName();
        button.innerHTML = avatarHtml();
        button.setAttribute("aria-label", name ? t("Mi cuenta: {name}", { name }) : t("Mi cuenta"));
    };
    const close = (focusButton = false) => {
        if (menu.hidden) return;
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (focusButton) button.focus();
    };
    const open = () => {
        menu.innerHTML = menuHtml();
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
        menu.querySelector("[role=menuitem]:not([disabled])")?.focus();
    };
    refreshAvatar();
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.hidden) open();
        else close();
    });
    // Entries carry data-go, so the store's click router changes the tab; this
    // only closes the menu and, for "Personalización", scrolls to its section.
    menu.addEventListener("click", (event) => {
        const choice = event.target.closest("[data-lang]");
        if (choice) return window.I18N.choose(choice.dataset.lang);
        const item = event.target.closest("[data-go], [data-auth-logout]");
        if (!item) return;
        const anchor = item.dataset.accScroll;
        close();
        if (anchor)
            requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }));
    });
    document.addEventListener("click", (event) => {
        if (!wrap.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
        if (menu.hidden) return;
        if (event.key === "Escape") return close(true);
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const items = [...menu.querySelectorAll("[role=menuitem]:not([disabled])")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items.at(next % items.length)?.focus();
    });
    document.addEventListener("cm:profile", refreshAvatar);
    document.addEventListener("cm:account", () => {
        refreshAvatar();
        // Opened before the page knew who is signed in: show the right entries.
        if (!menu.hidden) menu.innerHTML = menuHtml();
    });
}
