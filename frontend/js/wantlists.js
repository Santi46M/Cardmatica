import { escapeHtml } from "./html.js";
import { WANTLIST } from "./config.js";
import { formatDate, money, toEuro } from "./format.js";
import { newId, readJson, writeJson } from "./storage.js";

const h = escapeHtml;

const KEY = "cm_wantlists_v1";
export const LANGUAGES = {
    TCG: [
        ["EN", "Inglés"],
        ["ES", "Español"],
        ["FR", "Francés"],
        ["DE", "Alemán"],
        ["IT", "Italiano"],
        ["PT", "Portugués"]
    ],
    OCG: [
        ["JP", "Japonés"],
        ["KR", "Coreano"],
        ["SC", "Chino simplificado"],
        ["AE", "Asian-English"]
    ]
};
const LANGUAGE_NAMES = Object.fromEntries([...LANGUAGES.TCG, ...LANGUAGES.OCG]);
const API_LANGUAGES = { en: "EN", es: "ES", fr: "FR", de: "DE", it: "IT", pt: "PT", ja: "JP", ko: "KR", zh: "SC", ae: "AE" };
export const EDITIONS = [
    ["1st", "1st Edition"],
    ["Limited", "Limited Edition"],
    ["Unlimited", "Unlimited"]
];
const EDITION_NAMES = Object.fromEntries(EDITIONS);
const TYPES = { Monster: "Monstruo", Spell: "Magia", Trap: "Trampa" };

let state = readJson(KEY, null);
if (!state || !Array.isArray(state.lists)) state = { lists: [], active: null };
let pendingDelete = null;
// Price alerts: item id -> latest matching sale at or below the target price.
let api = null;
let alerts = new Map();
let alertsAnnounced = false;

function save() {
    if (!writeJson(KEY, state))
        window.toast?.("Tu navegador no permite guardar: la wantlist se perderá al cerrar la página");
}

function activeList() {
    return state.lists.find((list) => list.id === state.active) || state.lists[0] || null;
}

function createList(name) {
    const list = { id: newId(), name, items: [], createdAt: new Date().toISOString() };
    state.lists.push(list);
    state.active = list.id;
    save();
    return list;
}

function options(entries, selected = "", any = "") {
    return (
        (any ? `<option value="">${h(any)}</option>` : "") +
        entries
            .map(
                ([value, label]) =>
                    `<option value="${h(value)}"${value === selected ? " selected" : ""}>${h(
                        label
                    )}</option>`
            )
            .join("")
    );
}

export function countItems() {
    return state.lists.reduce((total, list) => total + list.items.length, 0);
}

export function listCount() {
    return state.lists.length;
}

// Form shown inside a card's detail. The card and printing come from the catalogue API.
export function pickerHtml(card, printings, selectedId, market) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const language = API_LANGUAGES[String(printing?.language || "").toLowerCase()] || "";
    return `<div class="pick gl" id="wl-form" data-card-id="${h(card.id)}"><b>Añadir a una wantlist</b><select id="wl-list" aria-label="Wantlist">${state.lists
        .map(
            (list) =>
                `<option value="${h(list.id)}"${
                    list.id === activeList()?.id ? " selected" : ""
                }>${h(list.name)} (${list.items.length})</option>`
        )
        .join(
            ""
        )}<option value="new"${state.lists.length ? "" : " selected"}>+ Nueva wantlist…</option></select><input id="wl-list-name" placeholder="Nombre de la nueva lista" maxlength="60"${
        state.lists.length ? " hidden" : ""
    }><select id="wl-printing" aria-label="Impresión"><option value="">Cualquier impresión</option>${printings.items
        .map(
            (item) =>
                `<option value="${h(item.id)}"${item.id === printing?.id ? " selected" : ""}>${h(
                    [item.code, item.rarity, item.set_name].join(" · ")
                )}</option>`
        )
        .join("")}</select><select id="wl-language" aria-label="Idioma">${options(
        LANGUAGES[market],
        language,
        "Cualquier idioma"
    )}</select><select id="wl-edition" aria-label="Edición">${options(
        EDITIONS,
        "",
        "Cualquier edición"
    )}</select><label class="qty">Cantidad <input id="wl-quantity" type="number" min="1" max="${WANTLIST.maxQuantity}" value="1"></label><button class="btn s" data-wl-add>Añadir</button></div>`;
}

function addFromForm(card, printings, market) {
    let list;
    const choice = document.getElementById("wl-list").value;
    if (choice === "new") {
        const name = document.getElementById("wl-list-name").value.trim();
        if (!name) {
            window.toast?.("Ponle un nombre a la nueva wantlist");
            document.getElementById("wl-list-name").focus();
            return false;
        }
        list = createList(name);
    } else list = state.lists.find((item) => item.id === choice);
    if (!list) return false;
    const printingId = document.getElementById("wl-printing").value;
    const printing = printings.items.find((item) => item.id === printingId);
    const entry = {
        id: newId(),
        cardId: card.id,
        name: card.name,
        market,
        cardType: card.card_type,
        subtypes: card.subtypes || [],
        printingId: printing?.id || null,
        code: printing?.code || null,
        setName: printing?.set_name || null,
        rarity: printing?.rarity || null,
        language: document.getElementById("wl-language").value,
        edition: document.getElementById("wl-edition").value,
        quantity: Math.min(WANTLIST.maxQuantity, Math.max(1, Number(document.getElementById("wl-quantity").value) || 1)),
        addedAt: new Date().toISOString()
    };
    const same = list.items.find(
        (item) =>
            item.cardId === entry.cardId &&
            item.printingId === entry.printingId &&
            item.language === entry.language &&
            item.edition === entry.edition
    );
    if (same) same.quantity = Math.min(WANTLIST.maxQuantity, same.quantity + entry.quantity);
    else list.items.push(entry);
    state.active = list.id;
    save();
    window.toast?.(`${card.name} añadida a «${list.name}»`);
    return true;
}

function filters() {
    const value = (id) => document.getElementById(id)?.value || "";
    return {
        q: value("wl-q").toLowerCase(),
        type: value("wl-type"),
        set: value("wl-set"),
        language: value("wl-filter-language"),
        edition: value("wl-filter-edition")
    };
}

function rowsHtml(list) {
    const filter = filters();
    const rows = list.items.filter(
        (item) =>
            (!filter.type || item.cardType === filter.type) &&
            (!filter.set || (item.setName || "") === filter.set) &&
            (!filter.language || !item.language || item.language === filter.language) &&
            (!filter.edition || !item.edition || item.edition === filter.edition) &&
            [item.name, item.code, item.setName].join(" ").toLowerCase().includes(filter.q)
    );
    document.getElementById("wl-count").textContent = `${rows.length} de ${list.items.length} cartas`;
    return rows.length
        ? rows
              .map(
                  (item) =>
                      `<tr><td><button class="lk" data-catalog-card="${h(item.cardId)}">${h(
                          item.name
                      )}</button><small><span class="tag ${item.market === "OCG" ? "o" : "t"}">${h(
                          item.market
                      )}</span>${h(TYPES[item.cardType] || item.cardType || "")}${
                          item.subtypes.length ? ` · ${h(item.subtypes.join(" / "))}` : ""
                      }</small></td><td>${
                          item.code
                              ? `<b>${h(item.code)}</b> ${h(item.rarity || "")}<small>${h(item.setName || "")}</small>`
                              : "Cualquier impresión"
                      }</td><td>${h(LANGUAGE_NAMES[item.language] || "Cualquiera")}</td><td>${h(
                          EDITION_NAMES[item.edition] || "Cualquiera"
                      )}</td><td class="num"><input class="wl-qty" type="number" min="1" max="${WANTLIST.maxQuantity}" value="${
                          item.quantity
                      }" data-wl-qty="${h(item.id)}" aria-label="Cantidad de ${h(
                          item.name
                      )}"></td><td class="num">${alertCell(item)}</td><td class="num"><button class="ghost" data-wl-remove="${h(
                          item.id
                      )}">Quitar</button></td></tr>`
              )
              .join("")
        : `<tr><td colspan="7" class="empty">${
              list.items.length
                  ? "Ninguna carta de esta lista coincide con los filtros."
                  : "Esta lista está vacía. Abre una carta y usa «+ Wantlist»."
          }</td></tr>`;
}

function alertCell(item) {
    const target = item.alert;
    const currency = target?.currency || window.currency;
    const hit = alerts.get(item.id);
    return `<label class="wl-alert"><input type="number" min="0" step="0.01" inputmode="decimal" value="${
        target ? h(target.amount) : ""
    }" placeholder="Precio" data-wl-alert="${h(item.id)}" aria-label="Avisar si ${h(
        item.name
    )} baja de este precio en ${h(currency)}"><span>${h(currency)}</span></label>${
        hit ? `<small class="wl-hit">Última venta ${h(money(hit.price, hit.currency))}</small>` : ""
    }`;
}

function allItems() {
    return state.lists.flatMap((list) => list.items.map((item) => ({ item, list })));
}

function alertsHtml() {
    const hits = allItems().filter(({ item }) => alerts.has(item.id));
    if (!hits.length) return "";
    return `<section class="gl pnl wl-alerts" role="status"><b>Avisos de precio</b>${hits
        .map(({ item, list }) => {
            const sale = alerts.get(item.id);
            return `<div class="wl-alert-row"><div><button class="lk" data-catalog-card="${h(
                item.cardId
            )}">${h(item.name)}</button><small>${h(list.name)} · última venta ${h(
                money(sale.price, sale.currency)
            )} el ${h(formatDate(sale.observed_at))} (${h(sale.code)}), por debajo de tu objetivo de ${h(
                `${item.alert.amount} ${item.alert.currency}`
            )}</small></div><button class="ghost" data-wl-seen="${h(item.id)}">Marcar como visto</button></div>`;
        })
        .join("")}<small>Se compara con la última venta registrada que coincide con la impresión, el idioma y la edición elegidos.</small></section>`;
}

function updateBadge() {
    const count = alerts.size;
    window.TAB_LABELS.Wantlists = count ? `Wantlists (${count})` : "Wantlists";
    const tab = document.querySelector('#tabs [data-g="Wantlists"]');
    if (tab) tab.textContent = window.TAB_LABELS.Wantlists;
}

const API_LANGUAGE = Object.fromEntries(
    Object.entries(API_LANGUAGES).map(([code, label]) => [label, code])
);

// Checks every item with a target price against its latest matching sale.
export async function refreshAlerts() {
    if (!api) return;
    const items = allItems()
        .map(({ item }) => item)
        .filter((item) => item.alert)
        .slice(0, WANTLIST.maxAlertChecks);
    const next = new Map();
    await Promise.all(
        items.map(async (item) => {
            try {
                // The server filters and returns only the latest matching sale.
                const history = await api.get(`cards/${item.cardId}/price-history`, {
                    market: item.market,
                    printing_id: item.printingId || undefined,
                    language: item.language ? API_LANGUAGE[item.language] : undefined,
                    edition: item.edition || undefined,
                    days: 1,
                    points: false
                });
                const sale = history.last_sale;
                if (!sale) return;
                const price = toEuro(sale.price, sale.currency);
                const target = toEuro(item.alert.amount, item.alert.currency);
                const fresh = !item.seenSaleAt || sale.observed_at > item.seenSaleAt;
                if (price !== null && target !== null && price <= target && fresh)
                    next.set(item.id, sale);
            } catch {
                /* An unavailable card simply produces no alert. */
            }
        })
    );
    alerts = next;
    updateBadge();
    if (alerts.size && !alertsAnnounced) {
        alertsAnnounced = true;
        window.toast?.(
            alerts.size === 1
                ? "Una carta de tus wantlists bajó de tu precio objetivo"
                : `${alerts.size} cartas de tus wantlists bajaron de tu precio objetivo`
        );
    }
    const container = document.getElementById("wlv");
    if (container && window.tab === "Wantlists") renderWantlists(container);
}

export function renderWantlists(container) {
    const list = activeList();
    const create = `<input id="wl-new-name" placeholder="Nueva wantlist" maxlength="60" aria-label="Nombre de la nueva wantlist"><button class="btn s" data-wl-create>Crear</button>`;
    if (!list) {
        container.innerHTML = `<h3>Mis wantlists</h3><div class="gl pnl"><p class="empty">Todavía no tienes wantlists. Crea una aquí o abre una carta y usa «+ Wantlist».</p><div class="tools">${create}</div></div>`;
        return;
    }
    const sets = [...new Set(list.items.map((item) => item.setName).filter(Boolean))].sort();
    container.innerHTML = `<h3>Mis wantlists</h3>${alertsHtml()}<div class="tools">${state.lists
        .map(
            (item) =>
                `<button class="pill" aria-pressed="${item.id === list.id}" data-wl-select="${h(
                    item.id
                )}">${h(item.name)} (${item.items.length})</button>`
        )
        .join("")}${create}</div><div class="tools"><input id="wl-q" type="search" placeholder="Buscar por carta, set o código" aria-label="Buscar en la wantlist"><select id="wl-type" aria-label="Tipo">${options(
        Object.entries(TYPES),
        "",
        "Todos los tipos"
    )}</select><select id="wl-set" aria-label="Set">${options(
        sets.map((name) => [name, name]),
        "",
        "Todos los sets"
    )}</select><select id="wl-filter-language" aria-label="Idioma">${options(
        [...LANGUAGES.TCG, ...LANGUAGES.OCG],
        "",
        "Todos los idiomas"
    )}</select><select id="wl-filter-edition" aria-label="Edición">${options(
        EDITIONS,
        "",
        "Cualquier edición"
    )}</select><span class="cnt" id="wl-count"></span></div><div class="pn gl wrap"><table><thead><tr><th>Carta</th><th>Impresión</th><th>Idioma</th><th>Edición</th><th class="num">Cant.</th><th class="num">Avisar si baja de</th><th></th></tr></thead><tbody id="wl-rows"></tbody></table></div><p><small>Creada el ${h(
        formatDate(list.createdAt)
    )}. Las wantlists se guardan en este navegador.</small> <button class="ghost" data-wl-delete="${h(
        list.id
    )}">${pendingDelete === list.id ? "Confirmar: eliminar la lista" : "Eliminar esta lista"}</button></p>`;
    document.getElementById("wl-rows").innerHTML = rowsHtml(list);
}

// Hooks for the card detail, which owns the current card and printing page.
export function installWantlists({ panel, detail, api: client }) {
    api = client;
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target.closest(
                "[data-wl-open], [data-wl-add], [data-wl-select], [data-wl-create], [data-wl-remove], [data-wl-delete], [data-wl-seen]"
            );
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const container = panel();
            if (target.hasAttribute("data-wl-open")) {
                const slot = document.getElementById("wl-picker");
                const current = detail();
                if (!slot || !current) return;
                slot.innerHTML = slot.innerHTML
                    ? ""
                    : pickerHtml(current.card, current.printings, current.selectedId, window.market);
                slot.querySelector("select")?.focus();
                return;
            }
            if (target.hasAttribute("data-wl-add")) {
                const current = detail();
                if (current && addFromForm(current.card, current.printings, window.market))
                    document.getElementById("wl-picker").innerHTML = "";
                return;
            }
            if (target.dataset.wlSeen) {
                const found = allItems().find(({ item }) => item.id === target.dataset.wlSeen);
                const sale = alerts.get(target.dataset.wlSeen);
                if (found && sale) found.item.seenSaleAt = sale.observed_at;
                alerts.delete(target.dataset.wlSeen);
                save();
                updateBadge();
            } else if (target.dataset.wlSelect) {
                state.active = target.dataset.wlSelect;
                pendingDelete = null;
                save();
            } else if (target.hasAttribute("data-wl-create")) {
                const input = document.getElementById("wl-new-name");
                const name = input.value.trim();
                if (!name) {
                    window.toast?.("Escribe un nombre para la wantlist");
                    input.focus();
                    return;
                }
                createList(name);
            } else if (target.dataset.wlRemove) {
                const list = activeList();
                list.items = list.items.filter((item) => item.id !== target.dataset.wlRemove);
                save();
                document.getElementById("wl-rows").innerHTML = rowsHtml(list);
                return;
            } else if (target.dataset.wlDelete) {
                if (pendingDelete !== target.dataset.wlDelete) {
                    pendingDelete = target.dataset.wlDelete;
                } else {
                    state.lists = state.lists.filter((list) => list.id !== pendingDelete);
                    state.active = state.lists[0]?.id || null;
                    pendingDelete = null;
                    save();
                    window.toast?.("Wantlist eliminada");
                }
            }
            if (container) renderWantlists(container);
        },
        true
    );
    document.addEventListener("change", (event) => {
        if (event.target.id === "wl-list")
            document.getElementById("wl-list-name").hidden = event.target.value !== "new";
        if (event.target.dataset.wlQty) {
            const list = activeList();
            const item = list?.items.find((entry) => entry.id === event.target.dataset.wlQty);
            if (item) {
                item.quantity = Math.min(WANTLIST.maxQuantity, Math.max(1, Number(event.target.value) || 1));
                event.target.value = item.quantity;
                save();
            }
        }
        if (event.target.dataset.wlAlert) {
            const list = activeList();
            const item = list?.items.find((entry) => entry.id === event.target.dataset.wlAlert);
            if (item) {
                const amount = Number(event.target.value);
                if (event.target.value === "" || !Number.isFinite(amount) || amount <= 0) {
                    delete item.alert;
                    window.toast?.(`Aviso de precio quitado para ${item.name}`);
                } else {
                    item.alert = {
                        amount: Math.round(amount * 100) / 100,
                        currency: item.alert?.currency || window.currency
                    };
                    delete item.seenSaleAt;
                    window.toast?.(
                        `Te avisaremos si ${item.name} se vende por ${item.alert.amount} ${item.alert.currency} o menos`
                    );
                }
                save();
                refreshAlerts();
            }
        }
        if (["wl-type", "wl-set", "wl-filter-language", "wl-filter-edition"].includes(event.target.id))
            document.getElementById("wl-rows").innerHTML = rowsHtml(activeList());
    });
    document.addEventListener("input", (event) => {
        if (event.target.id === "wl-q")
            document.getElementById("wl-rows").innerHTML = rowsHtml(activeList());
    });
}
