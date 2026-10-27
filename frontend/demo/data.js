// Datos del comercio de demostración (pestañas "Productos" y "Vendedores").
//
// Vendedores, precios, stock y tipos de cambio son inventados para poder
// probar la tienda; cartas, sets y productos son reales (ver más abajo). El
// catálogo real de cartas llega desde la API (frontend/js/catalog.js) y nunca
// usa estos datos.
//
// store.js lee este archivo y genera con él las cartas, el stock y el
// historial de precios. Para cambiar la demo basta con editar estas tablas.

/* exported DEMO */
var DEMO = {};

// Los nombres, códigos, rarezas y fechas de sets, cartas y productos son reales
// (Yugipedia y páginas de Konami, Dragon Shield, Ultra Pro, Ultimate Guard y
// Chessex; consultados en octubre de 2026). Lo inventado son los vendedores,
// los precios, el stock y su historial.

// Tipos de producto de los que puede salir una impresión.
DEMO.setTypes = {
    B: "Booster",
    S: "Starter Deck",
    X: "Caja de coleccionista",
    C: "Mazos Commander",
    P: "Set especial",
    J: "Jumpstart"
};

// Sets por prefijo de código, con su primer lanzamiento en inglés (o en
// japonés, los de la OCG). "type" es una clave de DEMO.setTypes.
DEMO.sets = {
    LOB: { name: "Legend of Blue Eyes White Dragon", type: "B", released: "2002-03-08" },
    SDK: { name: "Starter Deck: Kaiba", type: "S", released: "2002-03-29" },
    SDY: { name: "Starter Deck: Yugi", type: "S", released: "2002-03-29" },
    MRD: { name: "Metal Raiders", type: "B", released: "2002-06-26" },
    KACB: { name: "Kaiba's Collector Box", type: "X", released: "2017-11-17" },
    RC04: { name: "Rarity Collection Quarter Century Edition", type: "B", released: "2023-02-18" },
    RA01: { name: "25th Anniversary Rarity Collection", type: "B", released: "2023-11-02" },
    SBC2: { name: "Speed Duel: Battle City Finals", type: "X", released: "2024-12-13" },
    BPRO: { name: "Burst Protocol", type: "B", released: "2026-02-06" },
    RA05: { name: "Rarity Collection 5", type: "B", released: "2026-04-17" },
    BLZD: { name: "Blazing Dominion", type: "B", released: "2026-05-08" },
    CORI: { name: "Chaos Origins", type: "B", released: "2026-07-03" },
    MAMO: { name: "Magnificent Monsters", type: "B", released: "2026-09-04" },
    BETB: { name: "Beyond the Brave", type: "B", released: "2026-10-09" },

    // Magic: The Gathering, by Scryfall's set code (Forge's edition files,
    // consulted in October 2026).
    FDN: { game: "magic", name: "Foundations", type: "B", released: "2024-11-15" },
    J25: { game: "magic", name: "Foundations Jumpstart", type: "J", released: "2024-11-15" },
    FDC: { game: "magic", name: "Foundations Commander", type: "C", released: "2024-11-15" },
    DSC: { game: "magic", name: "Duskmourn: House of Horror Commander", type: "C", released: "2024-09-27" },
    TLE: { game: "magic", name: "Avatar: The Last Airbender Eternal", type: "P", released: "2025-11-21" },
    ECL: { game: "magic", name: "Lorwyn Eclipsed", type: "B", released: "2026-01-23" },
    ECC: { game: "magic", name: "Lorwyn Eclipsed Commander", type: "C", released: "2026-01-23" },
    TMT: { game: "magic", name: "Teenage Mutant Ninja Turtles", type: "B", released: "2026-03-06" },
    SOS: { game: "magic", name: "Secrets of Strixhaven", type: "B", released: "2026-04-24" },
    SOC: { game: "magic", name: "Secrets of Strixhaven Commander", type: "C", released: "2026-04-24" },
    MSH: { game: "magic", name: "Marvel Super Heroes", type: "B", released: "2026-06-26" },
    MSC: { game: "magic", name: "Marvel Super Heroes Commander", type: "C", released: "2026-06-26" },
    HOB: { game: "magic", name: "The Hobbit", type: "B", released: "2026-08-14" },
    HOC: { game: "magic", name: "The Hobbit Eternal", type: "C", released: "2026-08-14" },
    FRA: { game: "magic", name: "Reality Fracture", type: "B", released: "2026-10-02" },
    FRC: { game: "magic", name: "Reality Fracture Commander", type: "C", released: "2026-10-02" },

    // Pokémon, by the set's official abbreviation (TCGdex's open database,
    // consulted in October 2026). The Japanese sets are their own market.
    PAL: { game: "pokemon", name: "Paldea Evolved", type: "B", released: "2023-06-09" },
    TEF: { game: "pokemon", name: "Temporal Forces", type: "B", released: "2024-03-22" },
    SSP: { game: "pokemon", name: "Surging Sparks", type: "B", released: "2024-11-08" },
    PRE: { game: "pokemon", name: "Prismatic Evolutions", type: "P", released: "2025-01-17" },
    MEE: { game: "pokemon", name: "Mega Evolution Energy", type: "B", released: "2025-09-25" },
    MEG: { game: "pokemon", name: "Mega Evolution", type: "B", released: "2025-09-26" },
    PFL: { game: "pokemon", name: "Phantasmal Flames", type: "B", released: "2025-11-14" },
    ASC: { game: "pokemon", name: "Ascended Heroes", type: "P", released: "2026-01-30" },
    POR: { game: "pokemon", name: "Perfect Order", type: "B", released: "2026-03-27" },
    CRI: { game: "pokemon", name: "Chaos Rising", type: "B", released: "2026-05-22" },
    PBL: { game: "pokemon", name: "Pitch Black", type: "B", released: "2026-07-17" },
    "30C": { game: "pokemon", name: "30th Celebration", type: "P", released: "2026-09-16" },
    M1L: { game: "pokemon", name: "Mega Brave", type: "B", released: "2025-08-01" },
    M1S: { game: "pokemon", name: "Mega Symphonia", type: "B", released: "2025-08-01" },
    M2: { game: "pokemon", name: "Inferno X", type: "B", released: "2025-09-26" },
    M4: { game: "pokemon", name: "Ninja Spinner", type: "B", released: "2026-03-13" },
    M5: { game: "pokemon", name: "Abyss Eye", type: "B", released: "2026-05-22" }
};

// Rarezas por abreviatura, con el nombre que usan Cardmarket y TCGplayer.
// "priceFactor" multiplica el precio base de la carta; "tone" es el color de la
// etiqueta, el mismo que usa el catálogo real (frontend/js/rarities.js).
DEMO.rarities = {
    C: { name: "Common", priceFactor: 1, tone: "common" },
    SR: { name: "Super Rare", priceFactor: 2.4, tone: "super" },
    UR: { name: "Ultra Rare", priceFactor: 4, tone: "ultra" },
    ScR: { name: "Secret Rare", priceFactor: 6, tone: "secret" },
    PlScR: { name: "Platinum Secret Rare", priceFactor: 12, tone: "secret" },
    QCScR: { name: "Quarter Century Secret Rare", priceFactor: 15, tone: "secret" },
    StR: { name: "Starlight Rare", priceFactor: 30, tone: "premium" },
    // Magic: the four rarities of every set (Scryfall).
    MC: { name: "Common", priceFactor: 1, tone: "common" },
    MU: { name: "Uncommon", priceFactor: 1.6, tone: "rare" },
    MR: { name: "Rare", priceFactor: 5, tone: "gold" },
    MM: { name: "Mythic Rare", priceFactor: 10, tone: "mythic" },
    // Pokémon, as TCGdex, Cardmarket and TCGplayer name them.
    PC: { name: "Common", priceFactor: 1, tone: "common" },
    PU: { name: "Uncommon", priceFactor: 1.3, tone: "rare" },
    PRR: { name: "Double Rare", priceFactor: 4, tone: "ultra" },
    PACE: { name: "ACE SPEC Rare", priceFactor: 3, tone: "ultra" },
    PUR: { name: "Ultra Rare", priceFactor: 8, tone: "ultra" },
    PIR: { name: "Illustration Rare", priceFactor: 6, tone: "premium" },
    PSIR: { name: "Special Illustration Rare", priceFactor: 25, tone: "premium" },
    PSR: { name: "Secret Rare", priceFactor: 10, tone: "secret" },
    PHR: { name: "Hyper Rare", priceFactor: 15, tone: "secret" },
    PMAR: { name: "Mega Attack Rare", priceFactor: 12, tone: "secret" },
    PMHR: { name: "Mega Hyper Rare", priceFactor: 40, tone: "secret" }
};

// Estados de conservación, del mejor al peor. Los colores llevan texto blanco
// con contraste de al menos 4,5:1.
DEMO.conditions = [
    { code: "MT", name: "Mint", color: "#1b7f4d" },
    { code: "NM", name: "Near Mint", color: "#23804a" },
    { code: "EX", name: "Excelente", color: "#4f7f37" },
    { code: "GD", name: "Bueno", color: "#876a12" },
    { code: "LP", name: "Poco jugado", color: "#a35714" },
    { code: "PL", name: "Jugado", color: "#c0392b" },
    { code: "PO", name: "Pobre", color: "#7b241c" }
];

// Color del marco de la miniatura según el subtipo de monstruo. El primero
// que coincida gana, salvo Normal y Efecto, que solo se usan si no hay otro.
DEMO.frameColors = {
    Link: "#1f4f8f",
    Xyz: "#2a2a30",
    Sincro: "#d8d8dc",
    "Fusión": "#7a4aa0",
    Ritual: "#3b6fb5",
    "Péndulo": "#2f9a8a",
    Efecto: "#b5622f",
    Normal: "#c9a24a"
};
DEMO.spellColor = "#1f8f7a";
DEMO.trapColor = "#a33a7b";
// Magic: the colour of the card's frame (gold for several colours).
DEMO.manaColors = {
    W: "#b8ad8a",
    U: "#2f6db0",
    B: "#3a3238",
    R: "#b5462f",
    G: "#2f7a45",
    multi: "#b8902f",
    colorless: "#7d8590"
};
// Pokémon: the colour of each energy type (and of Trainers and Energies).
DEMO.energyColors = {
    Grass: "#3f8f3a",
    Fire: "#c4512b",
    Water: "#2f78b8",
    Lightning: "#c9a51e",
    Psychic: "#8b4f9e",
    Fighting: "#a0652f",
    Darkness: "#2f3640",
    Metal: "#7b8794",
    Dragon: "#8a7a2a",
    Fairy: "#c0628f",
    Colorless: "#9a9488",
    Entrenador: "#5a6b82",
    Energia: "#6d7f3a"
};
// Pokémon's words (stages, trainer kinds, energy types) as the Spanish cards
// print them (TCGdex's translations); t() gives the Portuguese and English ones.
DEMO.pokemonWords = {
    Basic: "Básico",
    Stage1: "Fase 1",
    Stage2: "Fase 2",
    ex: "ex",
    Supporter: "Partidario",
    Item: "Objeto",
    Stadium: "Estadio",
    Tool: "Herramienta",
    Normal: "Básica",
    Special: "Especial",
    Grass: "Planta",
    Fire: "Fuego",
    Water: "Agua",
    Lightning: "Rayo",
    Psychic: "Psíquico",
    Fighting: "Lucha",
    Darkness: "Oscura",
    Metal: "Metálica",
    Dragon: "Dragón",
    Fairy: "Hada",
    Colorless: "Incolora"
};

// Idiomas. El de cada carta sale del código de su impresión (LOB-EN001 es
// inglés, RC04-JP003 japonés; los códigos sin idioma, como SDK-001, son de la
// primera edición norteamericana, en inglés). Los productos sellados TCG se
// venden en los idiomas occidentales. "priceFactor" ajusta el precio de las
// versiones OCG respecto a la TCG.
DEMO.languages = {
    ES: { name: "Español" },
    EN: { name: "Inglés" },
    FR: { name: "Francés" },
    DE: { name: "Alemán" },
    IT: { name: "Italiano" },
    JP: { name: "Japonés", priceFactor: 0.8 },
    PT: { name: "Portugués" }
};
DEMO.tcgLanguages = ["ES", "EN", "FR", "DE", "IT"];
DEMO.ocgLanguages = ["JP"];
// Languages sealed products come in, per market. Magic prints in English,
// Spanish, French, German, Italian and Japanese; Pokémon also in Portuguese.
DEMO.marketLanguages = {
    TCG: DEMO.tcgLanguages,
    OCG: DEMO.ocgLanguages,
    MTG: ["ES", "EN", "FR", "DE", "IT", "JP"],
    PKM: ["ES", "PT", "EN", "FR", "DE", "IT"],
    PKMJ: ["JP"]
};

// Cartas de la demo. Cada impresión es "CÓDIGO:RAREZA", con la rareza como
// clave de DEMO.rarities, de la más reciente a la más antigua; "ocg" son las
// impresiones japonesas, que forman la versión OCG de la carta. "level" es el
// nivel, el rango (Xyz) o el valor LINK. "basePrice" está en euros para una
// Common en buen estado (inventado).
DEMO.cards = [
    { name: "Blue-Eyes White Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "LUZ", level: 8, atk: 3000, def: 2500, basePrice: 6, printings: ["SBC2-ENB02:C", "KACB-EN001:UR", "LOB-EN001:UR", "SDK-001:UR"] },
    { name: "Dark Magician", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 7, atk: 2500, def: 2100, basePrice: 5, printings: ["LOB-EN005:UR", "SDY-006:UR"] },
    { name: "Red-Eyes Black Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 7, atk: 2400, def: 2000, basePrice: 4, printings: ["LOB-EN070:UR"] },
    { name: "Tri-Horned Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 8, atk: 2850, def: 2350, basePrice: 2, printings: ["RA05-EN001:StR", "LOB-EN000:ScR"] },
    { name: "Gaia The Fierce Knight", kind: "Monstruo", subtypes: ["Normal"], attribute: "TIERRA", level: 7, atk: 2300, def: 2100, basePrice: 2, printings: ["LOB-EN006:UR", "SDY-007:C"] },
    { name: "Summoned Skull", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 6, atk: 2500, def: 1200, basePrice: 2, printings: ["MRD-EN003:UR", "SDY-004:C"] },
    { name: "Celtic Guardian", kind: "Monstruo", subtypes: ["Normal"], attribute: "TIERRA", level: 4, atk: 1400, def: 1200, basePrice: 0.8, printings: ["LOB-EN007:SR", "SDY-009:C"] },
    { name: "Mystical Elf", kind: "Monstruo", subtypes: ["Normal"], attribute: "LUZ", level: 4, atk: 800, def: 2000, basePrice: 0.8, printings: ["LOB-EN062:SR", "SDY-001:C"] },
    { name: "Curse of Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 5, atk: 2000, def: 1500, basePrice: 0.8, printings: ["LOB-EN066:SR", "SDY-008:C"] },
    { name: "Kuriboh", kind: "Monstruo", subtypes: ["Efecto"], attribute: "OSCURIDAD", level: 1, atk: 300, def: 200, basePrice: 2, printings: ["MRD-EN071:SR"] },
    { name: "Lord of D.", kind: "Monstruo", subtypes: ["Efecto"], attribute: "OSCURIDAD", level: 4, atk: 1200, def: 1100, basePrice: 1, printings: ["SDK-041:SR"] },
    { name: "Nibiru, the Primal Being", kind: "Monstruo", subtypes: ["Efecto"], attribute: "LUZ", level: 11, atk: 3000, def: 600, basePrice: 1.5, printings: ["RA01-EN015:QCScR", "RA01-EN015:PlScR"], ocg: ["RC04-JP016:QCScR", "RC04-JP016:ScR"] },
    { name: "Effect Veiler", kind: "Monstruo", subtypes: ["Efecto", "Tuner"], attribute: "LUZ", level: 1, atk: 0, def: 0, basePrice: 1, printings: ["RA01-EN003:QCScR", "RA01-EN003:PlScR"], ocg: ["RC04-JP003:QCScR", "RC04-JP003:ScR"] },
    { name: "Ash Blossom & Joyous Spring", kind: "Monstruo", subtypes: ["Efecto", "Tuner"], attribute: "FUEGO", level: 3, atk: 0, def: 1800, basePrice: 1.5, printings: ["RA01-EN008:QCScR", "RA01-EN008:PlScR"], ocg: ["RC04-JP009:QCScR", "RC04-JP009:ScR"] },
    { name: "Flame Swordsman", kind: "Monstruo", subtypes: ["Fusión"], attribute: "FUEGO", level: 5, atk: 1800, def: 1600, basePrice: 1, printings: ["LOB-EN003:SR"] },
    { name: "Ancient Fairy Dragon", kind: "Monstruo", subtypes: ["Sincro", "Efecto"], attribute: "LUZ", level: 7, atk: 2100, def: 3000, basePrice: 1.5, printings: ["RA01-EN030:QCScR", "RA01-EN030:PlScR"], ocg: ["RC04-JP031:QCScR", "RC04-JP031:ScR"] },
    { name: "Baronne de Fleur", kind: "Monstruo", subtypes: ["Sincro", "Efecto"], attribute: "VIENTO", level: 10, atk: 3000, def: 2400, basePrice: 2, printings: ["RA01-EN034:QCScR", "RA01-EN034:PlScR"], ocg: ["RC04-JP035:QCScR", "RC04-JP035:ScR"] },
    { name: "Red-Eyes Flare Metal Dragon", kind: "Monstruo", subtypes: ["Xyz", "Efecto"], attribute: "OSCURIDAD", level: 7, atk: 2800, def: 2400, basePrice: 1, printings: ["RA01-EN038:QCScR", "RA01-EN038:PlScR"], ocg: ["RC04-JP039:QCScR", "RC04-JP039:ScR"] },
    { name: "Number 100: Numeron Dragon", kind: "Monstruo", subtypes: ["Xyz", "Efecto"], attribute: "LUZ", level: 1, atk: 0, def: 0, basePrice: 1, printings: ["RA01-EN039:QCScR", "RA01-EN039:PlScR"], ocg: ["RC04-JP040:QCScR", "RC04-JP040:ScR"] },
    { name: "Knightmare Unicorn", kind: "Monstruo", subtypes: ["Link", "Efecto"], attribute: "OSCURIDAD", level: 3, atk: 2200, def: 0, basePrice: 1, printings: ["RA01-EN043:QCScR", "RA01-EN043:PlScR"], ocg: ["RC04-JP044:QCScR", "RC04-JP044:ScR"] },
    { name: "Mekk-Knight Crusadia Avramax", kind: "Monstruo", subtypes: ["Link", "Efecto"], attribute: "LUZ", level: 4, atk: 3000, def: 0, basePrice: 1.5, printings: ["RA01-EN044:QCScR", "RA01-EN044:PlScR"], ocg: ["RC04-JP045:QCScR", "RC04-JP045:ScR"] },
    { name: "Raigeki", kind: "Magia", subtypes: ["Normal"], basePrice: 1.5, printings: ["LOB-EN053:SR"] },
    { name: "Polymerization", kind: "Magia", subtypes: ["Normal"], basePrice: 1, printings: ["LOB-EN059:SR"] },
    { name: "Monster Reborn", kind: "Magia", subtypes: ["Normal"], basePrice: 1, printings: ["SDK-036:C", "SDY-030:C"] },
    { name: "Dark Hole", kind: "Magia", subtypes: ["Normal"], basePrice: 0.8, printings: ["SDK-022:C", "SDY-022:C"] },
    { name: "Change of Heart", kind: "Magia", subtypes: ["Normal"], basePrice: 1, printings: ["RA01-EN050:QCScR", "RA01-EN050:PlScR", "SDY-032:C"], ocg: ["RC04-JP051:QCScR", "RC04-JP051:ScR"] },
    { name: "Card Destruction", kind: "Magia", subtypes: ["Normal"], basePrice: 0.8, printings: ["SDY-042:SR"] },
    { name: "Triple Tactics Talent", kind: "Magia", subtypes: ["Normal"], basePrice: 1.5, printings: ["RA01-EN063:PlScR"], ocg: ["RC04-JP064:QCScR", "RC04-JP064:ScR"] },
    { name: "Called by the Grave", kind: "Magia", subtypes: ["Juego rápido"], basePrice: 1, printings: ["RA01-EN057:QCScR", "RA01-EN057:PlScR"], ocg: ["RC04-JP058:QCScR", "RC04-JP058:ScR"] },
    { name: "Swords of Concealing Light", kind: "Magia", subtypes: ["Continua"], basePrice: 0.8, printings: ["RA05-EN059:PlScR", "RA05-EN059:ScR"] },
    { name: "Sword of Dark Destruction", kind: "Magia", subtypes: ["Equipo"], basePrice: 0.5, printings: ["SDY-020:C"] },
    { name: "Book of Secret Arts", kind: "Magia", subtypes: ["Equipo"], basePrice: 0.5, printings: ["SDY-021:C"] },
    { name: "Yami", kind: "Magia", subtypes: ["Campo"], basePrice: 0.5, printings: ["SDY-045:C"] },
    { name: "Sogen", kind: "Magia", subtypes: ["Campo"], basePrice: 0.5, printings: ["SDK-045:C"] },
    { name: "Mirror Force", kind: "Trampa", subtypes: ["Normal"], basePrice: 2.5, printings: ["MRD-EN138:UR"] },
    { name: "Trap Hole", kind: "Trampa", subtypes: ["Normal"], basePrice: 0.8, printings: ["LOB-EN058:SR", "SDK-033:C", "SDY-027:C"] },
    { name: "Infinite Impermanence", kind: "Trampa", subtypes: ["Normal"], basePrice: 2, printings: ["RA01-EN075:PlScR"], ocg: ["RC04-JP076:QCScR", "RC04-JP076:ScR"] },
    { name: "Trap Dustshoot", kind: "Trampa", subtypes: ["Normal"], basePrice: 0.8, printings: ["RA05-EN077:PlScR", "RA05-EN077:ScR"] },
    { name: "Waboku", kind: "Trampa", subtypes: ["Normal"], basePrice: 0.5, printings: ["SDY-040:C"] },
    { name: "Call of the Haunted", kind: "Trampa", subtypes: ["Continua"], basePrice: 1, printings: ["RA05-EN076:PlScR", "RA05-EN076:ScR"] },
    { name: "Dragon Capture Jar", kind: "Trampa", subtypes: ["Continua"], basePrice: 0.5, printings: ["SDY-044:C"] },
    { name: "Dimensional Barrier", kind: "Trampa", subtypes: ["Normal"], basePrice: 1, printings: ["RA01-EN072:PlScR"], ocg: ["RC04-JP073:QCScR", "RC04-JP073:ScR"] },
    { name: "Solemn Judgment", kind: "Trampa", subtypes: ["Contraefecto"], basePrice: 1.5, printings: ["MRD-EN127:UR"] },

    // Magic: The Gathering. "kind" is the tab (frontend/games.js); "cost" the
    // mana cost as Scryfall writes it; "colors" W, U, B, R, G. Printings by
    // set code and collector number, with their rarity (Forge's edition files).
    { game: "magic", name: "Llanowar Elves", kind: "Criatura", typeLine: "Creature — Elf Druid", cost: "{G}", colors: ["G"], pt: "1/1", basePrice: 0.3, printings: ["FDN-429:MM", "J25-149:MC"] },
    { game: "magic", name: "Birds of Paradise", kind: "Criatura", typeLine: "Creature — Bird", cost: "{G}", colors: ["G"], pt: "0/1", basePrice: 3, printings: ["MSC-170:MR", "FDC-191:MR"] },
    { game: "magic", name: "Bitterbloom Bearer", kind: "Criatura", typeLine: "Creature — Faerie Rogue", cost: "{B}{B}", colors: ["B"], pt: "1/1", basePrice: 6, printings: ["ECL-352:MM", "ECL-310:MM", "ECL-88:MM"] },
    { game: "magic", name: "Lightning Bolt", kind: "Instantaneo", typeLine: "Instant", cost: "{R}", colors: ["R"], basePrice: 1, printings: ["MSC-806:MU", "TLE-32:MM"] },
    { game: "magic", name: "Counterspell", kind: "Instantaneo", typeLine: "Instant", cost: "{U}{U}", colors: ["U"], basePrice: 0.8, printings: ["FDC-61:MU", "DSC-114:MU"] },
    { game: "magic", name: "Swords to Plowshares", kind: "Instantaneo", typeLine: "Instant", cost: "{W}", colors: ["W"], basePrice: 1.2, printings: ["FRC-37:MU", "SOC-179:MU"] },
    { game: "magic", name: "Path to Exile", kind: "Instantaneo", typeLine: "Instant", cost: "{W}", colors: ["W"], basePrice: 1, printings: ["FRC-30:MU", "SOC-159:MU"] },
    { game: "magic", name: "Beast Within", kind: "Instantaneo", typeLine: "Instant", cost: "{2}{G}", colors: ["G"], basePrice: 0.6, printings: ["MSC-169:MU", "SOC-263:MU"] },
    { game: "magic", name: "Cultivate", kind: "Conjuro", typeLine: "Sorcery", cost: "{2}{G}", colors: ["G"], basePrice: 0.3, printings: ["MSC-172:MC", "SOC-265:MC", "ECC-103:MC"] },
    { game: "magic", name: "Day of Judgment", kind: "Conjuro", typeLine: "Sorcery", cost: "{2}{W}{W}", colors: ["W"], basePrice: 1.5, printings: ["FDN-422:MM", "FDN-140:MR"] },
    { game: "magic", name: "Sol Ring", kind: "Artefacto", typeLine: "Artifact", cost: "{1}", colors: [], basePrice: 1, printings: ["FRC-21:MU", "MSC-213:MU"] },
    { game: "magic", name: "Arcane Signet", kind: "Artefacto", typeLine: "Artifact", cost: "{2}", colors: [], basePrice: 0.5, printings: ["FRC-20:MU", "MSC-194:MU"] },
    { game: "magic", name: "The One Ring", kind: "Artefacto", typeLine: "Legendary Artifact", cost: "{4}", colors: [], basePrice: 25, printings: ["HOC-44:MM"] },
    { game: "magic", name: "Doubling Season", kind: "Encantamiento", typeLine: "Enchantment", cost: "{4}{G}", colors: ["G"], basePrice: 18, printings: ["FDN-428:MM", "FDN-216:MM"] },
    { game: "magic", name: "Ajani, Outland Chaperone", kind: "Planeswalker", typeLine: "Legendary Planeswalker — Ajani", cost: "{1}{W}{W}", colors: ["W"], loyalty: 3, basePrice: 4, printings: ["ECL-284:MM", "ECL-4:MM"] },
    { game: "magic", name: "Hallowed Fountain", kind: "Tierra", typeLine: "Land — Plains Island", cost: "", colors: [], basePrice: 7, printings: ["ECL-347:MR", "ECL-265:MR"] },
    { game: "magic", name: "Overgrown Tomb", kind: "Tierra", typeLine: "Land — Swamp Forest", cost: "", colors: [], basePrice: 8, printings: ["ECL-350:MR", "ECL-266:MR"] },
    { game: "magic", name: "Command Tower", kind: "Tierra", typeLine: "Land", cost: "", colors: [], basePrice: 0.3, printings: ["FRC-22:MC", "MSC-235:MC"] },

    // Pokémon. "kind" is the tab; "types" the energy types; "subtypes" the
    // stage, or the kind of Trainer or Energy. Printings by the set's
    // abbreviation and the card's number, with its rarity (TCGdex); "jp" are
    // the Japanese printings, which form the card of the Japanese market.
    { game: "pokemon", name: "Mega Charizard X ex", kind: "Pokemon", subtypes: ["Stage2", "ex"], types: ["Fire"], hp: 360, basePrice: 3, printings: ["PFL-130:PMHR", "PFL-125:PSIR", "PFL-109:PUR", "PFL-013:PRR"], jp: ["M2-116:PMHR:JP", "M2-110:PSIR:JP", "M2-013:PRR:JP"] },
    { game: "pokemon", name: "Mega Gardevoir ex", kind: "Pokemon", subtypes: ["Stage2", "ex"], types: ["Psychic"], hp: 360, basePrice: 2, printings: ["MEG-187:PMHR", "MEG-178:PSIR", "MEG-159:PUR", "MEG-060:PRR"], jp: ["M1S-092:PMHR:JP", "M1S-078:PSR:JP", "M1S-042:PRR:JP"] },
    { game: "pokemon", name: "Mega Lucario ex", kind: "Pokemon", subtypes: ["Stage1", "ex"], types: ["Fighting"], hp: 340, basePrice: 2, printings: ["MEG-188:PMHR", "MEG-179:PSIR", "MEG-160:PUR", "MEG-077:PRR"], jp: ["M1L-092:PMHR:JP", "M1L-088:PSIR:JP", "M1L-029:PRR:JP"] },
    { game: "pokemon", name: "Mega Dragonite ex", kind: "Pokemon", subtypes: ["Stage2", "ex"], types: ["Dragon"], hp: 370, basePrice: 2.5, printings: ["ASC-295:PMHR", "ASC-290:PSIR", "ASC-271:PMAR", "ASC-152:PRR"] },
    { game: "pokemon", name: "Mega Greninja ex", kind: "Pokemon", subtypes: ["Stage2", "ex"], types: ["Water"], hp: 350, basePrice: 2, printings: ["CRI-122:PMHR", "CRI-116:PSIR", "CRI-100:PUR", "CRI-022:PRR"], jp: ["M4-120:PMHR:JP", "M4-114:PSIR:JP", "M4-022:PRR:JP"] },
    { game: "pokemon", name: "Mega Darkrai ex", kind: "Pokemon", subtypes: ["Basic", "ex"], types: ["Darkness"], hp: 280, basePrice: 2, printings: ["PBL-120:PMHR", "PBL-116:PSIR", "PBL-101:PUR", "PBL-048:PRR"], jp: ["M5-118:PMHR:JP", "M5-114:PSIR:JP", "M5-046:PRR:JP"] },
    { game: "pokemon", name: "Pikachu ex", kind: "Pokemon", subtypes: ["Basic", "ex"], types: ["Lightning"], hp: 200, basePrice: 3, printings: ["SSP-247:PHR", "SSP-238:PSIR", "SSP-219:PUR", "SSP-057:PRR"] },
    { game: "pokemon", name: "Umbreon ex", kind: "Pokemon", subtypes: ["Stage1", "ex"], types: ["Darkness"], hp: 280, basePrice: 4, printings: ["PRE-161:PSIR", "PRE-060:PRR"] },
    { game: "pokemon", name: "Psyduck", kind: "Pokemon", subtypes: ["Basic"], types: ["Water"], hp: 70, basePrice: 0.2, printings: ["ASC-226:PIR", "ASC-039:PC"] },
    { game: "pokemon", name: "Dreepy", kind: "Pokemon", subtypes: ["Basic"], types: ["Dragon"], hp: 70, basePrice: 0.2, printings: ["ASC-247:PIR", "ASC-158:PC", "PRE-071:PC"] },
    { game: "pokemon", name: "Boss's Orders", kind: "Entrenador", subtypes: ["Supporter"], basePrice: 0.5, printings: ["ASC-256:PUR", "ASC-183:PU", "MEG-114:PU"] },
    { game: "pokemon", name: "Lillie's Determination", kind: "Entrenador", subtypes: ["Supporter"], basePrice: 0.8, printings: ["MEG-184:PSIR", "MEG-169:PUR", "MEG-119:PU"] },
    { game: "pokemon", name: "Ultra Ball", kind: "Entrenador", subtypes: ["Item"], basePrice: 0.3, printings: ["ASC-264:PUR", "ASC-213:PC", "MEG-131:PC"] },
    { game: "pokemon", name: "Rare Candy", kind: "Entrenador", subtypes: ["Item"], basePrice: 0.3, printings: ["MEG-175:PUR", "MEG-125:PC"] },
    { game: "pokemon", name: "Prime Catcher", kind: "Entrenador", subtypes: ["Item"], basePrice: 1, printings: ["PRE-119:PACE", "TEF-157:PACE"] },
    { game: "pokemon", name: "Basic Fire Energy", kind: "Energia", subtypes: ["Normal"], basePrice: 0.1, printings: ["MEE-010:PC"] },
    { game: "pokemon", name: "Basic Grass Energy", kind: "Energia", subtypes: ["Normal"], basePrice: 0.1, printings: ["MEE-009:PC"] },
    { game: "pokemon", name: "Jet Energy", kind: "Energia", subtypes: ["Special"], basePrice: 0.4, printings: ["SSP-252:PHR", "PAL-190:PU"] },
    { game: "pokemon", name: "Mist Energy", kind: "Energia", subtypes: ["Special"], basePrice: 0.3, printings: ["TEF-161:PU"] }
];

// Vendedores. La valoración y el año de alta se generan al cargar la demo.
DEMO.sellers = [
    { name: "CartaViva", country: "Argentina" },
    { name: "Dados&Mazos", country: "Brasil" },
    { name: "LaMazmorra", country: "Argentina" },
    { name: "TiendaNorte", country: "Paraguay" },
    { name: "El_Coleccionista", country: "Uruguay" },
    { name: "ManaDirecta", country: "Bolivia" },
    { name: "Sombra_Card", country: "Brasil" },
    { name: "PixelCarton", country: "Paraguay" }
];

// Productos sellados y accesorios. "name" lleva {set} donde va el nombre del
// set, y pasa por t() como los demás textos. "set" es un prefijo de DEMO.sets; "market"
// es TCG u OCG en lo sellado y no va en los accesorios, que valen para ambos;
// "games" son los juegos para los que sirve un accesorio (todos si no se
// indica; las fundas de tamaño japonés son de Yu-Gi-Oh!);
// "brand" es la marca de un accesorio o de un producto sellado sin set;
// "released" vale solo si el producto salió en otra fecha que su set.
// "detail" es el contenido según el fabricante; "basePrice" está en euros
// (inventado). "image" es la clave de su página oficial en
// backend/app/data/product_pages.json: con la vista local de imágenes activada
// se muestra su foto provisional; si no, "icon" hace de miniatura.
DEMO.productCategories = {
    "Producto sellado": ["Caja de sobres", "Sobre", "Caja de entrenador", "Bundle", "Mazo", "Colección"],
    Accesorios: ["Fundas", "Deckbox", "Binder", "Páginas de binder", "Playmat", "Dados"]
};
DEMO.products = [
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "BETB", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 85, image: "betb", icon: "📦" },
    { name: "Sobre {set}", category: "Sobre", set: "BETB", market: "TCG", detail: "9 cartas", basePrice: 4.2, image: "betb", icon: "🎴" },
    { name: "Caja {set} (japonés)", category: "Caja de sobres", set: "BETB", market: "OCG", released: "2026-07-18", detail: "Edición japonesa", basePrice: 70, image: "betb", icon: "📦" },
    { name: "{set}", category: "Caja de sobres", set: "MAMO", market: "TCG", detail: "3 sobres de 5 cartas y 3 Secret Rare, que pueden ser Starlight Rare · 126 cartas en el set", basePrice: 40, image: "mamo", icon: "📦" },
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "CORI", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 80, image: "cori", icon: "📦" },
    { name: "Sobre {set}", category: "Sobre", set: "CORI", market: "TCG", detail: "9 cartas", basePrice: 4, image: "cori", icon: "🎴" },
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "BLZD", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 78, image: "blzd", icon: "📦" },
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "RA05", market: "TCG", detail: "24 sobres de 5 cartas, todas foil; la quinta es de arte alternativo", basePrice: 120, image: "ra05", icon: "📦" },
    { name: "Sobre {set}", category: "Sobre", set: "BPRO", market: "TCG", detail: "100 cartas en el set, 25 de ellas Starlight Rare", basePrice: 4, image: "bpro", icon: "🎴" },
    { name: "Legendary Arc-V Decks", brand: "Konami", category: "Colección", market: "TCG", released: "2026-08-07", detail: "3 mazos de 55 cartas, cada uno con 6 Ultra Rare y 1 Secret Rare, y un sobre extra con una Secret Rare", basePrice: 30, image: "legendary-arc-v-decks", icon: "🗃️" },
    { name: "Legendary Modern Decks 2026", brand: "Konami", category: "Colección", market: "TCG", released: "2026-03-13", detail: "3 mazos de 55 cartas: Sky Striker, X-Saber y Mitsurugi", basePrice: 30, image: "legendary-modern-decks-2026", icon: "🗃️" },
    { name: "The Chronicles Deck: Spirit Charmers", brand: "Konami", category: "Mazo", market: "TCG", released: "2026-01-23", detail: "Mazo de 51 cartas, todas foil; la 51.ª puede ser Starlight Rare", basePrice: 19, image: "chronicles-spirit-charmers", icon: "🃏" },
    { name: "Caja {set} (japonés)", category: "Caja de sobres", set: "RC04", market: "OCG", detail: "Edición japonesa", basePrice: 110, image: "rc04", icon: "📦" },
    { name: "{set}", category: "Colección", set: "KACB", market: "TCG", detail: "Caja de coleccionista de 2017", basePrice: 60, image: "kacb", icon: "🗃️" },
    { name: "{set}", category: "Mazo", set: "SDK", market: "TCG", detail: "Mazo de 50 cartas de 2002", basePrice: 90, image: "sdk", icon: "🃏" },
    { name: "{set}", category: "Mazo", set: "SDY", market: "TCG", detail: "Mazo de 50 cartas de 2002", basePrice: 90, image: "sdy", icon: "🃏" },
    { name: "Dragon Shield Matte Japanese Size Sleeves (60)", games: ["yugioh"], brand: "Dragon Shield", category: "Fundas", detail: "60 fundas mate para cartas de tamaño japonés (59 × 86 mm), como las de Yu-Gi-Oh!", basePrice: 9, image: "dragon-shield-matte-japanese", icon: "🛡️" },
    { name: "Ultimate Guard Katana Sleeves Japanese Size (60)", games: ["yugioh"], brand: "Ultimate Guard", category: "Fundas", detail: "60 fundas de tamaño japonés", basePrice: 8, image: "katana-japanese", icon: "🛡️" },
    { name: "Ultra Pro Eclipse Matte Small Sleeves (60)", games: ["yugioh"], brand: "Ultra Pro", category: "Fundas", detail: "60 fundas mate de 62 × 89 mm para cartas pequeñas, como las de Yu-Gi-Oh!", basePrice: 7, image: "eclipse-matte-small", icon: "🛡️" },
    { name: "Card Sleeves Jaden & Yubel", games: ["yugioh"], brand: "Konami", category: "Fundas", released: "2025-01-24", detail: "50 fundas oficiales", basePrice: 5, image: "jaden-yubel-sleeves", icon: "🛡️" },
    { name: "Dragon Shield Nest 100", brand: "Dragon Shield", category: "Deckbox", detail: "115 cartas con una funda o 100 con doble funda; cierre magnético; tamaño estándar y japonés", basePrice: 6, image: "nest-100", icon: "🧳" },
    { name: "Dragon Shield Deck Shell", brand: "Dragon Shield", category: "Deckbox", detail: "100 cartas con una funda u 80 con doble funda", basePrice: 12, image: "deck-shell", icon: "🧳" },
    { name: "Card Case Yugi & Kaiba Quarter Century", games: ["yugioh"], brand: "Konami", category: "Deckbox", detail: "Caben el Main, el Extra y el Side Deck; con separador", basePrice: 5, image: "yugi-kaiba-card-case", icon: "🧳" },
    { name: "Dragon Shield Card Codex Zipster Small", brand: "Dragon Shield", category: "Binder", detail: "20 páginas de 8 bolsillos con carga lateral y cierre de cremallera", basePrice: 25, image: "zipster-small", icon: "📒" },
    { name: "Ultra Pro Zippered PRO-Binder 9-Pocket", brand: "Ultra Pro", category: "Binder", detail: "20 páginas de 9 bolsillos con carga lateral; hasta 360 cartas enfundadas", basePrice: 28, image: "pro-binder-9", icon: "📒" },
    { name: "Gold Pride Duelist Portfolio", games: ["yugioh"], brand: "Konami", category: "Binder", released: "2023-07-28", detail: "10 páginas de 9 bolsillos con carga lateral", basePrice: 10, image: "gold-pride-portfolio", icon: "📒" },
    { name: "Dragon Shield 18-Pocket Pages Japanese Size (50)", games: ["yugioh"], brand: "Dragon Shield", category: "Páginas de binder", detail: "50 páginas de 18 bolsillos con carga lateral, para cartas de tamaño japonés", basePrice: 20, image: "dragon-shield-18-pocket-japanese", icon: "📄" },
    { name: "Game Mat Jaden & Yubel", games: ["yugioh"], brand: "Konami", category: "Playmat", released: "2025-01-24", detail: "Playmat oficial", basePrice: 17, image: "jaden-yubel-game-mat", icon: "🟦" },
    { name: "Gold Pride Playmat", games: ["yugioh"], brand: "Konami", category: "Playmat", released: "2023-07-28", detail: "Del tamaño de los playmats de premio de los torneos de Konami", basePrice: 17, image: "gold-pride-game-mat", icon: "🟦" },
    { name: "Chessex Opaque 12mm d6 Dice Block (36)", brand: "Chessex", category: "Dados", detail: "36 dados de seis caras de 12 mm", basePrice: 12, image: "chessex-12mm-d6", icon: "🎲" },

    // Magic: The Gathering (Wizards of the Coast: WPN, product pages).
    { name: "Caja de Play Boosters {set}", category: "Caja de sobres", set: "ECL", market: "MTG", detail: "30 Play Boosters de 14 cartas", basePrice: 140, icon: "📦" },
    { name: "Play Booster {set}", category: "Sobre", set: "ECL", market: "MTG", detail: "14 cartas, con 1 a 4 raras o míticas y una carta foil", basePrice: 5, icon: "🎴" },
    { name: "Collector Booster {set}", category: "Sobre", set: "ECL", market: "MTG", detail: "Cartas foil y de tratamientos especiales", basePrice: 25, icon: "🎴" },
    { name: "Bundle {set}", category: "Bundle", set: "ECL", market: "MTG", detail: "9 Play Boosters y accesorios", basePrice: 50, icon: "🗃️" },
    { name: "Mazo de {set}", category: "Mazo", set: "ECC", market: "MTG", detail: "Mazo de 100 cartas listo para jugar Commander", basePrice: 45, icon: "🃏" },
    { name: "Caja de Play Boosters {set}", category: "Caja de sobres", set: "TMT", market: "MTG", detail: "Caja de Play Boosters", basePrice: 150, icon: "📦" },
    { name: "Caja de Play Boosters {set}", category: "Caja de sobres", set: "SOS", market: "MTG", detail: "Caja de Play Boosters", basePrice: 140, icon: "📦" },
    { name: "Mazo de {set}", category: "Mazo", set: "SOC", market: "MTG", detail: "Uno de los cinco mazos Commander del set, de 100 cartas", basePrice: 45, icon: "🃏" },
    { name: "Caja de Play Boosters {set}", category: "Caja de sobres", set: "MSH", market: "MTG", detail: "Caja de Play Boosters", basePrice: 160, icon: "📦" },
    { name: "Beginner Box {set}", category: "Colección", set: "MSH", market: "MTG", detail: "Caja para aprender a jugar", basePrice: 25, icon: "🗃️" },
    { name: "Mazo de {set}", category: "Mazo", set: "MSC", market: "MTG", detail: "Uno de los cuatro mazos Commander del set, de 100 cartas", basePrice: 45, icon: "🃏" },
    { name: "Multiverse Reforged", brand: "Wizards of the Coast", category: "Mazo", set: "FRC", market: "MTG", detail: "Mazo Commander de cuatro colores de Reality Fracture", basePrice: 50, icon: "🃏" },
    { name: "Dragon Shield Matte Sleeves (100)", games: ["magic", "pokemon"], brand: "Dragon Shield", category: "Fundas", detail: "100 fundas mate de tamaño estándar (63,5 × 88 mm), como las de Magic y Pokémon", basePrice: 11, icon: "🛡️" },
    { name: "Ultra Pro Eclipse Matte Standard Sleeves (100)", games: ["magic", "pokemon"], brand: "Ultra Pro", category: "Fundas", detail: "100 fundas mate de tamaño estándar", basePrice: 10, icon: "🛡️" },
    { name: "Ultimate Guard Boulder 100+", games: ["magic", "pokemon"], brand: "Ultimate Guard", category: "Deckbox", detail: "100 cartas de tamaño estándar con doble funda", basePrice: 5, icon: "🧳" },

    // Pokémon (The Pokémon Company: product pages and listings of stores).
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "PBL", market: "PKM", detail: "36 sobres de 10 cartas", basePrice: 150, icon: "📦" },
    { name: "Sobre {set}", category: "Sobre", set: "PBL", market: "PKM", detail: "10 cartas", basePrice: 4.5, icon: "🎴" },
    { name: "Elite Trainer Box {set}", category: "Caja de entrenador", set: "PBL", market: "PKM", detail: "9 sobres, una carta promocional, fundas, cartas de Energía y accesorios de juego", basePrice: 55, icon: "🗃️" },
    { name: "Build & Battle Box {set}", category: "Colección", set: "PBL", market: "PKM", detail: "Mazo para los torneos de presentación del set y sobres", basePrice: 22, icon: "🃏" },
    { name: "Caja de sobres {set}", category: "Caja de sobres", set: "CRI", market: "PKM", detail: "36 sobres de 10 cartas", basePrice: 145, icon: "📦" },
    { name: "Sobre {set}", category: "Sobre", set: "POR", market: "PKM", detail: "10 cartas", basePrice: 4.5, icon: "🎴" },
    { name: "Elite Trainer Box {set}", category: "Caja de entrenador", set: "ASC", market: "PKM", detail: "Sobres del set, una carta promocional, fundas, cartas de Energía y accesorios de juego", basePrice: 65, icon: "🗃️" },
    { name: "Caja de sobres {set} (japonés)", category: "Caja de sobres", set: "M5", market: "PKMJ", detail: "Edición japonesa", basePrice: 60, icon: "📦" },
    { name: "Caja de sobres {set} (japonés)", category: "Caja de sobres", set: "M4", market: "PKMJ", detail: "Edición japonesa", basePrice: 60, icon: "📦" },
    { name: "Ultra Pro Pokémon 9-Pocket PRO-Binder", games: ["pokemon"], brand: "Ultra Pro", category: "Binder", detail: "Binder de 9 bolsillos por página con diseño oficial de Pokémon", basePrice: 30, icon: "📒" }
];

// Monedas del selector: primero las del Mercosur, por país, y después las
// internacionales. "perEuro" es un tipo de cambio aproximado y fijo: los
// precios se guardan en euros y se convierten solo para mostrarlos.
// "decimals" es 0 en monedas que no se usan con céntimos.
DEMO.currencies = [
    { code: "ARS", name: "Peso argentino", group: "Mercosur", perEuro: 1600, decimals: 0 },
    { code: "BOB", name: "Boliviano", group: "Mercosur", perEuro: 7.6, decimals: 2 },
    { code: "BRL", name: "Real brasileño", group: "Mercosur", perEuro: 6.2, decimals: 2 },
    { code: "PYG", name: "Guaraní paraguayo", group: "Mercosur", perEuro: 8600, decimals: 0 },
    { code: "UYU", name: "Peso uruguayo", group: "Mercosur", perEuro: 46, decimals: 2 },
    { code: "USD", name: "Dólar estadounidense", group: "Internacionales", perEuro: 1.1, decimals: 2 },
    { code: "EUR", name: "Euro", group: "Internacionales", perEuro: 1, decimals: 2 }
];

// Envío: cada vendedor envía por separado y es gratis a partir de cierto
// importe con ese vendedor (en euros).
DEMO.shipping = { perSeller: 2.5, freeFrom: 25 };

// Banderas de los países de los vendedores, como contenido SVG de 30×20.
DEMO.flags = {
    Argentina:
        '<rect width="30" height="20" fill="#74acdf"/><rect y="6.7" width="30" height="6.6" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#f6b40e"/>',
    Brasil: '<rect width="30" height="20" fill="#009b3a"/><path d="M15 2 28 10 15 18 2 10Z" fill="#fedf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>',
    Paraguay:
        '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.7" fill="#d52b1e"/><rect y="13.3" width="30" height="6.7" fill="#0038a8"/>',
    Uruguay:
        '<rect width="30" height="20" fill="#fff"/><path d="M0 2.5h30M0 7.5h30M0 12.5h30M0 17.5h30" stroke="#0038a8" stroke-width="2.2"/><rect width="11" height="10" fill="#fff"/><circle cx="5.5" cy="5" r="3" fill="#fcd116"/>',
    Bolivia:
        '<rect width="30" height="20" fill="#d52b1e"/><rect y="6.7" width="30" height="6.6" fill="#f9e300"/><rect y="13.3" width="30" height="6.7" fill="#007934"/>'
};
