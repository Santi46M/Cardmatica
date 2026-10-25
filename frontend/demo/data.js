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
    X: "Caja de coleccionista"
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
    BETB: { name: "Beyond the Brave", type: "B", released: "2026-10-09" }
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
    StR: { name: "Starlight Rare", priceFactor: 30, tone: "premium" }
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
    JP: { name: "Japonés", priceFactor: 0.8 }
};
DEMO.tcgLanguages = ["ES", "EN", "FR", "DE", "IT"];
DEMO.ocgLanguages = ["JP"];

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
    { name: "Solemn Judgment", kind: "Trampa", subtypes: ["Contraefecto"], basePrice: 1.5, printings: ["MRD-EN127:UR"] }
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

// Productos sellados y accesorios. "set" es un prefijo de DEMO.sets; "market"
// es TCG u OCG en lo sellado y no va en los accesorios, que valen para ambos;
// "brand" es la marca de un accesorio o de un producto sellado sin set;
// "released" vale solo si el producto salió en otra fecha que su set.
// "detail" es el contenido según el fabricante; "basePrice" está en euros
// (inventado) e "icon" se muestra como miniatura.
DEMO.productCategories = {
    "Producto sellado": ["Caja de sobres", "Sobre", "Mazo", "Colección"],
    Accesorios: ["Fundas", "Deckbox", "Binder", "Páginas de binder", "Playmat", "Dados"]
};
DEMO.products = [
    { name: "Caja de sobres Beyond the Brave", category: "Caja de sobres", set: "BETB", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 85, icon: "📦" },
    { name: "Sobre Beyond the Brave", category: "Sobre", set: "BETB", market: "TCG", detail: "9 cartas", basePrice: 4.2, icon: "🎴" },
    { name: "Caja Beyond the Brave (japonés)", category: "Caja de sobres", set: "BETB", market: "OCG", released: "2026-07-18", detail: "Edición japonesa", basePrice: 70, icon: "📦" },
    { name: "Magnificent Monsters", category: "Caja de sobres", set: "MAMO", market: "TCG", detail: "3 sobres de 5 cartas y 3 Secret Rare, que pueden ser Starlight Rare · 126 cartas en el set", basePrice: 40, icon: "📦" },
    { name: "Caja de sobres Chaos Origins", category: "Caja de sobres", set: "CORI", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 80, icon: "📦" },
    { name: "Sobre Chaos Origins", category: "Sobre", set: "CORI", market: "TCG", detail: "9 cartas", basePrice: 4, icon: "🎴" },
    { name: "Caja de sobres Blazing Dominion", category: "Caja de sobres", set: "BLZD", market: "TCG", detail: "24 sobres de 9 cartas · 100 cartas en el set", basePrice: 78, icon: "📦" },
    { name: "Caja de sobres Rarity Collection 5", category: "Caja de sobres", set: "RA05", market: "TCG", detail: "24 sobres de 5 cartas, todas foil; la quinta es de arte alternativo", basePrice: 120, icon: "📦" },
    { name: "Sobre Burst Protocol", category: "Sobre", set: "BPRO", market: "TCG", detail: "100 cartas en el set, 25 de ellas Starlight Rare", basePrice: 4, icon: "🎴" },
    { name: "Legendary Arc-V Decks", brand: "Konami", category: "Colección", market: "TCG", released: "2026-08-07", detail: "3 mazos de 55 cartas, cada uno con 6 Ultra Rare y 1 Secret Rare, y un sobre extra con una Secret Rare", basePrice: 30, icon: "🗃️" },
    { name: "Legendary Modern Decks 2026", brand: "Konami", category: "Colección", market: "TCG", released: "2026-03-13", detail: "3 mazos de 55 cartas: Sky Striker, X-Saber y Mitsurugi", basePrice: 30, icon: "🗃️" },
    { name: "The Chronicles Deck: Spirit Charmers", brand: "Konami", category: "Mazo", market: "TCG", released: "2026-01-23", detail: "Mazo de 51 cartas, todas foil; la 51.ª puede ser Starlight Rare", basePrice: 19, icon: "🃏" },
    { name: "Caja Rarity Collection Quarter Century Edition (japonés)", category: "Caja de sobres", set: "RC04", market: "OCG", detail: "Edición japonesa", basePrice: 110, icon: "📦" },
    { name: "Kaiba's Collector Box", category: "Colección", set: "KACB", market: "TCG", detail: "Caja de coleccionista de 2017", basePrice: 60, icon: "🗃️" },
    { name: "Starter Deck: Kaiba (sellado)", category: "Mazo", set: "SDK", market: "TCG", detail: "Mazo de 50 cartas de 2002", basePrice: 90, icon: "🃏" },
    { name: "Starter Deck: Yugi (sellado)", category: "Mazo", set: "SDY", market: "TCG", detail: "Mazo de 50 cartas de 2002", basePrice: 90, icon: "🃏" },
    { name: "Dragon Shield Matte Japanese (60 fundas)", brand: "Dragon Shield", category: "Fundas", detail: "60 fundas mate para cartas de tamaño japonés (59 × 86 mm), como las de Yu-Gi-Oh!", basePrice: 9, icon: "🛡️" },
    { name: "Ultimate Guard Katana Sleeves Japanese Size (60)", brand: "Ultimate Guard", category: "Fundas", detail: "60 fundas de tamaño japonés", basePrice: 8, icon: "🛡️" },
    { name: "Ultra Pro Eclipse Matte Small Sleeves (60)", brand: "Ultra Pro", category: "Fundas", detail: "60 fundas mate de 62 × 89 mm para cartas pequeñas, como las de Yu-Gi-Oh!", basePrice: 7, icon: "🛡️" },
    { name: "Card Sleeves Jaden & Yubel", brand: "Konami", category: "Fundas", released: "2025-01-24", detail: "50 fundas oficiales", basePrice: 5, icon: "🛡️" },
    { name: "Dragon Shield Nest 100", brand: "Dragon Shield", category: "Deckbox", detail: "115 cartas con una funda o 100 con doble funda; cierre magnético; tamaño estándar y japonés", basePrice: 6, icon: "🧳" },
    { name: "Dragon Shield Deck Shell", brand: "Dragon Shield", category: "Deckbox", detail: "100 cartas con una funda u 80 con doble funda", basePrice: 12, icon: "🧳" },
    { name: "Card Case Yugi & Kaiba Quarter Century", brand: "Konami", category: "Deckbox", detail: "Caben el Main, el Extra y el Side Deck; con separador", basePrice: 5, icon: "🧳" },
    { name: "Dragon Shield Card Codex Zipster Small", brand: "Dragon Shield", category: "Binder", detail: "20 páginas de 8 bolsillos con carga lateral y cierre de cremallera", basePrice: 25, icon: "📒" },
    { name: "Ultra Pro Zippered PRO-Binder 9-Pocket", brand: "Ultra Pro", category: "Binder", detail: "20 páginas de 9 bolsillos con carga lateral; hasta 360 cartas enfundadas", basePrice: 28, icon: "📒" },
    { name: "Gold Pride Duelist Portfolio", brand: "Konami", category: "Binder", released: "2023-07-28", detail: "10 páginas de 9 bolsillos con carga lateral", basePrice: 10, icon: "📒" },
    { name: "Dragon Shield 18-Pocket Pages Japanese Size (50)", brand: "Dragon Shield", category: "Páginas de binder", detail: "50 páginas de 18 bolsillos con carga lateral, para cartas de tamaño japonés", basePrice: 20, icon: "📄" },
    { name: "Game Mat Jaden & Yubel", brand: "Konami", category: "Playmat", released: "2025-01-24", detail: "Playmat oficial", basePrice: 17, icon: "🟦" },
    { name: "Gold Pride Playmat", brand: "Konami", category: "Playmat", released: "2023-07-28", detail: "Del tamaño de los playmats de premio de los torneos de Konami", basePrice: 17, icon: "🟦" },
    { name: "Chessex Opaque 12mm d6 Dice Block (36)", brand: "Chessex", category: "Dados", detail: "36 dados de seis caras de 12 mm", basePrice: 12, icon: "🎲" }
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
