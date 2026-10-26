// "Para ti" on the home page: the cards this person opened lately, and cards
// like them (GET /api/v1/cards/for-you, backend/app/services/recommendations.py).
//
// Each person has their own history. A guest keeps it in this browser
// (localStorage, cm_recent_cards); with an account it is kept there
// (/api/v1/account/viewed), so it follows them to every device, and what this
// browser had is moved to the account on signing in. Nobody's history, no
// section.
import { t } from "./lang.js";
import { currentUser } from "./auth.js";
import { request } from "./session-api.js";
import { readJson, writeJson } from "./storage.js";
import { tileTabsHtml } from "./tile-tabs.js";
import { RECENT_CARDS } from "./config.js";

const KEY = "cm_recent_cards";
const ACCOUNT = "/api/v1/account/viewed";

const LISTS = [
    ["recent", "Vistas recientemente"],
    ["archetypes", "De los mismos arquetipos"],
    ["sets", "De los mismos sets"]
];

const stored = () => {
    const list = readJson(KEY, []);
    return Array.isArray(list) ? list.filter((id) => typeof id === "string").slice(0, RECENT_CARDS.keep) : [];
};

let history = stored();
let active = null;

export const recentCards = () => history;

export function rememberCard(id) {
    history = [id, ...history.filter((seen) => seen !== id)].slice(0, RECENT_CARDS.keep);
    if (currentUser()) request(ACCOUNT, { method: "PUT", body: { card_ids: [id] } }).catch(() => {});
    else writeJson(KEY, history);
}

// On signing in or out. A failed request keeps the history already shown.
export async function syncRecentCards() {
    if (!currentUser()) {
        history = stored();
        return;
    }
    const local = stored();
    try {
        const saved = local.length
            ? await request(ACCOUNT, { method: "PUT", body: { card_ids: local } })
            : await request(ACCOUNT);
        history = saved.card_ids;
        if (local.length) writeJson(KEY, []);
    } catch {
        /* Shown again on the next visit. */
    }
}

// tile(card): a card tile (catalog-view.js).
export function forYouHtml(data, tile, key = active) {
    active = key;
    const lists = LISTS.filter(([list]) => data?.[list]?.length).map(([list, label]) => ({
        key: list,
        label: t(label),
        tiles: data[list].map((card) => tile(card)).join("")
    }));
    return tileTabsHtml({ name: "for-you", title: t("Para ti"), lists, active });
}
