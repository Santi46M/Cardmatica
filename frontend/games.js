// The card games of the site: each one is a marketplace of its own, with its
// address, markets, tabs and the filters each tab asks the API for.
//
// The cover (/) shows one box per game (frontend/js/portal.js); choosing one
// opens its marketplace (/yugioh, /magic, /pokemon), with the same layout as
// Yu-Gi-Oh!'s. Every market code belongs to one game (backend/app/core/games.py),
// so a list asked by market is also a list of that game.
//
// A classic script, loaded before the demo store and the modules, which read
// window.GAMES. Labels are in Spanish and go through t() where they are shown.

/* exported GAMES, GAME_ORDER, GAME_TAB_LABELS, gameFromPath, gameOfMarket, marketInfo, marketTagText */
var GAMES = {
    yugioh: {
        name: "Yu-Gi-Oh!",
        path: "/yugioh",
        // On the cover: a line under the name and the colours of its box.
        tagline: "TCG y OCG: monstruos, magias y trampas, banlist y rarezas de cada impresión.",
        colors: ["#6b3fa0", "#c9a24a"],
        markets: [
            { code: "TCG", label: "TCG", name: "TCG", tag: "TCG", title: "Cartas occidentales" },
            { code: "OCG", label: "OCG", name: "OCG", tag: "OCG", title: "Cartas asiáticas" }
        ],
        tabs: ["Inicio", "Todas", "Monstruo", "Magia", "Trampa", "Productos", "Vendedores", "Deseados"],
        // What each card tab asks the API (/api/v1/cards).
        params: { Monstruo: { card_type: "Monster" }, Magia: { card_type: "Spell" }, Trampa: { card_type: "Trap" } },
        search: "Nombre, código, set o arquetipo",
        banlist: true,
        news: "yugioh"
    },
    magic: {
        name: "Magic: The Gathering",
        short: "Magic",
        path: "/magic",
        tagline: "Cartas sueltas de cada set, en foil o no, con sus formatos; sobres y mazos Commander.",
        colors: ["#b5462f", "#1f5f8f"],
        // One market: every language is printed in the same sets.
        markets: [{ code: "MTG", label: "Magic", name: "Magic", tag: "", title: "Cartas de Magic: The Gathering" }],
        tabs: [
            "Inicio",
            "Todas",
            "Criatura",
            "Instantaneo",
            "Conjuro",
            "Artefacto",
            "Encantamiento",
            "Tierra",
            "Productos",
            "Vendedores",
            "Deseados"
        ],
        // A Magic card has several types ("Artifact Creature"): each tab lists
        // every card of that type. Planeswalkers and battles are in "Todas", by type.
        params: {
            Criatura: { subtype: "Creature" },
            Instantaneo: { subtype: "Instant" },
            Conjuro: { subtype: "Sorcery" },
            Artefacto: { subtype: "Artifact" },
            Encantamiento: { subtype: "Enchantment" },
            Planeswalker: { subtype: "Planeswalker" },
            Tierra: { subtype: "Land" }
        },
        search: "Nombre, set o número de coleccionista"
    },
    pokemon: {
        name: "Pokémon",
        path: "/pokemon",
        tagline: "Internacional y japonés: Pokémon, Entrenadores y Energías con sus variantes holo.",
        colors: ["#d8a31a", "#2a6fb5"],
        markets: [
            { code: "PKM", label: "INT", name: "Internacional", tag: "INT", title: "Cartas en inglés, español, portugués y otros idiomas occidentales" },
            { code: "PKMJ", label: "JP", name: "Japonés", tag: "JP", title: "Cartas japonesas, con sus propios sets y numeración" }
        ],
        tabs: ["Inicio", "Todas", "Pokemon", "Entrenador", "Energia", "Productos", "Vendedores", "Deseados"],
        params: { Pokemon: { card_type: "Pokemon" }, Entrenador: { card_type: "Trainer" }, Energia: { card_type: "Energy" } },
        search: "Nombre, set o número"
    }
};
var GAME_ORDER = ["yugioh", "magic", "pokemon"];

// Tab names of every game, as the tab bar shows them.
var GAME_TAB_LABELS = {
    Inicio: "Inicio",
    Todas: "Todas las cartas",
    Monstruo: "Monstruos",
    Magia: "Magias",
    Trampa: "Trampas",
    Criatura: "Criaturas",
    Instantaneo: "Instantáneos",
    Conjuro: "Conjuros",
    Artefacto: "Artefactos",
    Encantamiento: "Encantamientos",
    Planeswalker: "Planeswalkers",
    Tierra: "Tierras",
    Pokemon: "Pokémon",
    Entrenador: "Entrenadores",
    Energia: "Energías",
    Productos: "Cajas y accesorios",
    Vendedores: "Vendedores",
    Deseados: "Lista de deseados"
};

// "/magic", "/magic/…" → "magic"; anything else (the cover, a card) → null.
function gameFromPath(pathname) {
    var first = String(pathname || "").split("/")[1] || "";
    return GAMES[first] ? first : null;
}

// The game whose market this is ("PKMJ" → "pokemon").
function gameOfMarket(code) {
    for (var key in GAMES) if (GAMES[key].markets.some((market) => market.code === code)) return key;
    return null;
}

// A market's entry: code, label (its button), name (in a sentence), tag (in a list), title.
function marketInfo(code) {
    var game = GAMES[gameOfMarket(code)];
    return game ? game.markets.find((market) => market.code === code) : null;
}

// What sets a market apart in a list: "OCG", "JP"; nothing for a game with one market.
function marketTagText(code) {
    var info = marketInfo(code);
    return info ? info.tag : code || "";
}
