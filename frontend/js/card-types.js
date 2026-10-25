// Card type levels as each language prints them, and the type filters of the
// catalogue. Labels are written in Spanish and go through t() (frontend/i18n.js);
// the type line uses whole phrases ("Monstruo de Sincronía" → "Synchro
// Monster") because the word order changes between languages.
//
// The API returns canonical English codes (backend/app/services/card_types.py);
// this module only names them and builds the filters level by level:
//   Todas      → one "Tipo" list grouped by Monstruos / Magias / Trampas
//   Monstruos  → Clase · Habilidad · Tipo · Atributo · Nivel/Rango/Link
//   Magias     → Tipo de magia
//   Trampas    → Tipo de trampa
import { escapeHtml } from "./html.js";
import { locale, t } from "./lang.js";

const h = escapeHtml;

const KIND_LABELS = { Monster: "Monstruo", Spell: "Magia", Trap: "Trampa", Skill: "Carta de Habilidad" };

// The head of the type line, as printed on the card.
const MONSTER_LABELS = {
    Normal: "Monstruo Normal",
    Effect: "Monstruo de Efecto",
    Ritual: "Monstruo de Ritual",
    Fusion: "Monstruo de Fusión",
    Synchro: "Monstruo de Sincronía",
    Xyz: "Monstruo Xyz",
    Link: "Monstruo de Enlace",
    Token: "Ficha"
};
// Short labels for filter options, grouped as the cards are built into a deck.
const FRAME_OPTIONS = {
    Normal: "Normal",
    Effect: "Efecto",
    Ritual: "Ritual",
    Pendulum: "Péndulo",
    Fusion: "Fusión",
    Synchro: "Sincronía",
    Xyz: "Xyz",
    Link: "Enlace (Link)"
};
const FRAME_GROUPS = [
    ["Main Deck", ["Normal", "Effect", "Ritual", "Pendulum"]],
    ["Extra Deck", ["Fusion", "Synchro", "Xyz", "Link"]]
];
const ABILITY_LABELS = {
    Tuner: "Cantante",
    Flip: "Volteo",
    Gemini: "Géminis",
    Spirit: "Espíritu",
    Toon: "Toon",
    Union: "Unión"
};
const RACE_LABELS = {
    Aqua: "Aqua",
    Beast: "Bestia",
    "Beast-Warrior": "Guerrero-Bestia",
    "Creator God": "Dios Creador",
    Cyberse: "Ciberso",
    Dinosaur: "Dinosaurio",
    "Divine-Beast": "Bestia Divina",
    Dragon: "Dragón",
    Fairy: "Hada",
    Fiend: "Demonio",
    Fish: "Pez",
    Illusion: "Ilusión",
    Insect: "Insecto",
    Machine: "Máquina",
    Plant: "Planta",
    Psychic: "Psíquico",
    Pyro: "Piro",
    Reptile: "Reptil",
    Rock: "Roca",
    "Sea Serpent": "Serpiente Marina",
    Spellcaster: "Lanzador de Conjuros",
    Thunder: "Trueno",
    Warrior: "Guerrero",
    "Winged Beast": "Bestia Alada",
    Wyrm: "Wyrm",
    Zombie: "Zombi"
};
const ATTRIBUTE_LABELS = {
    LIGHT: "LUZ",
    DARK: "OSCURIDAD",
    EARTH: "TIERRA",
    WATER: "AGUA",
    FIRE: "FUEGO",
    WIND: "VIENTO",
    DIVINE: "DIVINIDAD"
};
const PROPERTY_LABELS = {
    Spell: {
        Normal: "Magia Normal",
        "Quick-Play": "Magia de Juego Rápido",
        Continuous: "Magia Continua",
        Equip: "Magia de Equipo",
        Field: "Magia de Campo",
        Ritual: "Magia de Ritual"
    },
    Trap: { Normal: "Trampa Normal", Continuous: "Trampa Continua", Counter: "Trampa de Contraefecto" }
};
const PROPERTY_OPTIONS = {
    Normal: "Normal",
    "Quick-Play": "Juego rápido",
    Continuous: "Continua",
    Equip: "Equipo",
    Field: "Campo",
    Ritual: "Ritual",
    Counter: "Contraefecto"
};
// "Tipo de carta" in the Todas tab: whole phrases, so the closed list reads well.
const KIND_PHRASES = {
    Monster: {
        all: "Todos los monstruos",
        Normal: "Monstruos normales",
        Effect: "Monstruos de efecto",
        Ritual: "Monstruos de ritual",
        Pendulum: "Monstruos de péndulo",
        Fusion: "Monstruos de fusión",
        Synchro: "Monstruos de sincronía",
        Xyz: "Monstruos Xyz",
        Link: "Monstruos de enlace (Link)"
    },
    Spell: {
        all: "Todas las magias",
        Normal: "Magias normales",
        "Quick-Play": "Magias de juego rápido",
        Continuous: "Magias continuas",
        Equip: "Magias de equipo",
        Field: "Magias de campo",
        Ritual: "Magias de ritual"
    },
    Trap: {
        all: "Todas las trampas",
        Normal: "Trampas normales",
        Continuous: "Trampas continuas",
        Counter: "Trampas de contraefecto"
    }
};

// "Monstruo de Sincronía / Cantante · Dragón · LUZ · Nivel 7"
// "Monstruo de Efecto / Péndulo · Lanzador de Conjuros · OSCURIDAD · Nivel 4"
// "Magia de Campo" · "Trampa de Contraefecto"
export function typeLine(card) {
    const types = card.types;
    if (!types?.kind) return t(KIND_LABELS[card.card_type] || card.card_type || "Sin clasificar");
    if (types.kind !== "Monster")
        return t(PROPERTY_LABELS[types.kind]?.[types.property] || KIND_LABELS[types.kind]);
    const head = t(MONSTER_LABELS[types.frame] || "Monstruo");
    // Pendulum sits on top of a frame: "Monstruo de Efecto / Péndulo".
    const abilities = [
        ...(types.pendulum ? [t("Péndulo")] : []),
        ...types.abilities.map((ability) => (ABILITY_LABELS[ability] ? t(ABILITY_LABELS[ability]) : ability))
    ];
    return [
        [head, ...abilities].join(" / "),
        RACE_LABELS[types.race] ? t(RACE_LABELS[types.race]) : types.race,
        ATTRIBUTE_LABELS[types.attribute] ? t(ATTRIBUTE_LABELS[types.attribute]) : types.attribute,
        starsLabel(types)
    ]
        .filter(Boolean)
        .join(" · ");
}

// Link monsters have a rating, Xyz a rank, the rest a level (0 is valid).
function starsLabel({ link_rating, rank, level }) {
    if (link_rating != null) return `LINK-${link_rating}`;
    if (rank != null) return t("Rango {number}", { number: rank });
    if (level != null) return t("Nivel {number}", { number: level });
    return "";
}

// ---- Filters ---------------------------------------------------------------

// Each filter: element id, URL parameter, API parameter, label, tabs.
export const TYPE_FILTERS = [
    { id: "f-type", param: "tipo", label: "Tipo de carta", tabs: ["Todas"] },
    { id: "f-frame", param: "clase", api: "frame", label: "Clase", tabs: ["Monstruo"] },
    { id: "f-ability", param: "hab", api: "ability", label: "Habilidad", tabs: ["Monstruo"] },
    { id: "f-race", param: "raza", api: "race", label: "Tipo de monstruo", tabs: ["Monstruo"] },
    { id: "f-attribute", param: "atr", api: "attribute", label: "Atributo", tabs: ["Monstruo"] },
    { id: "f-level", param: "nivel", label: "Nivel, Rango o Link", tabs: ["Monstruo"] },
    {
        id: "f-property",
        param: "prop",
        api: "property",
        label: { Magia: "Tipo de magia", Trampa: "Tipo de trampa" },
        tabs: ["Magia", "Trampa"]
    }
];

// The three numbers of a monster, each with its own API parameter.
const STAR_PARAMS = { level: "level", rank: "rank", link: "link_rating" };

// Labels are translated here, so the tables above stay in one language.
const option = (value, label) => `<option value="${h(value)}">${h(t(label))}</option>`;
const group = (label, html) => (html ? `<optgroup label="${h(t(label))}">${html}</optgroup>` : "");
const labelOf = (filter, tab) => t(typeof filter.label === "string" ? filter.label : filter.label[tab]);
const byLabel = (a, b) => t(a[1]).localeCompare(t(b[1]), locale);

// Values read "Monster::" (every monster) or "Monster:frame:Effect" (one kind).
function cardTypeOptions(types) {
    const kind = (code, level, values) =>
        option(`${code}::`, KIND_PHRASES[code].all) +
        values.map((value) => option(`${code}:${level}:${value}`, KIND_PHRASES[code][value])).join("");
    const frames = FRAME_GROUPS.flatMap(([, values]) => values).filter((value) =>
        types.monster.frames.includes(value)
    );
    return (
        option("", "Todos los tipos") +
        group("Monstruos", kind("Monster", "frame", frames)) +
        group("Magias", kind("Spell", "property", types.spell)) +
        group("Trampas", kind("Trap", "property", types.trap))
    );
}

// Values read "level:4", "rank:4" or "link:2": three different numbers on a card.
function starOptions(types) {
    const numbers = (kind, values, label) =>
        values.map((value) => option(`${kind}:${value}`, label(value))).join("");
    return (
        option("", "Cualquier nivel, rango o Link") +
        group("Nivel", numbers("level", types.levels || [], (value) => t("Nivel {number}", { number: value }))) +
        group("Rango (Xyz)", numbers("rank", types.ranks || [], (value) => t("Rango {number}", { number: value }))) +
        group("Link", numbers("link", types.link_ratings || [], (value) => `LINK-${value}`))
    );
}

function optionsFor(filter, tab, types) {
    switch (filter.id) {
        case "f-type":
            return cardTypeOptions(types);
        case "f-frame":
            return (
                option("", "Todas las clases") +
                FRAME_GROUPS.map(([label, values]) =>
                    group(
                        label,
                        values
                            .filter((value) => types.monster.frames.includes(value))
                            .map((value) => option(value, FRAME_OPTIONS[value]))
                            .join("")
                    )
                ).join("")
            );
        case "f-ability": {
            // Cantante (Tuner) is by far the most searched; the rest alphabetically.
            const abilities = [...types.monster.abilities].sort((a, b) =>
                a === "Tuner" ? -1 : b === "Tuner" ? 1 : byLabel([a, ABILITY_LABELS[a]], [b, ABILITY_LABELS[b]])
            );
            return (
                option("", "Cualquier habilidad") +
                abilities.map((value) => option(value, ABILITY_LABELS[value])).join("")
            );
        }
        case "f-race":
            return (
                option("", "Todos los tipos de monstruo") +
                (types.races_present.length ? types.races_present : types.monster.races)
                    .map((value) => [value, RACE_LABELS[value] || value])
                    .sort(byLabel)
                    .map(([value, label]) => option(value, label))
                    .join("")
            );
        case "f-attribute":
            return (
                option("", "Todos los atributos") +
                (types.attributes_present?.length ? types.attributes_present : types.monster.attributes)
                    .map((value) => option(value, ATTRIBUTE_LABELS[value]))
                    .join("")
            );
        case "f-level":
            return starOptions(types);
        case "f-property": {
            const values = tab === "Magia" ? types.spell : types.trap;
            const all = tab === "Magia" ? "Todas las magias" : "Todas las trampas";
            return option("", all) + values.map((value) => option(value, PROPERTY_OPTIONS[value])).join("");
        }
        default:
            return "";
    }
}

// The filters of a tab, as <select> elements (labels kept for screen readers).
export function typeFiltersHtml(tab, types) {
    return TYPE_FILTERS.filter((filter) => filter.tabs.includes(tab))
        .map((filter) => {
            const label = labelOf(filter, tab);
            return `<select id="${filter.id}" aria-label="${h(label)}" title="${h(label)}">${optionsFor(
                filter,
                tab,
                types
            )}</select>`;
        })
        .join("");
}

// API parameters from the filters on screen.
export function typeParams() {
    const params = {};
    for (const filter of TYPE_FILTERS) {
        const value = document.getElementById(filter.id)?.value;
        if (!value) continue;
        if (filter.id === "f-type") {
            // "Monster::" is every monster; "Monster:frame:Effect" one kind of them.
            const [kind, level, code] = value.split(":");
            params.card_type = kind;
            if (level) params[level] = code;
        } else if (filter.id === "f-level") {
            const [kind, number] = value.split(":");
            if (STAR_PARAMS[kind]) params[STAR_PARAMS[kind]] = number;
        } else params[filter.api] = value;
    }
    return params;
}
