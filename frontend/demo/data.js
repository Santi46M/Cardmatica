// Datos del comercio de demostración (pestañas "Productos" y "Vendedores").
//
// Todo lo que hay aquí es ilustrativo: vendedores, precios, stock y tipos de
// cambio son inventados para poder probar la tienda. El catálogo real de cartas
// llega desde la API (frontend/js/catalog.js) y nunca usa estos datos.
//
// store.js lee este archivo y genera con él las cartas, el stock y el
// historial de precios. Para cambiar la demo basta con editar estas tablas.

/* exported DEMO */
var DEMO = {};

// Tipos de producto de los que puede salir una impresión.
DEMO.setTypes = {
    B: "Sobre (booster)",
    S: "Starter Deck",
    D: "Structure Deck",
    P: "Promo",
    T: "Lata (tin)",
    X: "Box set / reedición"
};

// Sets por prefijo de código. "type" es una clave de DEMO.setTypes.
// Los sets con "released" son las novedades: el listado de productos los
// ordena por fecha de lanzamiento.
DEMO.sets = {
    LOB: { name: "Legend of Blue Eyes White Dragon", type: "B" },
    MRD: { name: "Metal Raiders", type: "B" },
    PSV: { name: "Pharaoh's Servant", type: "B" },
    MRL: { name: "Magic Ruler", type: "B" },
    TAEV: { name: "Tactical Evolution", type: "B" },
    SOVR: { name: "Stardust Overdrive", type: "B" },
    ABYR: { name: "Abyss Rising", type: "B" },
    CIBR: { name: "Circuit Break", type: "B" },
    MACR: { name: "Maximum Crisis", type: "B" },
    PEVO: { name: "Pendulum Evolution", type: "B" },
    DREV: { name: "Duelist Revolution", type: "B" },
    EOJ: { name: "Enemy of Justice", type: "B" },
    DUPO: { name: "Duel Power", type: "B" },
    DPKB: { name: "Duelist Pack: Kaiba", type: "B" },
    SDK: { name: "Starter Deck: Kaiba", type: "S" },
    SDY: { name: "Starter Deck: Yugi", type: "S" },
    SDPD: { name: "Structure Deck: Pendulum Domination", type: "D" },
    SDHS: { name: "Structure Deck: HERO Strike", type: "D" },
    YCS: { name: "Promo de torneo", type: "P" },
    MP13: { name: "Mega-Tin 2013", type: "T" },
    MP19: { name: "Mega-Tin 2019", type: "T" },
    LC01: { name: "Legendary Collection", type: "X" },
    YGLD: { name: "Yugi's Legendary Decks", type: "X" },
    LDK2: { name: "Legendary Decks II", type: "X" },
    CRFR: { name: "Crimson Frontier", type: "B", released: "2026-09-12" },
    SFLG: { name: "Starfall Legacy", type: "B", released: "2026-07-18" },
    DUNX: { name: "Structure Deck: Duelist Nexus", type: "D", released: "2026-10-02" },
    MP26: { name: "Mega-Tin 2026", type: "T", released: "2026-08-08" }
};

// Rarezas por abreviatura, con el nombre que usan Cardmarket y TCGplayer
// (también en español). "priceFactor" multiplica el precio base de la carta;
// "background" y "color" pintan la etiqueta de rareza.
DEMO.rarities = {
    C: { name: "Common", priceFactor: 1, background: "rgba(255,255,255,.1)", color: "#c5d0de" },
    R: { name: "Rare", priceFactor: 1.6, background: "rgba(120,160,230,.25)", color: "#a9c4f5" },
    SR: { name: "Super Rare", priceFactor: 2.4, background: "rgba(80,190,240,.25)", color: "#8fdcff" },
    UR: { name: "Ultra Rare", priceFactor: 4, background: "rgba(240,190,70,.25)", color: "#ffd773" },
    UtR: { name: "Ultimate Rare", priceFactor: 9, background: "rgba(230,130,220,.25)", color: "#f5aaee" },
    GR: { name: "Ghost Rare", priceFactor: 14, background: "rgba(235,235,245,.22)", color: "#f2f2ff" },
    ScR: { name: "Secret Rare", priceFactor: 6, background: "rgba(160,130,245,.28)", color: "#cbb9ff" },
    StR: { name: "Starlight Rare", priceFactor: 30, background: "linear-gradient(90deg,#f7a,#fd6,#6df)", color: "#1a1a2a" }
};

// Estados de conservación, del mejor al peor.
DEMO.conditions = [
    { code: "MT", name: "Mint", color: "#1b7f4d" },
    { code: "NM", name: "Near Mint", color: "#2e9d5b" },
    { code: "EX", name: "Excelente", color: "#6aa84f" },
    { code: "GD", name: "Bueno", color: "#b8921f" },
    { code: "LP", name: "Poco jugado", color: "#d9822b" },
    { code: "PL", name: "Jugado", color: "#c0392b" },
    { code: "PO", name: "Pobre", color: "#7b241c" }
];

// Subtipos que se ofrecen en los filtros de cada clase de carta.
DEMO.subtypes = {
    Monstruo: ["Normal", "Efecto", "Fusión", "Ritual", "Sincro", "Xyz", "Link", "Péndulo", "Tuner"],
    Magia: ["Normal", "Juego rápido", "Continua", "Equipo", "Campo", "Ritual"],
    Trampa: ["Normal", "Continua", "Contraefecto"]
};

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

// Idiomas. TCG se vende en los idiomas occidentales; OCG en los asiáticos.
// "priceFactor" ajusta el precio de las versiones OCG respecto a la TCG.
DEMO.languages = {
    ES: { name: "Español" },
    EN: { name: "Inglés" },
    FR: { name: "Francés" },
    DE: { name: "Alemán" },
    IT: { name: "Italiano" },
    JP: { name: "Japonés", priceFactor: 1 },
    KR: { name: "Coreano", priceFactor: 0.9 },
    SC: { name: "Chino", priceFactor: 0.7 },
    AE: { name: "Asian-English", priceFactor: 0.85 }
};
DEMO.tcgLanguages = ["ES", "EN", "FR", "DE", "IT"];
DEMO.ocgLanguages = ["JP", "KR", "SC", "AE"];

// Cartas de la demo. Cada impresión es "PREFIJO###:RAREZA"; el prefijo es
// una clave de DEMO.sets y la rareza una de DEMO.rarities. "level" es el
// nivel, el rango (Xyz) o el valor LINK según el subtipo. "basePrice" está en
// euros para una Common en inglés y en buen estado.
DEMO.cards = [
    { name: "Blue-Eyes White Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "LUZ", level: 8, atk: 3000, def: 2500, basePrice: 6, printings: ["LOB001:UR","SDK001:UR","LDK2001:C"] },
    { name: "Dark Magician", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 7, atk: 2500, def: 2100, basePrice: 5, printings: ["LOB005:UR","SDY006:UR","LC01005:UR"] },
    { name: "Red-Eyes Black Dragon", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 7, atk: 2400, def: 2000, basePrice: 4, printings: ["LOB070:UR","YGLD001:UR"] },
    { name: "Summoned Skull", kind: "Monstruo", subtypes: ["Normal"], attribute: "OSCURIDAD", level: 6, atk: 2500, def: 1200, basePrice: 3, printings: ["MRD022:UR","SDK009:C"] },
    { name: "Exodia the Forbidden One", kind: "Monstruo", subtypes: ["Efecto"], attribute: "OSCURIDAD", level: 3, atk: 1000, def: 1000, basePrice: 8, printings: ["LOB124:UR","YGLD020:UR"] },
    { name: "Maxx \"C\"", kind: "Monstruo", subtypes: ["Efecto"], attribute: "TIERRA", level: 2, atk: 500, def: 200, basePrice: 2, printings: ["DUPO025:UR","MP19040:R"] },
    { name: "Kuriboh", kind: "Monstruo", subtypes: ["Efecto"], attribute: "OSCURIDAD", level: 1, atk: 300, def: 200, basePrice: 2, printings: ["MRD067:C","SDY020:C"] },
    { name: "Sangan", kind: "Monstruo", subtypes: ["Efecto"], attribute: "OSCURIDAD", level: 3, atk: 1000, def: 600, basePrice: 1.5, printings: ["SDK012:C","PSV075:R"] },
    { name: "Elemental HERO Flame Wingman", kind: "Monstruo", subtypes: ["Fusión","Efecto"], attribute: "VIENTO", level: 6, atk: 2100, def: 1200, basePrice: 2, printings: ["EOJ001:SR","SDHS001:R"] },
    { name: "Dark Paladin", kind: "Monstruo", subtypes: ["Fusión","Efecto"], attribute: "OSCURIDAD", level: 8, atk: 2900, def: 2400, basePrice: 3, printings: ["MRL060:UR","SDY030:R"] },
    { name: "Gaia the Dragon Champion", kind: "Monstruo", subtypes: ["Fusión"], attribute: "TIERRA", level: 7, atk: 2600, def: 2100, basePrice: 2, printings: ["LOB095:R","MP13020:UR"] },
    { name: "Black Luster Soldier", kind: "Monstruo", subtypes: ["Ritual"], attribute: "TIERRA", level: 8, atk: 3000, def: 2500, basePrice: 4, printings: ["PSV001:UR","YGLD030:UR"] },
    { name: "Magician of Black Chaos", kind: "Monstruo", subtypes: ["Ritual","Efecto"], attribute: "OSCURIDAD", level: 8, atk: 2800, def: 2600, basePrice: 3, printings: ["MRL010:UR","SDY050:R"] },
    { name: "Relinquished", kind: "Monstruo", subtypes: ["Ritual","Efecto"], attribute: "OSCURIDAD", level: 1, atk: 0, def: 0, basePrice: 3, printings: ["PSV090:UR","LC01030:UR"] },
    { name: "Stardust Dragon", kind: "Monstruo", subtypes: ["Sincro","Efecto"], attribute: "VIENTO", level: 8, atk: 2500, def: 2000, basePrice: 4, printings: ["TAEV040:UR","SOVR040:R"] },
    { name: "Black Rose Dragon", kind: "Monstruo", subtypes: ["Sincro","Efecto"], attribute: "FUEGO", level: 7, atk: 2400, def: 1800, basePrice: 3, printings: ["TAEV050:UR","MP13030:UR"] },
    { name: "Red Dragon Archfiend", kind: "Monstruo", subtypes: ["Sincro","Efecto"], attribute: "FUEGO", level: 8, atk: 3000, def: 2000, basePrice: 4, printings: ["TAEV060:UR","SOVR060:SR"] },
    { name: "Number 39: Utopia", kind: "Monstruo", subtypes: ["Xyz","Efecto"], attribute: "LUZ", level: 4, atk: 2500, def: 2000, basePrice: 3, printings: ["ABYR048:UR","MP13040:SR"] },
    { name: "Gagaga Cowboy", kind: "Monstruo", subtypes: ["Xyz"], attribute: "TIERRA", level: 4, atk: 1500, def: 2400, basePrice: 1.5, printings: ["ABYR020:C","DUPO050:R"] },
    { name: "Bahamut Shark", kind: "Monstruo", subtypes: ["Xyz","Efecto"], attribute: "AGUA", level: 4, atk: 2600, def: 2100, basePrice: 2.5, printings: ["ABYR060:UR","MP19060:R"] },
    { name: "Accesscode Talker", kind: "Monstruo", subtypes: ["Link","Efecto"], attribute: "OSCURIDAD", level: 4, atk: 2300, def: 0, basePrice: 4, printings: ["CIBR049:ScR","MP19001:UR","YCS001:UR"] },
    { name: "Firewall Dragon", kind: "Monstruo", subtypes: ["Link","Efecto"], attribute: "AGUA", level: 3, atk: 2500, def: 0, basePrice: 3, printings: ["CIBR030:ScR","MP19010:UR"] },
    { name: "Decode Talker", kind: "Monstruo", subtypes: ["Link","Efecto"], attribute: "OSCURIDAD", level: 3, atk: 2300, def: 0, basePrice: 2, printings: ["CIBR040:SR","MP19020:R"] },
    { name: "Odd-Eyes Pendulum Dragon", kind: "Monstruo", subtypes: ["Péndulo","Efecto"], attribute: "OSCURIDAD", level: 7, atk: 2500, def: 2000, basePrice: 2, printings: ["PEVO008:UR","SDPD001:C"] },
    { name: "Supreme King Z-ARC", kind: "Monstruo", subtypes: ["Péndulo","Efecto"], attribute: "OSCURIDAD", level: 12, atk: 4000, def: 4000, basePrice: 5, printings: ["PEVO040:ScR","MP19070:UR"] },
    { name: "Timegazer Magician", kind: "Monstruo", subtypes: ["Péndulo","Efecto"], attribute: "LUZ", level: 3, atk: 1200, def: 0, basePrice: 1.5, printings: ["PEVO020:R","SDPD010:C"] },
    { name: "Effect Veiler", kind: "Monstruo", subtypes: ["Efecto","Tuner"], attribute: "LUZ", level: 1, atk: 0, def: 0, basePrice: 3, printings: ["DREV035:SR","MP13001:UR"] },
    { name: "Ash Blossom & Joyous Spring", kind: "Monstruo", subtypes: ["Efecto","Tuner"], attribute: "FUEGO", level: 3, atk: 0, def: 1800, basePrice: 3, printings: ["MACR036:ScR","MP19030:UR"] },
    { name: "Junk Synchron", kind: "Monstruo", subtypes: ["Efecto","Tuner"], attribute: "OSCURIDAD", level: 3, atk: 1300, def: 500, basePrice: 2, printings: ["SOVR020:C","SDHS010:R"] },
    { name: "Pot of Greed", kind: "Magia", subtypes: ["Normal"], basePrice: 2, printings: ["LOB119:R","LC01001:UR"] },
    { name: "Monster Reborn", kind: "Magia", subtypes: ["Normal"], basePrice: 1.2, printings: ["LOB118:UR","SDK025:C"] },
    { name: "Raigeki", kind: "Magia", subtypes: ["Normal"], basePrice: 1.5, printings: ["LOB053:SR","SDY045:C"] },
    { name: "Mystical Space Typhoon", kind: "Magia", subtypes: ["Juego rápido"], basePrice: 1, printings: ["SDY039:C","DREV050:SR"] },
    { name: "Book of Moon", kind: "Magia", subtypes: ["Juego rápido"], basePrice: 1.2, printings: ["MACR010:R","MP13050:UR"] },
    { name: "Forbidden Lance", kind: "Magia", subtypes: ["Juego rápido"], basePrice: 0.6, printings: ["DUPO060:C","MP19050:R"] },
    { name: "Messenger of Peace", kind: "Magia", subtypes: ["Continua"], basePrice: 1.5, printings: ["MRD090:UR","SDY060:R"] },
    { name: "Swords of Revealing Light", kind: "Magia", subtypes: ["Continua"], basePrice: 1.5, printings: ["LOB090:SR","SDK040:C"] },
    { name: "Rivalry of Warlords", kind: "Magia", subtypes: ["Continua"], basePrice: 1, printings: ["MRL070:SR","MP13060:R"] },
    { name: "Axe of Despair", kind: "Magia", subtypes: ["Equipo"], basePrice: 0.8, printings: ["MRD080:R","SDK035:C"] },
    { name: "Black Pendant", kind: "Magia", subtypes: ["Equipo"], basePrice: 0.5, printings: ["LOB110:C","SDY070:C"] },
    { name: "Megamorph", kind: "Magia", subtypes: ["Equipo"], basePrice: 1, printings: ["LOB125:R","YGLD040:UR"] },
    { name: "Yami", kind: "Magia", subtypes: ["Campo"], basePrice: 0.8, printings: ["MRD100:R","SDY080:C"] },
    { name: "Umi", kind: "Magia", subtypes: ["Campo"], basePrice: 0.6, printings: ["LOB130:R","SDK060:C"] },
    { name: "Forest", kind: "Magia", subtypes: ["Campo"], basePrice: 0.5, printings: ["LOB140:C","SDY090:C"] },
    { name: "Black Illusion Ritual", kind: "Magia", subtypes: ["Ritual"], basePrice: 2.5, printings: ["PSV100:UR","YGLD050:UR"] },
    { name: "Black Luster Ritual", kind: "Magia", subtypes: ["Ritual"], basePrice: 2.5, printings: ["PSV110:SR","YGLD060:UR"] },
    { name: "Contract with the Abyss", kind: "Magia", subtypes: ["Ritual"], basePrice: 2, printings: ["MRL080:UR","LC01040:UR"] },
    { name: "Mirror Force", kind: "Trampa", subtypes: ["Normal"], basePrice: 2.5, printings: ["MRD138:SR","SDK046:C","DPKB001:UR"] },
    { name: "Trap Hole", kind: "Trampa", subtypes: ["Normal"], basePrice: 0.8, printings: ["LOB085:C","SDY100:C"] },
    { name: "Bottomless Trap Hole", kind: "Trampa", subtypes: ["Normal"], basePrice: 1.5, printings: ["MRD140:SR","MP13070:UR"] },
    { name: "Gravity Bind", kind: "Trampa", subtypes: ["Continua"], basePrice: 2, printings: ["MRD150:UR","SDK070:R"] },
    { name: "Skill Drain", kind: "Trampa", subtypes: ["Continua"], basePrice: 2.5, printings: ["MRL090:UR","MP19080:R"] },
    { name: "Royal Decree", kind: "Trampa", subtypes: ["Continua"], basePrice: 1.8, printings: ["PSV120:SR","MP13080:UR"] },
    { name: "Solemn Judgment", kind: "Trampa", subtypes: ["Contraefecto"], basePrice: 1.5, printings: ["MRL001:UR","MP19090:ScR"] },
    { name: "Solemn Strike", kind: "Trampa", subtypes: ["Contraefecto"], basePrice: 1.2, printings: ["DUPO070:SR","MP19095:ScR"] },
    { name: "Seven Tools of the Bandit", kind: "Trampa", subtypes: ["Contraefecto"], basePrice: 0.8, printings: ["MRD160:R","SDK080:C"] }
];

// Reimpresiones en los sets nuevos. Se colocan antes que las demás
// impresiones de la carta, para que aparezcan primero.
DEMO.newPrintings = [
    { card: "Blue-Eyes White Dragon", printing: "CRFR001:StR" },
    { card: "Stardust Dragon", printing: "CRFR002:ScR" },
    { card: "Accesscode Talker", printing: "CRFR003:UR" },
    { card: "Mirror Force", printing: "CRFR004:UR" },
    { card: "Black Luster Soldier", printing: "CRFR005:UtR" },
    { card: "Ash Blossom & Joyous Spring", printing: "SFLG001:ScR" },
    { card: "Supreme King Z-ARC", printing: "SFLG002:UR" },
    { card: "Dark Magician", printing: "SFLG003:UtR" },
    { card: "Book of Moon", printing: "SFLG004:SR" },
    { card: "Effect Veiler", printing: "DUNX001:R" },
    { card: "Mystical Space Typhoon", printing: "DUNX002:SR" },
    { card: "Solemn Judgment", printing: "DUNX003:C" },
    { card: "Red Dragon Archfiend", printing: "MP26001:UR" },
    { card: "Bahamut Shark", printing: "MP26002:SR" }
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

// Productos sellados y accesorios. "set" es un prefijo de DEMO.sets (vacío en
// los accesorios), "basePrice" está en euros y "icon" se muestra como
// miniatura. Cada producto TCG con set tiene además su versión OCG.
DEMO.productCategories = {
    "Producto sellado": ["Caja sellada", "Sobre", "Mazo sellado", "Lata"],
    Accesorios: ["Binder", "Páginas de binder", "Deckbox"]
};
DEMO.products = [
    { name: "Caja sellada Crimson Frontier (24 sobres)", category: "Caja sellada", set: "CRFR", basePrice: 95, icon: "📦" },
    { name: "Sobre Crimson Frontier", category: "Sobre", set: "CRFR", basePrice: 4.5, icon: "🎴" },
    { name: "Caja sellada Starfall Legacy (24 sobres)", category: "Caja sellada", set: "SFLG", basePrice: 90, icon: "📦" },
    { name: "Sobre Starfall Legacy", category: "Sobre", set: "SFLG", basePrice: 4.2, icon: "🎴" },
    { name: "Structure Deck: Duelist Nexus (sellado)", category: "Mazo sellado", set: "DUNX", basePrice: 14, icon: "🃏" },
    { name: "Mega-Tin 2026 (sellada)", category: "Lata", set: "MP26", basePrice: 32, icon: "🥫" },
    { name: "Caja sellada Legend of Blue Eyes White Dragon (vintage)", category: "Caja sellada", set: "LOB", basePrice: 1800, icon: "📦" },
    { name: "Starter Deck: Kaiba (sellado)", category: "Mazo sellado", set: "SDK", basePrice: 90, icon: "🃏" },
    { name: "Binder 9 bolsillos", category: "Binder", set: "", basePrice: 14, icon: "📒" },
    { name: "Binder 12 bolsillos premium", category: "Binder", set: "", basePrice: 28, icon: "📒" },
    { name: "Deckbox magnético 60 cartas", category: "Deckbox", set: "", basePrice: 18, icon: "🧳" },
    { name: "Deckbox rígido 100 cartas", category: "Deckbox", set: "", basePrice: 9, icon: "🧳" },
    { name: "Páginas 9 bolsillos (pack de 10)", category: "Páginas de binder", set: "", basePrice: 6, icon: "📄" },
    { name: "Páginas 12 bolsillos (pack de 10)", category: "Páginas de binder", set: "", basePrice: 10, icon: "📄" }
];
// Las versiones OCG de productos sellados cuestan este factor de la TCG.
DEMO.ocgProductPriceFactor = 0.9;

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
