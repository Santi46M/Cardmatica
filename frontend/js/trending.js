// "En tendencia" on the home page: the lists the API finds in the catalogue
// (backend/app/services/trending.py), one at a time, each with its tab. A list
// without cards does not come, so a new catalogue may show only some.
import { escapeHtml } from "./html.js";
import { formatDate, money } from "./format.js";

const h = escapeHtml;
const STATUS = {
    forbidden: "Prohibida",
    limited: "Limitada",
    semi_limited: "Semi-limitada",
    unlimited: "Sin límite"
};

// [tab label, why this card is on the list]
const LISTS = {
    price_drops: [
        "Bajan de precio",
        (reason) =>
            `${money(reason.to, reason.currency)} · antes ${money(reason.from, reason.currency)} (−${Math.round(
                reason.drop * 100
            )} %)`
    ],
    back_in_play: [
        "Vuelven al juego",
        (reason) => `${STATUS[reason.from]} → ${STATUS[reason.to]} desde el ${formatDate(reason.since)}`
    ],
    most_wanted: ["Más deseadas", (reason) => `En ${reason.lists} listas de deseados`],
    reprints: [
        "Vuelven con reimpresión",
        (reason) => `Reimpresa tras ${reason.years} años · ${formatDate(reason.released)}`
    ],
    notable_printings: ["Impresiones destacadas", (reason) => `${reason.rarity} · ${reason.set_name}`]
};

let active = null;

// tile(card, line): a home tile (catalog-view.js), so both lists look the same.
export function trendingHtml(data, tile) {
    const lists = (data?.lists || []).filter((list) => LISTS[list.key] && list.items.length);
    if (!lists.length) return "";
    if (!lists.some((list) => list.key === active)) active = lists[0].key;
    const current = lists.find((list) => list.key === active);
    return `<section class="trend" aria-labelledby="trend-title"><h2 class="sec-title" id="trend-title">En tendencia</h2><div class="trend-tabs" role="tablist">${lists
        .map(
            (list) =>
                `<button role="tab" aria-selected="${list.key === active}" data-trend="${list.key}">${h(
                    LISTS[list.key][0]
                )}</button>`
        )
        .join("")}</div><div class="grid" role="tabpanel">${current.items
        .map((item) => tile(item.card, LISTS[current.key][1](item.reason)))
        .join("")}</div></section>`;
}

// Switching tabs redraws the section in place with the data already loaded.
export function installTrending({ slot, data, tile }) {
    document.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-trend]");
        if (!tab || !slot()?.contains(tab)) return;
        active = tab.dataset.trend;
        slot().innerHTML = trendingHtml(data(), tile);
        slot().querySelector(`[data-trend="${active}"]`)?.focus();
    });
}
