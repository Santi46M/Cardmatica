// Card type levels in Spanish, and the type filters of the catalogue.
//
// The API returns canonical English codes (backend/app/services/card_types.py);
// this module only names them and builds the filters level by level:
//   Todas      → one "Tipo" list grouped by Monstruos / Magias / Trampas
//   Monstruos  → Clase · Habilidad · Tipo · Atributo · Nivel/Rango/Link
//   Magias     → Tipo de magia
//   Trampas    → Tipo de trampa
import { escapeHtml } from "./html.js";

const h = escapeHtml;

const KIND_LABELS = { Monster: "Monstruo", Spell: "Magia", Trap: "Trampa", Skill: "Habilidad" };

// Labels as the card's type line reads in Spanish ("Monstruo de Sincronía").
const FRAME_LABELS = {
    Normal: "Normal",
    Effect: "de Efecto",
    Ritual: "de Ritual",
    Fusion: "de Fusión",
    Synchro: "de Sincronía",
    Xyz: "Xyz",
    Link: "de Enlace",
    Token: "Ficha"
};
// Short labels for filter options.
const FRAME_OPTIONS = {
    Normal: "Normal",
    Effect: "Efecto",
    Ritual: "Ritual",
    Fusion: "Fusión",
    Synchro: "Sincronía",
    Xyz: "Xyz",
    Link: "Enlace (Link)",
    Pendulum: "Péndulo"
};
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
        Normal: "Normal",
        "Quick-Play": "de Juego Rápido",
        Continuous: "Continua",
        Equip: "de Equipo",
        Field: "de Campo",
        Ritual: "de Ritual"
    },
    Trap: { Normal: "Normal", Continuous: "Continua", Counter: "de Contraefecto" }
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
// Levels 1–12 and ranks 0–13 cover every card printed so far.
const LEVELS = Array.from({ length: 14 }, (_, index) => index);

// "Monstruo de Sincronía / Cantante · Dragón · LUZ · Nivel 7"
// "Monstruo de Efecto / Péndulo · Lanzador de Conjuros · OSCURIDAD · Nivel 4"
// "Magia de Campo" · "Trampa de Contraefecto"
export function typeLine(card) {
    const types = card.types;
    if (!types?.kind) return KIND_LABELS[card.card_type] || card.card_type || "Sin clasificar";
    if (types.kind !== "Monster") {
        const property = PROPERTY_LABELS[types.kind]?.[types.property];
        return [KIND_LABELS[types.kind], property].filter(Boolean).join(" ");
    }
    const head = types.frame ? `Monstruo ${FRAME_LABELS[types.frame]}` : "Monstruo";
    // Pendulum sits on top of a frame: "Monstruo de Efecto / Péndulo".
    const abilities = [
        ...(types.pendulum ? ["Péndulo"] : []),
        ...types.abilities.map((ability) => ABILITY_LABELS[ability] || ability)
    ];
    const stars =
        types.link_rating !== null && types.link_rating !== undefined
            ? `LINK-${types.link_rating}`
            : types.rank !== null && types.rank !== undefined
              ? `Rango ${types.rank}`
              : types.level !== null && types.level !== undefined
                ? `Nivel ${types.level}`
                : "";
    return [
        [head, ...abilities].join(" / "),
        RACE_LABELS[types.race] || types.race,
        ATTRIBUTE_LABELS[types.attribute] || types.attribute,
        stars
    ]
        .filter(Boolean)
        .join(" · ");
}

// ---- Filters ---------------------------------------------------------------

// Each filter: element id, URL parameter, API parameter, label.
export const TYPE_FILTERS = [
    { id: "f-type", param: "tipo", label: "Tipo de carta", tabs: ["Todas"] },
    { id: "f-frame", param: "clase", api: "frame", label: "Clase", tabs: ["Monstruo"] },
    { id: "f-ability", param: "hab", api: "ability", label: "Habilidad", tabs: ["Monstruo"] },
    { id: "f-race", param: "raza", api: "race", label: "Tipo de monstruo", tabs: ["Monstruo"] },
    { id: "f-attribute", param: "atr", api: "attribute", label: "Atributo", tabs: ["Monstruo"] },
    { id: "f-level", param: "nivel", api: "level", label: "Nivel / Rango / Link", tabs: ["Monstruo"] },
    { id: "f-property", param: "prop", api: "property", label: "Tipo", tabs: ["Magia", "Trampa"] }
];

const option = (value, label) => `<option value="${h(value)}">${h(label)}</option>`;

function optionsFor(filter, tab, types) {
    switch (filter.id) {
        case "f-type":
            // One list, grouped by kind: the first level of the index.
            return `${option("", "Todos los tipos")}<optgroup label="Monstruos">${types.monster.frames
                .map((value) => option(`Monster:frame:${value}`, `Monstruo · ${FRAME_OPTIONS[value]}`))
                .join("")}</optgroup><optgroup label="Magias">${types.spell
                .map((value) => option(`Spell:property:${value}`, `Magia · ${PROPERTY_OPTIONS[value]}`))
                .join("")}</optgroup><optgroup label="Trampas">${types.trap
                .map((value) => option(`Trap:property:${value}`, `Trampa · ${PROPERTY_OPTIONS[value]}`))
                .join("")}</optgroup>`;
        case "f-frame":
            return option("", "Todas las clases") + types.monster.frames.map((value) => option(value, FRAME_OPTIONS[value])).join("");
        case "f-ability":
            return option("", "Cualquier habilidad") + types.monster.abilities.map((value) => option(value, ABILITY_LABELS[value])).join("");
        case "f-race":
            return (
                option("", "Todos los tipos") +
                (types.races_present.length ? types.races_present : types.monster.races)
                    .map((value) => [value, RACE_LABELS[value] || value])
                    .sort((a, b) => a[1].localeCompare(b[1], "es"))
                    .map(([value, label]) => option(value, label))
                    .join("")
            );
        case "f-attribute":
            return option("", "Todos los atributos") + types.monster.attributes.map((value) => option(value, ATTRIBUTE_LABELS[value])).join("");
        case "f-level":
            return option("", "Cualquier nivel") + LEVELS.map((value) => option(value, String(value))).join("");
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
        .map(
            (filter) =>
                `<select id="${filter.id}" aria-label="${h(filter.label)}" title="${h(filter.label)}">${optionsFor(
                    filter,
                    tab,
                    types
                )}</select>`
        )
        .join("");
}

// API parameters from the filters on screen.
export function typeParams() {
    const params = {};
    for (const filter of TYPE_FILTERS) {
        const value = document.getElementById(filter.id)?.value;
        if (!value) continue;
        if (filter.id === "f-type") {
            const [kind, level, code] = value.split(":");
            params.card_type = kind;
            params[level] = code;
        } else params[filter.api] = value;
    }
    return params;
}
