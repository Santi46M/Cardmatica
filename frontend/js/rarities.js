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
// Magic and Pokémon group their rarities their own way (backend/app/services/rarities.py).
const GAME_FAMILY_LABELS = {
    magic: { basic: "Rarezas de cada set", special: "Especiales y bonus" },
    pokemon: {
        basic: "Básicas",
        ultra: "ex, V y Ultra Rare",
        illustration: "Ilustraciones",
        secret: "Hyper, Mega y secretas",
        promo: "Promos"
    }
};
const familyLabel = (family, game) =>
    GAME_FAMILY_LABELS[game]?.[family] || FAMILY_LABELS[family] || FAMILY_LABELS.other;

// What is not obvious from the name, shown when hovering the label.
const NOTES = {
    "Short Print": "Common que aparece menos en los sobres",
    "Super Short Print": "Common que aparece mucho menos en los sobres",
    "Normal Rare": "Common con la frecuencia de una Rare (OCG)"
};

// ---- Rarity icons ------------------------------------------------------------
// The binder's badges (frontend/assets/rarities, from santapepsi/binder): a
// rounded box in two tones split on a diagonal, with white letters. Yu-Gi-Oh!
// rarities with a drawn picture use it; every other rarity, of any game, gets
// one built here in the same style. Hovering one tells the rarity by name.

const PICTURE_DIR = "/frontend/assets/rarities/";
// Yu-Gi-Oh! rarity (its usual name) -> picture.
const PICTURES = {
    Common: "common",
    Rare: "rare",
    "Super Rare": "super-rare",
    "Ultra Rare": "ultra-rare",
    "Secret Rare": "secret-rare",
    "Ultimate Rare": "ultimate-rare",
    "Ghost Rare": "ghost-rare",
    "Holographic Rare": "holographic-rare",
    "Collector's Rare": "collectors-rare",
    "Starlight Rare": "starlight-rare",
    "Extra Secret Rare": "extra-secret-rare",
    "Platinum Secret Rare": "platinum-secret-rare",
    "Quarter Century Secret Rare": "quarter-century-secret-rare",
    "Gold Rare": "gold-rare",
    "Gold Secret Rare": "gold-secret-rare",
    "Premium Gold Rare": "premium-gold-rare",
    "Platinum Rare": "platinum-rare",
    "Parallel Rare": "parallel-rare",
    "Super Parallel Rare": "super-parallel-rare",
    "Secret Parallel Rare": "secret-parallel-rare",
    "Starfoil Rare": "starfoil-rare",
    "Shatterfoil Rare": "shatterfoil",
    "Mosaic Rare": "mosaic-rare",
    "Grand Master Rare": "grand-master-rare",
    Oversized: "oversized",
    Special: "special"
};

// The rest: [letters, dark half, light half], game by game, covering every
// rarity of backend/app/services/rarities.py. Colours follow the pictures
// (gold for gold, red for secret...) and each game's own conventions.
const DRAWN = {
    yugioh: {
        "Short Print": ["SP", "#4a4f58", "#79808c"],
        "Super Short Print": ["SSP", "#3c4048", "#6a717c"],
        "Normal Rare": ["NR", "#8f5a1c", "#c98431"],
        "Prismatic Collector's Rare": ["PCR", "#7a4f93", "#c7a24a"],
        "Prismatic Ultimate Rare": ["PUR", "#5a3f86", "#b5934a"],
        "Prismatic Secret Rare": ["PSE", "#8a2a7a", "#e0457a"],
        "Ultra Secret Rare": ["USE", "#9a1c3a", "#e8475f"],
        "Secret Ultra Rare": ["SUR", "#a4331e", "#e86a3a"],
        "20th Secret Rare": ["20SE", "#7d1b1b", "#d43a2c"],
        "10000 Secret Rare": ["10K", "#5c1010", "#c9a23a"],
        "Ghost/Gold Rare": ["GGR", "#9aa3ad", "#d9a63b"],
        "Normal Parallel Rare": ["NPR", "#8a6bb8", "#b79ce0"],
        "Rare Parallel Rare": ["RPR", "#4f5fc0", "#9c84dc"],
        "Ultra Parallel Rare": ["UPR", "#7a49b8", "#d29be6"],
        "Extra Secret Parallel Rare": ["ESPR", "#8a2e6e", "#c58ad8"],
        "Holographic Parallel Rare": ["HPR", "#3f86c4", "#a98be0"],
        "Duel Terminal Normal Parallel Rare": ["DTC", "#1f3f8f", "#3a6fd8"],
        "Duel Terminal Normal Rare Parallel Rare": ["DTNR", "#1f3f8f", "#3a6fd8"],
        "Duel Terminal Rare Parallel Rare": ["DTR", "#1c3a86", "#3f7ae0"],
        "Duel Terminal Super Parallel Rare": ["DTSR", "#173278", "#4a86e8"],
        "Duel Terminal Ultra Parallel Rare": ["DTUR", "#142c6c", "#5a93f0"],
        "Duel Terminal Secret Parallel Rare": ["DTSE", "#7c1d2c", "#3a6fd8"],
        "Duel Terminal Technology Common": ["DTTC", "#2a4a7a", "#5f87b8"],
        "Duel Terminal Technology Ultra Rare": ["DTTU", "#24406e", "#7aa0d8"],
        "Holofoil Rare": ["HFR", "#2f7fb6", "#7ac3e8"],
        "Ultra Rare (Pharaoh's Rare)": ["URPR", "#8a6a1a", "#c9a04a"],
        "Ultra Pharaoh's Rare": ["UPhR", "#7a5a14", "#d1aa4c"],
        "Secret Pharaoh's Rare": ["SPhR", "#8a1f22", "#d1aa4c"],
        "Millennium Rare": ["MLR", "#6b5a2a", "#b89b52"],
        "Millennium Super Rare": ["MLSR", "#4a5a7a", "#b89b52"],
        "Millennium Ultra Rare": ["MLUR", "#8a6a1a", "#d8b85a"],
        "Millennium Secret Rare": ["MLSE", "#8a1f22", "#d8b85a"],
        "Millennium Gold Rare": ["MLGR", "#7a5a10", "#e8c35a"],
        "Kaiba Corporation Common": ["KCC", "#1d3b5c", "#7a8a9a"],
        "Kaiba Corporation Rare": ["KCR", "#1d3b5c", "#3a7ad8"],
        "Kaiba Corporation Super Rare": ["KCSR", "#1d3b5c", "#3aa6d8"],
        "Kaiba Corporation Ultra Rare": ["KCUR", "#1d3b5c", "#d1aa4c"],
        "Rush Rare": ["RR", "#a01a4a", "#e84a8a"],
        "Gold Rush Rare": ["GRR", "#8a6a1a", "#e84a8a"],
        "Over Rush Rare": ["ORR", "#4a1a8a", "#e84a8a"]
    },
    // Magic: the set symbol's colours, black to mythic orange.
    magic: {
        Common: ["C", "#1c1c1f", "#46464d"],
        Uncommon: ["U", "#5f6b75", "#a9b5bf"],
        Rare: ["R", "#8c6a1f", "#d4ad4f"],
        "Mythic Rare": ["M", "#a3351a", "#e8692b"],
        Special: ["S", "#5b2d8a", "#9a62d6"],
        Bonus: ["B", "#1d6b6b", "#3ba6a2"]
    },
    // Pokémon: the ladder from the plain symbols to the gold of the hyper rares.
    pokemon: {
        Common: ["C", "#3f4652", "#6b7686"],
        Uncommon: ["U", "#55697a", "#8fa8ba"],
        Rare: ["R", "#2a2a2e", "#55555d"],
        "Holo Rare": ["RH", "#2f6fae", "#62a8e4"],
        "Double Rare": ["RR", "#1e1e22", "#c0272f"],
        "Ultra Rare": ["UR", "#6c6f78", "#c9ccd4"],
        "ACE SPEC Rare": ["ACE", "#a3197a", "#e84aa6"],
        "Holo Rare V": ["V", "#2a2a2e", "#7a7f88"],
        "Holo Rare VMAX": ["VMAX", "#8a1f22", "#d84a3a"],
        "Holo Rare VSTAR": ["VSTR", "#8a6a1a", "#e2be4f"],
        "Rare Holo LV.X": ["LV.X", "#2a4a8a", "#7a8fc8"],
        "Rare PRIME": ["PRM", "#7a2a14", "#e2853a"],
        LEGEND: ["LGD", "#3a2a6a", "#c9a04a"],
        "Radiant Rare": ["RAD", "#b5651d", "#f2c14e"],
        "Amazing Rare": ["AR", "#3a7ad8", "#e84aa6"],
        "Illustration Rare": ["IR", "#a87a1f", "#e7c35a"],
        "Special Illustration Rare": ["SIR", "#9a6a10", "#f0cf6a"],
        "Full Art Trainer": ["FA", "#2a6a5a", "#4ac2a0"],
        "Classic Collection": ["CC", "#4a3a2a", "#a88a5a"],
        "Secret Rare": ["SR", "#8a6a1a", "#d4ad4f"],
        "Hyper Rare": ["HR", "#9a7514", "#f2d16a"],
        "Mega Hyper Rare": ["MHR", "#7a5a0a", "#ffe08a"],
        "Mega Attack Rare": ["MAR", "#6a1a8a", "#e2be4f"],
        "Shiny Rare": ["S", "#3a3a6a", "#8a8ad8"],
        "Shiny Ultra Rare": ["SSR", "#2a2a5a", "#b6b6f0"],
        "Shiny Rare V": ["SV", "#2a2a4a", "#7a7fd8"],
        "Shiny Rare VMAX": ["SVM", "#4a1a3a", "#d84a8a"],
        "Pikachu Rare": ["PIKA", "#b58a0a", "#f5d33a"],
        "Black White Rare": ["BWR", "#141414", "#a9a9a9"],
        "RGB Rare": ["RGB", "#c0272f", "#3a6fd8"],
        "Futuristic Rare": ["FUT", "#3a1a6a", "#4ac2d8"],
        Crown: ["CRW", "#8a6a1a", "#f0cf6a"],
        Promo: ["PR", "#1d3b5c", "#d84a3a"]
    }
};
const GREY = ["#3f4652", "#6b7686"];

// Letters for a rarity no table knows: its abbreviation, or its initials.
function letters(printing) {
    if (printing.rarity_code) return printing.rarity_code.slice(0, 5);
    return printing.rarity
        .split(/\s+/)
        .map((word) => word[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 4);
}

function drawnBadge(tag, dark, light) {
    // Narrower letters for longer tags, as in the pictures; never past the edges.
    const size = tag.length <= 2 ? 40 : tag.length === 3 ? 33 : 27;
    const fit = tag.length >= 4 ? ' textLength="70" lengthAdjust="spacingAndGlyphs"' : "";
    return `<svg viewBox="0 0 80 54" aria-hidden="true"><rect width="80" height="54" rx="6.5" fill="${light}"/><path d="M6.5 0H49.6L24 54H6.5A6.5 6.5 0 0 1 0 47.5V6.5A6.5 6.5 0 0 1 6.5 0Z" fill="${dark}"/><text x="40" y="29" dominant-baseline="central" text-anchor="middle" font-size="${size}"${fit}>${h(tag)}</text></svg>`;
}

function iconHtml(printing, known, game) {
    const picture = game === "yugioh" && known && PICTURES[printing.rarity];
    if (picture) return `<img src="${PICTURE_DIR}${picture}.png" alt="" width="80" height="54" decoding="async">`;
    if (!known) return drawnBadge("?", ...GREY);
    const [tag, dark, light] = DRAWN[game]?.[printing.rarity] || [letters(printing), ...GREY];
    return drawnBadge(tag, dark, light);
}

// printing: { rarity, rarity_code, rarity_family } as the API sends it (the
// demo store sends only the rarity); the game is the one on screen unless said.
export function rarityBadge(printing, game = window.game) {
    const known = Boolean(printing?.rarity) && printing.rarity !== "Unknown";
    const name = known ? printing.rarity : t("Sin documentar");
    const family = known ? printing.rarity_family : "other";
    const details = [
        known && printing.rarity_code,
        game === "yugioh" && NOTES[printing?.rarity],
        family && familyLabel(family, game)
    ];
    const tip = [name, ...details.filter(Boolean).map((part) => t(part))].join(" · ");
    return `<span class="rr-icon" role="img" tabindex="0" aria-label="${h(name)}" data-tip="${h(tip)}">${iconHtml(printing, known, game)}</span>`;
}

// A whole family is chosen with this prefix ("familia:gold").
const FAMILY_VALUE = "familia:";

// The rarity filter: one group per family with only the rarities the catalogue
// has. A family with several rarities can also be chosen whole; the basic one
// covers almost every card, so it cannot.
export function rarityOptionsHtml(groups, game = window.game) {
    const option = (value, label) => `<option value="${h(value)}">${h(label)}</option>`;
    return (
        option("", t("Todas las rarezas")) +
        groups
            .map(({ family, names }) => {
                const label = t(familyLabel(family, game));
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
