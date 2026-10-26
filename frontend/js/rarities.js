// Rarities: family names in Spanish, the filter grouped by family and the
// coloured label. The API sends each rarity's usual name, its abbreviation and
// its family (backend/app/services/rarities.py). Rarity names are proper names
// and stay as Cardmarket, TCGplayer and Yugipedia write them.
import { escapeHtml } from "./html.js";
import { t } from "./lang.js";

const h = escapeHtml;

const FAMILY_LABELS = {
    basic: "Básicas",
    premium: "Alta gama",
    secret: "Secret especiales",
    gold: "Gold y Platinum",
    parallel: "Parallel y texturas",
    special: "Ediciones especiales",
    other: "Otras"
};

// What is not obvious from the name, shown when hovering the label.
const NOTES = {
    "Short Print": "Common que aparece menos en los sobres",
    "Super Short Print": "Common que aparece mucho menos en los sobres",
    "Normal Rare": "Common con la frecuencia de una Rare (OCG)"
};

// Each step of the basic ladder has its colour; the other families one each.
const BASIC_TONES = {
    Rare: "rare",
    "Super Rare": "super",
    "Ultra Rare": "ultra",
    "Secret Rare": "secret"
};

function tone(name, family) {
    if (family === "basic") return BASIC_TONES[name] || "common";
    return family in FAMILY_LABELS ? family : "other";
}

// printing: { rarity, rarity_code, rarity_family } as the API sends it.
export function rarityBadge(printing) {
    if (!printing?.rarity || printing.rarity === "Unknown")
        return `<span class="rr" data-tone="other">${t("Sin documentar")}</span>`;
    const family = printing.rarity_family;
    const title = [printing.rarity_code, NOTES[printing.rarity], FAMILY_LABELS[family]]
        .filter(Boolean)
        .map((part) => t(part))
        .join(" · ");
    return `<span class="rr" data-tone="${tone(printing.rarity, family)}" title="${h(title)}">${h(printing.rarity)}</span>`;
}

// A whole family is chosen with this prefix ("familia:gold").
const FAMILY_VALUE = "familia:";

// The rarity filter: one group per family with only the rarities the catalogue
// has. A family with several rarities can also be chosen whole; the basic one
// covers almost every card, so it cannot.
export function rarityOptionsHtml(groups) {
    const option = (value, label) => `<option value="${h(value)}">${h(label)}</option>`;
    return (
        option("", t("Todas las rarezas")) +
        groups
            .map(({ family, names }) => {
                const label = t(FAMILY_LABELS[family] || FAMILY_LABELS.other);
                const whole =
                    family !== "basic" && names.length > 1
                        ? option(`${FAMILY_VALUE}${family}`, t("{family}: todas", { family: label }))
                        : "";
                return `<optgroup label="${h(label)}">${whole}${names
                    .map((name) => option(name, name))
                    .join("")}</optgroup>`;
            })
            .join("")
    );
}

// API parameters for the value chosen in the filter.
export function rarityParams(value) {
    if (!value) return {};
    return value.startsWith(FAMILY_VALUE)
        ? { rarity_family: value.slice(FAMILY_VALUE.length) }
        : { rarity: value };
}
