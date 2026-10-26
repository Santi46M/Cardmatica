// Wish lists: kept in the browser for guests and in the account once signed
// in, with price alerts and the purchase planner (shopping-wizard.js).
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";
import { WANTLIST } from "./config.js";
import { formatDate, money, toEuro } from "./format.js";
import { track } from "./analytics.js";
import { currentUser } from "./auth.js";
import { request } from "./session-api.js";
import { printingOptionsHtml } from "./printings.js";
import { installShoppingWizard, wizardHtml } from "./shopping-wizard.js";
import { newId, readJson, writeJson } from "./storage.js";

const h = escapeHtml;

const KEY = "cm_wantlists_v1";
const LANGUAGES = {
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
const EDITIONS = [
    ["1st", "1st Edition"],
    ["Limited", "Limited Edition"],
    ["Unlimited", "Unlimited"]
];
const EDITION_NAMES = Object.fromEntries(EDITIONS);
const TYPES = { Monster: "Monstruo", Spell: "Magia", Trap: "Trampa" };

const EMPTY = () => ({ lists: [], active: null });
function localState() {
    const saved = readJson(KEY, null);
    return saved && Array.isArray(saved.lists) ? saved : EMPTY();
}
let state = localState();
// Signed in, the lists live in the account (/api/v1/account/wantlists).
let remote = false;
const ACCOUNT_WANTLISTS = "/api/v1/account/wantlists";
// Several quick edits (typing a quantity, an alert price) are sent together.
const SAVE_DELAY_MS = 400;
let saveTimer;
let pendingDelete = null;
// Price alerts: item id -> latest matching sale at or below the target price.
let api = null;
let alerts = new Map();
let alertsAnnounced = false;

function save() {
    if (remote) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!currentUser()) return;
            request(ACCOUNT_WANTLISTS, { method: "PUT", body: state }).catch((error) => {
                if (currentUser())
                    window.toast?.(t("No se pudo guardar la lista de deseados: {error}", { error: error.message }));
            });
        }, SAVE_DELAY_MS);
        return;
    }
    if (!writeJson(KEY, state))
        window.toast?.(t("Tu navegador no permite guardar: la lista de deseados se perderá al cerrar la página"));
}

// On sign-in the account's lists replace the browser's. The first time, the
// browser's lists are moved into the account so nothing is lost.
async function syncWithAccount(panel) {
    clearTimeout(saveTimer);
    if (!currentUser()) {
        remote = false;
        state = localState();
    } else {
        try {
            const saved = await request(ACCOUNT_WANTLISTS);
            const local = localState();
            if (!saved.lists.length && local.lists.length) {
                state = await request(ACCOUNT_WANTLISTS, { method: "PUT", body: local });
                writeJson(KEY, EMPTY());
                window.toast?.(t("Tus listas de deseados de este navegador se guardaron en tu cuenta"));
            } else state = saved;
            remote = true;
        } catch {
            if (currentUser()) window.toast?.(t("No se pudieron leer tus listas de deseados de la cuenta"));
        }
    }
    alerts = new Map();
    updateBadge();
    const container = panel();
    if (container) renderWantlists(container);
    refreshAlerts();
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
    const first = any ? `<option value="">${h(t(any))}</option>` : "";
    const rest = entries
        .map(([value, label]) => `<option value="${h(value)}"${value === selected ? " selected" : ""}>${h(t(label))}</option>`)
        .join("");
    return first + rest;
}

export function countItems() {
    return state.lists.reduce((total, list) => total + list.items.length, 0);
}

export function listCount() {
    return state.lists.length;
}

// Form shown inside a card's detail. The card and printing come from the catalogue API.
function pickerHtml(card, printings, selectedId, market) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const language = API_LANGUAGES[String(printing?.language || "").toLowerCase()] || "";
    const active = activeList()?.id;
    const lists = state.lists
        .map(
            (list) =>
                `<option value="${h(list.id)}"${list.id === active ? " selected" : ""}>${h(list.name)} (${list.items.length})</option>`
        )
        .join("");
    const noLists = !state.lists.length;
    const printingChoice = printingOptionsHtml(printings.items, printing?.id, { any: t("Cualquier impresión"), details: false });
    return html`
        <div class="pick gl" id="wl-form" data-card-id="${h(card.id)}">
            <b>${t("Añadir a una lista de deseados")}</b>
            <select id="wl-list" aria-label="${t("Lista de deseados")}">
                ${lists}
                <option value="new"${noLists ? " selected" : ""}>+ ${t("Nueva lista…")}</option>
            </select>
            <input id="wl-list-name" placeholder="${t("Nombre de la nueva lista")}" maxlength="60"${noLists ? "" : " hidden"}>
            <select id="wl-printing" aria-label="${t("Impresión")}">${printingChoice}</select>
            <select id="wl-language" aria-label="${t("Idioma")}">${options(LANGUAGES[market], language, "Cualquier idioma")}</select>
            <select id="wl-edition" aria-label="${t("Edición")}">${options(EDITIONS, "", "Cualquier edición")}</select>
            <label class="qty">${t("Cantidad")} <input id="wl-quantity" type="number" min="1" max="${WANTLIST.maxQuantity}" value="1"></label>
            <button class="btn s" data-wl-add>${t("Añadir")}</button>
        </div>`;
}

// "Deseados" tab of a card's detail: the lists that already include it.
export function cardWantsHtml(cardId) {
    const entries = state.lists.flatMap((list) =>
        list.items.filter((item) => item.cardId === cardId).map((item) => ({ list, item }))
    );
    const rows = entries
        .map(({ list, item }) => {
            const which = item.code ? `${item.code} · ${item.rarity}` : t("Cualquier impresión");
            const language = item.language ? ` · ${h(item.language)}` : "";
            const edition = item.edition ? ` · ${h(item.edition)}` : "";
            return `<li><b>${h(list.name)}</b> · ${item.quantity} × ${h(which)}${language}${edition}</li>`;
        })
        .join("");
    const intro = t(
        entries.length === 1
            ? "Esta carta está en 1 de tus listas de deseados:"
            : "Esta carta está en {count} entradas de tus listas de deseados:",
        { count: entries.length }
    );
    const found = rows
        ? `<p>${intro}</p><ul class="cd-wants">${rows}</ul>`
        : `<p class="catalog-status">${t("Esta carta todavía no está en ninguna de tus listas de deseados.")}</p>`;
    return html`
        ${found}
        <p><button class="btn s" data-wl-open aria-controls="wl-picker">♥ ${t("Añadir a la lista de deseados")}</button></p>
        <small class="catalog-status">${t("Las listas se gestionan en la pestaña «Lista de deseados».")}</small>`;
}

function addFromForm(card, printings, market) {
    let list;
    const choice = document.getElementById("wl-list").value;
    if (choice === "new") {
        const name = document.getElementById("wl-list-name").value.trim();
        if (!name) {
            window.toast?.(t("Ponle un nombre a la nueva lista"));
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
    window.toast?.(t("{card} añadida a «{list}»", { card: card.name, list: list.name }));
    track("wantlist:agregar");
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
    document.getElementById("wl-count").textContent = t("{shown} de {total} cartas", {
        shown: rows.length,
        total: list.items.length
    });
    if (!rows.length) {
        const empty = list.items.length
            ? "Ninguna carta de esta lista coincide con los filtros."
            : "Esta lista está vacía. Abre una carta y usa «♥ Añadir a la lista de deseados».";
        return `<tr><td colspan="7" class="empty">${t(empty)}</td></tr>`;
    }
    return rows.map(itemRow).join("");
}

function itemRow(item) {
    const type = TYPES[item.cardType] ? t(TYPES[item.cardType]) : item.cardType || "";
    const subtypes = item.subtypes.length ? ` · ${h(item.subtypes.join(" / "))}` : "";
    const printing = item.code
        ? `<b>${h(item.code)}</b> ${h(item.rarity || "")}<small>${h(item.setName || "")}</small>`
        : t("Cualquier impresión");
    const quantityLabel = h(t("Cantidad de {name}", { name: item.name }));
    return html`
        <tr>
            <td>
                <button class="lk" data-catalog-card="${h(item.cardId)}">${h(item.name)}</button>
                <small><span class="tag ${item.market === "OCG" ? "o" : "t"}">${h(item.market)}</span>${h(type)}${subtypes}</small>
            </td>
            <td>${printing}</td>
            <td>${h(t(LANGUAGE_NAMES[item.language] || "Cualquiera"))}</td>
            <td>${h(EDITION_NAMES[item.edition] || t("Cualquiera"))}</td>
            <td class="num">
                <input class="wl-qty" type="number" min="1" max="${WANTLIST.maxQuantity}" value="${item.quantity}" data-wl-qty="${h(item.id)}" aria-label="${quantityLabel}">
            </td>
            <td class="num">${alertCell(item)}</td>
            <td class="num"><button class="ghost" data-wl-remove="${h(item.id)}">${t("Quitar")}</button></td>
        </tr>`;
}

// The purchase plan follows the list: a removed card or a new quantity redraws it.
function refreshWizard(list) {
    const section = document.getElementById("wl-wizard");
    if (section) section.outerHTML = wizardHtml(list);
}

function alertCell(item) {
    const target = item.alert;
    const currency = target?.currency || window.currency;
    const hit = alerts.get(item.id);
    const label = h(t("Avisar si {name} baja de este precio en {currency}", { name: item.name, currency }));
    const sale = hit ? `<small class="wl-hit">${h(t("Última venta {price}", { price: money(hit.price, hit.currency) }))}</small>` : "";
    return html`
        <label class="wl-alert">
            <input type="number" min="0" step="0.01" inputmode="decimal" value="${target ? h(target.amount) : ""}" placeholder="${t("Precio")}" data-wl-alert="${h(item.id)}" aria-label="${label}">
            <span>${h(currency)}</span>
        </label>
        ${sale}`;
}

function allItems() {
    return state.lists.flatMap((list) => list.items.map((item) => ({ item, list })));
}

function alertsHtml() {
    const hits = allItems().filter(({ item }) => alerts.has(item.id));
    if (!hits.length) return "";
    const rows = hits
        .map(({ item, list }) => {
            const sale = alerts.get(item.id);
            const detail = t("última venta {price} el {date} ({code}), por debajo de tu objetivo de {target}", {
                price: money(sale.price, sale.currency),
                date: formatDate(sale.observed_at),
                code: sale.code,
                target: `${item.alert.amount} ${item.alert.currency}`
            });
            return html`
                <div class="wl-alert-row">
                    <div>
                        <button class="lk" data-catalog-card="${h(item.cardId)}">${h(item.name)}</button>
                        <small>${h(list.name)} · ${h(detail)}</small>
                    </div>
                    <button class="ghost" data-wl-seen="${h(item.id)}">${t("Marcar como visto")}</button>
                </div>`;
        })
        .join("");
    const how = t("Se compara con la última venta registrada que coincide con la impresión, el idioma y la edición elegidos.");
    return html`
        <section class="gl pnl wl-alerts" role="status">
            <b>${t("Avisos de precio")}</b>
            ${rows}
            <small>${how}</small>
        </section>`;
}

function updateBadge() {
    const count = alerts.size;
    const label = t("Lista de deseados");
    window.TAB_LABELS.Deseados = count ? `${label} (${count})` : label;
    const tab = document.querySelector('#tabs [data-g="Deseados"]');
    if (tab) tab.textContent = window.TAB_LABELS.Deseados;
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
            t(
                alerts.size === 1
                    ? "Una carta de tus listas de deseados bajó de tu precio objetivo"
                    : "{count} cartas de tus listas de deseados bajaron de tu precio objetivo",
                { count: alerts.size }
            )
        );
    }
    const container = document.getElementById("wlv");
    if (container && window.tab === "Deseados") renderWantlists(container);
}

export function renderWantlists(container) {
    const list = activeList();
    const create = html`
        <input id="wl-new-name" placeholder="${t("Nueva lista")}" maxlength="60" aria-label="${t("Nombre de la nueva lista")}">
        <button class="btn s" data-wl-create>${t("Crear lista")}</button>`;
    if (!list) {
        const none = t("Todavía no tienes listas de deseados. Crea una aquí o abre una carta y usa «♥ Añadir a la lista de deseados».");
        container.innerHTML = html`
            <h3>${t("Mis listas de deseados")}</h3>
            <div class="gl pnl">
                <p class="empty">${none}</p>
                <div class="tools">${create}</div>
            </div>`;
        return;
    }
    const sets = [...new Set(list.items.map((item) => item.setName).filter(Boolean))].sort();
    const pills = state.lists
        .map(
            (item) =>
                `<button class="pill" aria-pressed="${item.id === list.id}" data-wl-select="${h(item.id)}">${h(item.name)} (${item.items.length})</button>`
        )
        .join("");
    const created = h(t("Creada el {date}.", { date: formatDate(list.createdAt) }));
    const where = t(currentUser() ? "Tus listas se guardan en tu cuenta." : "Tus listas se guardan en este navegador.");
    const remove = t(pendingDelete === list.id ? "Confirmar: eliminar la lista" : "Eliminar esta lista");
    container.innerHTML = html`
        <h3>${t("Mis listas de deseados")}</h3>
        ${alertsHtml()}
        <div class="tools">${pills}${create}</div>
        <div class="tools">
            <input id="wl-q" type="search" placeholder="${t("Buscar por carta, set o código")}" aria-label="${t("Buscar en la lista")}">
            <select id="wl-type" aria-label="${t("Tipo")}">${options(Object.entries(TYPES), "", "Todos los tipos")}</select>
            <select id="wl-set" aria-label="${t("Set")}">${options(sets.map((name) => [name, name]), "", "Todos los sets")}</select>
            <select id="wl-filter-language" aria-label="${t("Idioma")}">
                <option value="">${t("Todos los idiomas")}</option>
                <optgroup label="TCG">${options(LANGUAGES.TCG)}</optgroup>
                <optgroup label="OCG">${options(LANGUAGES.OCG)}</optgroup>
            </select>
            <select id="wl-filter-edition" aria-label="${t("Edición")}">${options(EDITIONS, "", "Cualquier edición")}</select>
            <span class="cnt" id="wl-count"></span>
        </div>
        <div class="pn gl wrap">
            <table>
                <thead>
                    <tr>
                        <th>${t("Carta")}</th>
                        <th>${t("Impresión")}</th>
                        <th>${t("Idioma")}</th>
                        <th>${t("Edición")}</th>
                        <th class="num">${t("Cant.")}</th>
                        <th class="num">${t("Avisar si baja de")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="wl-rows"></tbody>
            </table>
        </div>
        <p><small>${created} ${where}</small> <button class="ghost" data-wl-delete="${h(list.id)}">${remove}</button></p>
        ${wizardHtml(list)}`;
    document.getElementById("wl-rows").innerHTML = rowsHtml(list);
}

// Hooks for the card detail, which owns the current card and printing page.
export function installWantlists({ panel, detail, api: client }) {
    api = client;
    installShoppingWizard({ currentList: activeList });
    document.addEventListener("cm:account", () => syncWithAccount(panel));
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
                    window.toast?.(t("Escribe un nombre para la lista"));
                    input.focus();
                    return;
                }
                createList(name);
            } else if (target.dataset.wlRemove) {
                const list = activeList();
                list.items = list.items.filter((item) => item.id !== target.dataset.wlRemove);
                save();
                document.getElementById("wl-rows").innerHTML = rowsHtml(list);
                refreshWizard(list);
                return;
            } else if (target.dataset.wlDelete) {
                if (pendingDelete !== target.dataset.wlDelete) {
                    pendingDelete = target.dataset.wlDelete;
                } else {
                    state.lists = state.lists.filter((list) => list.id !== pendingDelete);
                    state.active = state.lists[0]?.id || null;
                    pendingDelete = null;
                    save();
                    window.toast?.(t("Lista eliminada"));
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
                refreshWizard(list);
            }
        }
        if (event.target.dataset.wlAlert) {
            const list = activeList();
            const item = list?.items.find((entry) => entry.id === event.target.dataset.wlAlert);
            if (item) {
                const amount = Number(event.target.value);
                if (event.target.value === "" || !Number.isFinite(amount) || amount <= 0) {
                    delete item.alert;
                    window.toast?.(t("Aviso de precio quitado para {name}", { name: item.name }));
                } else {
                    item.alert = {
                        amount: Math.round(amount * 100) / 100,
                        currency: item.alert?.currency || window.currency
                    };
                    delete item.seenSaleAt;
                    window.toast?.(
                        t("Te avisaremos si {name} se vende por {price} o menos", {
                            name: item.name,
                            price: `${item.alert.amount} ${item.alert.currency}`
                        })
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
