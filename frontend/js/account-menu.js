// Account menu: the round avatar at the top right and its dropdown, in the
// style of Cardmarket and TCGplayer. Entries that already work open their
// panel; the rest show what is coming next (see the roadmap) and are disabled.
import { escapeHtml } from "./html.js";
import { currentUser } from "./auth.js";
import { currentProfile, ROLE_LABELS } from "./profile.js";
import { countItems } from "./wantlists.js";

const h = escapeHtml;

// [label, data-go tab or null when not built yet, section]
const SECTIONS = [
    [
        "Mi cuenta",
        [
            ["Mi perfil", "Perfil"],
            ["Wantlists", "Wantlists"],
            ["Carrito", "Carrito"],
            ["Personalización", "Perfil", "pf-prefs"]
        ]
    ],
    [
        "Compras",
        [
            ["Mis pedidos", null],
            ["Mensajes", null],
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
            ["Seguridad e inicio de sesión", "Seguridad"],
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
        return `<button role="menuitem" class="acc-item" disabled aria-disabled="true">${h(
            label
        )}<small>Próximamente</small></button>`;
    const badge = tab === "Wantlists" && countItems() ? `<small>${countItems()}</small>` : "";
    return `<button role="menuitem" class="acc-item" data-go="${h(tab)}"${
        anchor ? ` data-acc-scroll="${h(anchor)}"` : ""
    }>${h(label)}${badge}</button>`;
}

function whoHtml() {
    const user = currentUser();
    const profile = currentProfile();
    if (user)
        return `<b>${h(user.display_name)}</b><small>${h(user.email)}${
            user.email_verified ? "" : ' · <span class="warn-text">sin confirmar</span>'
        }${
            profile?.store ? ` · ${h(profile.store)}` : ""
        }</small>`;
    // Without an account, the profile kept in this browser still names the person.
    if (profile)
        return `<b>${h(profile.name)}</b><small>${h(ROLE_LABELS[profile.role] || "")}${
            profile.store ? ` · ${h(profile.store)}` : ""
        } · sin cuenta</small>`;
    return "<b>Invitado</b><small>Inicia sesión o crea una cuenta</small>";
}

// Signed out: the way in comes first. Signed in: the way out comes last.
function accessHtml() {
    if (currentUser())
        return '<div class="acc-section"><button role="menuitem" class="acc-item" data-auth-logout>Cerrar sesión</button></div>';
    return '<div class="acc-access"><button role="menuitem" class="btn s acc-item-main" data-go="Acceso" data-auth-mode="login">Iniciar sesión</button><button role="menuitem" class="ghost acc-item-main" data-go="Acceso" data-auth-mode="register">Crear cuenta</button></div>';
}

// Only administrators see the way into the panel.
function adminHtml() {
    if (currentUser()?.role !== "admin") return "";
    return `<div class="acc-section" role="group" aria-label="Administración"><span class="acc-title">Administración</span>${itemHtml([
        "Panel de administración",
        "Admin"
    ])}</div>`;
}

function menuHtml() {
    const role = currentProfile() ? ROLE_LABELS[currentProfile().role] : "";
    return `<div class="acc-who"><span class="acc-avatar big" aria-hidden="true">${avatarHtml()}</span><div>${whoHtml()}${
        role && currentUser() ? `<small>${h(role)}</small>` : ""
    }</div></div>${currentUser() ? "" : accessHtml()}${SECTIONS.map(
        ([title, items]) =>
            `<div class="acc-section" role="group" aria-label="${h(title)}"><span class="acc-title">${h(
                title
            )}</span>${items.map(itemHtml).join("")}</div>`
    ).join("")}${adminHtml()}${currentUser() ? accessHtml() : ""}<p class="acc-note">${
        currentUser()
            ? "Tu perfil, wantlists y preferencias se guardan en tu cuenta. El carrito es de la tienda de demostración y queda en este navegador."
            : "Sin cuenta, el perfil y las wantlists se guardan solo en este navegador."
    }</p>`;
}

export function installAccountMenu() {
    const bar = document.querySelector("header .bar");
    const wrap = document.createElement("div");
    wrap.className = "acc";
    wrap.innerHTML =
        '<button class="acc-avatar" id="account-button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" title="Mi cuenta"></button><div class="acc-menu gl" id="account-menu" role="menu" aria-labelledby="account-button" hidden></div>';
    bar.append(wrap);
    const button = wrap.querySelector("#account-button");
    const menu = wrap.querySelector("#account-menu");
    const refreshAvatar = () => {
        const name = displayName();
        button.innerHTML = avatarHtml();
        button.setAttribute("aria-label", name ? `Mi cuenta: ${name}` : "Mi cuenta");
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
