// How a printing reads in a list: code, rarity, language and edition in the
// visitor's language, grouped by the set it was printed in (newest set first, the order
// the API sends), as Cardmarket lists a card's versions by expansion.
import { escapeHtml } from "./html.js";
import { t } from "./lang.js";

const h = escapeHtml;

const LANGUAGE_NAMES = {
    en: "Inglés",
    es: "Español",
    fr: "Francés",
    de: "Alemán",
    it: "Italiano",
    pt: "Portugués",
    ja: "Japonés",
    ko: "Coreano",
    zh: "Chino",
    ae: "Asian-English"
};
const EDITION_NAMES = { "1st": "1st Edition", limited: "Limited Edition", unlimited: "Unlimited" };

export const languageName = (code) => {
    const name = LANGUAGE_NAMES[String(code || "").toLowerCase()];
    return name ? t(name) : code || "";
};
export const editionName = (value) => EDITION_NAMES[String(value || "").toLowerCase()] || "";

// "LOB-EN001 · Ultra Rare · Inglés · 1st Edition"; without the last two when
// the language and edition are chosen apart (the list of deseados).
function printingLabel(item, { details = true } = {}) {
    const parts = [item.code, item.rarity === "Unknown" ? "" : item.rarity];
    if (details) parts.push(languageName(item.language), editionName(item.edition));
    return parts.filter(Boolean).join(" · ");
}

// <option>s grouped by set; "any" adds a first option for every printing.
export function printingOptionsHtml(items, selectedId, { any = "", details = true } = {}) {
    const sets = new Map();
    for (const item of items) {
        if (!sets.has(item.set_name)) sets.set(item.set_name, []);
        sets.get(item.set_name).push(item);
    }
    const option = (item) =>
        `<option value="${h(item.id)}"${item.id === selectedId ? " selected" : ""}>${h(printingLabel(item, { details }))}</option>`;
    return (
        (any ? `<option value="">${h(any)}</option>` : "") +
        [...sets]
            .map(([name, group]) => `<optgroup label="${h(name)}">${group.map(option).join("")}</optgroup>`)
            .join("")
    );
}
