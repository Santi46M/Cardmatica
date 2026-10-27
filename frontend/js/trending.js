// "En tendencia" on the home page: the lists the API finds in the catalogue
// (backend/app/services/trending.py), one at a time, each with its tab
// (tile-tabs.js). A list without cards does not come, so a new catalogue may
// show only some.
import { formatDate, money } from "./format.js";
import { t } from "./lang.js";
import { tileTabsHtml } from "./tile-tabs.js";

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
            t("{price} · antes {before} (−{drop} %)", {
                price: money(reason.to, reason.currency),
                before: money(reason.from, reason.currency),
                drop: Math.round(reason.drop * 100)
            })
    ],
    back_in_play: [
        "Vuelven al juego",
        (reason) =>
            t("{from} → {to} desde el {date}", {
                from: t(STATUS[reason.from]),
                to: t(STATUS[reason.to]),
                date: formatDate(reason.since)
            })
    ],
    most_wanted: ["Más deseadas", (reason) => t("En {count} listas de deseados", { count: reason.lists })],
    reprints: [
        "Vuelven con reimpresión",
        (reason) =>
            t("Reimpresa tras {years} años · {date}", { years: reason.years, date: formatDate(reason.released) })
    ],
    notable_printings: ["Impresiones destacadas", (reason) => `${reason.rarity} · ${reason.set_name}`]
};

let active = null;

// tile(card, line): a card tile (catalog-view.js).
export function trendingHtml(data, tile, key = active) {
    active = key;
    const lists = (data?.lists || [])
        .filter((list) => LISTS[list.key] && list.items.length)
        .map((list) => {
            const [label, why] = LISTS[list.key];
            const tiles = list.items.map((item) => tile(item.card, why(item.reason))).join("");
            return { key: list.key, label: t(label), tiles };
        });
    return tileTabsHtml({ name: "trend", title: t("En tendencia"), lists, active });
}
