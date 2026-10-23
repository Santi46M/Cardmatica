// Account menu: the round avatar at the top right and its dropdown, in the
// style of Cardmarket and TCGplayer. Entries that already work open their
// panel; the rest show what is coming next (see the roadmap) and are disabled.
import { escapeHtml } from "./html.js";
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
            ["Seguridad e inicio de sesión", null],
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

function avatarHtml(profile) {
    const letters = initials(profile?.name);
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

function menuHtml() {
    const profile = currentProfile();
    const role = profile ? ROLE_LABELS[profile.role] : "";
    const who = profile
        ? `<b>${h(profile.name)}</b><small>${h(role)}${profile.store ? ` · ${h(profile.store)}` : ""}</small>`
        : "<b>Invitado</b><small>Completa tu perfil para comprar y vender</small>";
    return `<div class="acc-who"><span class="acc-avatar big" aria-hidden="true">${avatarHtml(
        profile
    )}</span><div>${who}</div></div>${SECTIONS.map(
        ([title, items]) =>
            `<div class="acc-section" role="group" aria-label="${h(title)}"><span class="acc-title">${h(
                title
            )}</span>${items.map(itemHtml).join("")}</div>`
    ).join(
        ""
    )}<p class="acc-note">Las cuentas todavía no existen en el servidor: el perfil y las wantlists se guardan en este navegador.</p>`;
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
        const profile = currentProfile();
        button.innerHTML = avatarHtml(profile);
        button.setAttribute("aria-label", profile ? `Mi cuenta: ${profile.name}` : "Mi cuenta");
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
        menu.querySelector(".acc-item:not([disabled])")?.focus();
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
        const item = event.target.closest("[data-go]");
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
        const items = [...menu.querySelectorAll(".acc-item:not([disabled])")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items.at(next % items.length)?.focus();
    });
    document.addEventListener("cm:profile", refreshAvatar);
}
