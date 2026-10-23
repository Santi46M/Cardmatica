// Tienda de demostración y piezas de interfaz compartidas.
//
// Este archivo hace dos cosas:
//   1. Monta la tienda de demostración (pestañas "Productos" y "Vendedores",
//      inventario de cada vendedor, ficha de carta de la demo y carrito) con
//      los datos inventados de data.js.
//   2. Ofrece piezas que también usa el catálogo real: pestañas, selector de
//      mercado y de moneda, ventanas emergentes, avisos y carrito.
//
// Es un script clásico (no un módulo) para que sus funciones y su estado sean
// globales. Los módulos de frontend/js usan estos nombres desde `window`:
//   estado:     tab, market, currency, cart, cartClearArmed
//   datos:      TABS, TAB_LABELS, LISTINGS, CURRENCIES, SHIPPING
//   funciones:  showTab, refreshList, formatPrice, flag, toast, alignDialogs,
//               updateMarketButtons, updateCartCount, cartTotals, cartLine,
//               openDemoCard, openSeller, openProduct, showCart
// frontend/js/catalog.js sustituye showTab y refreshList para las pestañas del
// catálogo real y llama a las versiones de aquí solo para la tienda demo.

/* global DEMO */

// ---------------------------------------------------------------------------
// Configuración de la interfaz
// ---------------------------------------------------------------------------

var TABS = ["Inicio", "Todas", "Monstruo", "Magia", "Trampa", "Productos", "Vendedores"];
var TAB_LABELS = {
    Inicio: "Inicio",
    Todas: "Todas las cartas",
    Monstruo: "Monstruos",
    Magia: "Magias",
    Trampa: "Trampas",
    Productos: "Cajas y accesorios",
    Vendedores: "Vendedores"
};
var CURRENCIES = DEMO.currencies;
var SHIPPING = DEMO.shipping;

const CURRENCY_STORAGE_KEY = "cm_cur";
const TOAST_DURATION_MS = 1700;
// Espacio entre la cabecera fija y las ventanas emergentes.
const DIALOG_GAP_PX = 14;
const DAY_MS = 864e5;

// Historial de precios inventado de cada impresión de la demo.
const DEMO_HISTORY = {
    weeks: 104,
    // La última venta ocurrió hace entre 0 y este número de días.
    maxDaysSinceLastSale: 45,
    // Rango de periodos del gráfico: [etiqueta, días].
    ranges: [
        ["1M", 30],
        ["3M", 90],
        ["6M", 180],
        ["1A", 365],
        ["2A", 730]
    ],
    defaultRangeDays: 365,
    lineColors: ["#6fd3f2", "#ffd773", "#f5aaee", "#9be58a"],
    size: { width: 640, height: 190, left: 64, right: 10, top: 8, bottom: 22 }
};

// Generación del stock de demostración. Todas las cifras son probabilidades o
// rangos del generador; con la misma semilla la demo sale siempre igual.
const DEMO_STOCK = {
    seed: 99,
    // Probabilidad de que un vendedor tenga una carta o un producto concreto.
    cardChance: 0.42,
    productChance: 0.45,
    // Una de cada siete cartas puede quedarse sin stock para mostrar
    // "Sin stock" y la última venta.
    outOfStockEvery: 7,
    outOfStockRemainder: 3
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function byId(id) {
    return document.getElementById(id);
}

// Escapa texto para insertarlo como HTML.
function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

// Generador pseudoaleatorio con semilla (congruencial lineal): devuelve una
// función que da números entre 0 y 1, siempre la misma secuencia.
function seededRandom(seed) {
    return function () {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

function pickIndex(random, length) {
    return Math.floor(random() * length);
}

function roundCents(amount) {
    return Math.round(amount * 100) / 100;
}

function lowestPrice(listings) {
    return listings.length ? Math.min(...listings.map((listing) => listing.price)) : null;
}

function formatDate(time) {
    return new Date(time).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Datos de la demo: cartas, vendedores, productos y stock
// ---------------------------------------------------------------------------

// "LOB001:UR" → impresión LOB-EN001, Ultra Rare, del set LOB.
function parsePrinting(text) {
    const [code, rarityCode] = text.split(":");
    const [, prefix, number] = code.match(/^(.*?)(\d{3})$/);
    const set = DEMO.sets[prefix];
    return {
        code: `${prefix}-EN${number}`,
        set: set.name,
        setType: set.type,
        rarity: DEMO.rarities[rarityCode].name
    };
}

var CARDS = DEMO.cards.map((card, index) => ({
    id: index,
    name: card.name,
    kind: card.kind,
    subtypes: card.subtypes,
    attribute: card.attribute || "",
    level: card.level || 0,
    atk: card.atk || 0,
    def: card.def || 0,
    basePrice: card.basePrice,
    ocg: false,
    printings: card.printings.map(parsePrinting)
}));

for (const { card, printing } of DEMO.newPrintings)
    CARDS.find((item) => item.name === card).printings.unshift(parsePrinting(printing));

// Cada carta TCG tiene una versión OCG con una impresión por idioma asiático,
// tomada de sus impresiones TCG.
for (const card of CARDS.slice()) {
    const ocgCard = JSON.parse(JSON.stringify(card));
    ocgCard.id = CARDS.length;
    ocgCard.ocg = true;
    ocgCard.printings = DEMO.ocgLanguages.map((language, index) => {
        const source = card.printings[index % card.printings.length];
        const [, prefix, number] = source.code.match(/^(.*)-EN(\d{3})$/);
        return { ...source, code: `${prefix}-${language}${number}`, language };
    });
    CARDS.push(ocgCard);
}

// El orden de las llamadas a random() importa: decide qué datos salen.
const random = seededRandom(DEMO_STOCK.seed);

var SELLERS = DEMO.sellers.map((seller, index) => ({
    id: index,
    name: seller.name,
    country: seller.country,
    rating: (4.3 + random() * 0.7).toFixed(1),
    since: 2014 + Math.floor(random() * 9)
}));

// Cada oferta es un artículo concreto en venta: un vendedor, una carta (o un
// producto), su estado, idioma, unidades y precio en euros.
var LISTINGS = [];

// Precio de referencia de una impresión en euros: precio base de la carta por
// el factor de su rareza y, en OCG, por el de su idioma.
function referencePrice(card, printing) {
    const rarity = Object.values(DEMO.rarities).find((item) => item.name === printing.rarity);
    const language = card.ocg ? DEMO.languages[printing.language].priceFactor : 1;
    return card.basePrice * rarity.priceFactor * language;
}

function addCardListings(seller, card) {
    for (let copies = 1 + Math.floor(random() * 2.5); copies > 0; copies--) {
        const printing = pickIndex(random, card.printings.length);
        // random() * random() favorece los mejores estados.
        const condition = Math.floor(random() * random() * 7);
        const conditionFactor = 1.25 - condition * 0.09 + random() * 0.2;
        LISTINGS.push({
            id: LISTINGS.length,
            seller: seller.id,
            card: card.id,
            printing,
            condition,
            language: card.ocg
                ? card.printings[printing].language
                : DEMO.tcgLanguages[pickIndex(random, DEMO.tcgLanguages.length)],
            quantity: 1 + Math.floor(random() * 6),
            price: Math.max(
                0.05,
                roundCents(referencePrice(card, card.printings[printing]) * conditionFactor)
            )
        });
    }
}

for (const card of CARDS) {
    let stocked = false;
    for (const seller of SELLERS)
        if (random() < DEMO_STOCK.cardChance) {
            addCardListings(seller, card);
            stocked = true;
        }
    if (!stocked && card.id % DEMO_STOCK.outOfStockEvery !== DEMO_STOCK.outOfStockRemainder)
        addCardListings(SELLERS[pickIndex(random, SELLERS.length)], card);
}

// market: "TCG", "OCG" o null para los accesorios, que valen para ambos.
var PRODUCTS = DEMO.products.map((product, index) => ({
    id: index,
    ...product,
    market: product.set ? "TCG" : null
}));
for (const product of PRODUCTS.slice())
    if (product.market === "TCG")
        PRODUCTS.push({
            ...product,
            id: PRODUCTS.length,
            name: `${product.name} (OCG)`,
            market: "OCG",
            basePrice: Math.round(product.basePrice * DEMO.ocgProductPriceFactor * 100) / 100
        });

function productLanguage(product) {
    if (!product.market) return "";
    const languages = product.market === "OCG" ? DEMO.ocgLanguages : DEMO.tcgLanguages;
    return languages[pickIndex(random, languages.length)];
}

for (const product of PRODUCTS) {
    let stocked = false;
    for (const seller of SELLERS)
        if (random() < DEMO_STOCK.productChance) {
            stocked = true;
            for (let copies = 1 + Math.floor(random() * 2); copies > 0; copies--)
                LISTINGS.push({
                    id: LISTINGS.length,
                    seller: seller.id,
                    card: null,
                    product: product.id,
                    condition: 0,
                    language: productLanguage(product),
                    quantity: 1 + Math.floor(random() * 8),
                    price: roundCents(product.basePrice * (0.9 + random() * 0.25))
                });
        }
    // Todo producto tiene al menos una oferta, en la primera tienda.
    if (!stocked)
        LISTINGS.push({
            id: LISTINGS.length,
            seller: 0,
            card: null,
            product: product.id,
            condition: 0,
            language: "",
            quantity: 3,
            price: product.basePrice
        });
}

// Ofertas con unidades disponibles que cumplen el filtro.
function inStock(filter) {
    return LISTINGS.filter((listing) => listing.quantity > 0 && filter(listing));
}

function listingName(listing) {
    return listing.card === null ? PRODUCTS[listing.product].name : CARDS[listing.card].name;
}

// ---------------------------------------------------------------------------
// Estado compartido
// ---------------------------------------------------------------------------

var tab = "Inicio";
var market = "TCG";
// Carrito: id de oferta → unidades.
var cart = {};
var currency = "EUR";
try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && CURRENCIES.some((item) => item.code === saved)) currency = saved;
} catch {
    /* El navegador puede bloquear el almacenamiento: se usa euro. */
}

// ---------------------------------------------------------------------------
// Presentación: precios, banderas, etiquetas y miniaturas
// ---------------------------------------------------------------------------

const priceFormats = {};

// Recibe un importe en euros y lo muestra en la moneda elegida.
function formatPrice(euros) {
    const selected = CURRENCIES.find((item) => item.code === currency);
    priceFormats[currency] =
        priceFormats[currency] ||
        new Intl.NumberFormat("es", {
            style: "currency",
            currency,
            minimumFractionDigits: selected.decimals,
            maximumFractionDigits: selected.decimals
        });
    return priceFormats[currency].format(euros * selected.perEuro);
}

function flag(country) {
    return `<svg class="fl" viewBox="0 0 30 20" role="img" aria-label="${country}">${DEMO.flags[country] || ""}</svg>`;
}

// "Nivel 8", "Rango 4" o "LINK-3"; vacío para magias y trampas.
function levelText(card) {
    if (card.kind !== "Monstruo") return "";
    if (card.subtypes.includes("Link")) return `LINK-${card.level}`;
    return `${card.subtypes.includes("Xyz") ? "Rango " : "Nivel "}${card.level}`;
}

function frameColor(card) {
    if (card.kind === "Magia") return DEMO.spellColor;
    if (card.kind === "Trampa") return DEMO.trapColor;
    for (const subtype in DEMO.frameColors)
        if (card.subtypes.includes(subtype) && subtype !== "Normal" && subtype !== "Efecto")
            return DEMO.frameColors[subtype];
    return card.subtypes.includes("Efecto") ? DEMO.frameColors.Efecto : DEMO.frameColors.Normal;
}

function thumbnail(card, className) {
    const icon = card.kind === "Magia" ? "✦" : card.kind === "Trampa" ? "⟲" : "⚔";
    return `<div class="${className}" style="background:${frameColor(card)}"><i>${icon}</i></div>`;
}

function rarityBadge(name) {
    const rarity = Object.values(DEMO.rarities).find((item) => item.name === name);
    return `<span class="rr" style="background:${rarity.background};color:${rarity.color}">${name}</span>`;
}

function marketTag(item) {
    return `<span class="tag ${item.ocg ? "o" : "t"}">${item.ocg ? "OCG" : "TCG"}</span>`;
}

function productTag(product) {
    return product.market
        ? marketTag({ ocg: product.market === "OCG" })
        : '<span class="tag a">Accesorio</span>';
}

function cardChips(card) {
    return (
        marketTag(card) +
        `<span class="chip">${card.kind}</span>` +
        card.subtypes.map((subtype) => `<span class="chip">${subtype}</span>`).join("")
    );
}

function languageName(code) {
    return code ? DEMO.languages[code].name : "—";
}

function releaseDate(setPrefix) {
    const released = DEMO.sets[setPrefix]?.released;
    return released ? formatDate(Date.parse(released)) : "—";
}

function fillSelect(select, options, allLabel) {
    select.innerHTML =
        `<option value="">${allLabel}</option>` +
        options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function conditionOptions() {
    return DEMO.conditions
        .slice(0, -1)
        .map((condition, index) => `<option value="${index}">${condition.code} o mejor</option>`)
        .join("");
}

const ADD_BUTTON = (listing) =>
    `<td class="num"><button class="btn s" data-add="${listing.id}">Añadir</button></td>`;
const NEW_CONDITION = '<span class="cond" style="background:#1b7f4d">Nuevo</span>';

function sellerCell(listing) {
    const seller = SELLERS[listing.seller];
    return `${flag(seller.country)}<button class="lk" data-v="${seller.id}">${escapeText(seller.name)}</button>`;
}

function printingCell(card, listing) {
    const printing = card.printings[listing.printing];
    return `<b>${printing.code}</b> ${rarityBadge(printing.rarity)}<small>${printing.set} · ${
        DEMO.setTypes[printing.setType]
    }</small>`;
}

function conditionCell(listing) {
    const condition = DEMO.conditions[listing.condition];
    return `<span class="cond" style="background:${condition.color}" title="${condition.name}">${condition.code}</span>`;
}

function closeButton(dialog) {
    return `<button class="ghost" data-close="${dialog}">Cerrar</button>`;
}

function openDialog(mode, id) {
    byId("md").dataset.id = id;
    byId("md").dataset.mode = mode;
}

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------

function inventoryOf(sellerId) {
    const listings = inStock((listing) => listing.seller === sellerId);
    let units = 0;
    let value = 0;
    for (const listing of listings) {
        units += listing.quantity;
        value += listing.quantity * listing.price;
    }
    return { listings, units, value };
}

function renderSellers() {
    byId("vl").innerHTML = SELLERS.map((seller) => {
        const inventory = inventoryOf(seller.id);
        return `<tr class="row" tabindex="0" data-v="${seller.id}"><td>${flag(seller.country)}<b class="lk">${escapeText(
            seller.name
        )}</b><small>Desde ${seller.since}</small></td><td class="hide">${seller.country}</td><td>★ ${
            seller.rating
        }</td><td class="num">${inventory.listings.length}</td><td class="num hide">${
            inventory.units
        }</td><td class="num price">${formatPrice(inventory.value)}</td></tr>`;
    }).join("");
}

function openSeller(id) {
    const seller = SELLERS[id];
    const inventory = inventoryOf(id);
    byId("mb").innerHTML = `<div class="top"><div><h2>${flag(seller.country)}${escapeText(
        seller.name
    )}</h2><small>${seller.country} · ★ ${seller.rating} · vendedor desde ${seller.since}</small></div>${closeButton(
        "md"
    )}</div><div class="facts" style="margin-bottom:10px"><div><span>Base de datos de ${escapeText(
        seller.name
    )}</span>${inventory.listings.length} artículos en venta</div><div><span>Unidades en stock</span>${
        inventory.units
    }</div><div><span>Valor del inventario</span><b id="vv">${formatPrice(
        inventory.value
    )}</b></div></div><div class="sel"><input id="vq" type="search" placeholder="Buscar en su inventario" aria-label="Buscar en inventario"><select id="vk" aria-label="Tipo"><option value="">Todos los tipos</option><option>Monstruo</option><option>Magia</option><option>Trampa</option><option>Producto</option></select><select id="vc" aria-label="Estado"><option value="6">Cualquier estado</option>${conditionOptions()}</select><select id="vs" aria-label="Ordenar"><option value="n">Nombre</option><option value="pa">Precio: menor a mayor</option><option value="pd">Precio: mayor a menor</option></select></div><div class="wrap"><table><thead><tr><th>Carta</th><th>Impresión</th><th>Estado</th><th>Idioma</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="vt"></tbody></table></div>`;
    openDialog("v", id);
    renderInventory();
    byId("md").classList.add("on");
}

function sortListings(listings, order) {
    return listings.sort((a, b) => {
        if (order === "pa") return a.price - b.price;
        if (order === "pd") return b.price - a.price;
        return listingName(a).localeCompare(listingName(b));
    });
}

// Inventario del vendedor abierto, con los filtros de su ventana.
function renderInventory() {
    const sellerId = Number(byId("md").dataset.id);
    const search = byId("vq").value.toLowerCase();
    const kind = byId("vk").value;
    const worstCondition = Number(byId("vc").value);
    const listings = inStock((listing) => {
        if (listing.seller !== sellerId) return false;
        if (listing.card === null)
            return (!kind || kind === "Producto") && PRODUCTS[listing.product].name.toLowerCase().includes(search);
        const card = CARDS[listing.card];
        return (
            (!kind || card.kind === kind) &&
            listing.condition <= worstCondition &&
            `${card.name} ${card.printings[listing.printing].code}`.toLowerCase().includes(search)
        );
    });
    sortListings(listings, byId("vs").value);
    byId("vt").innerHTML = listings.length
        ? listings.map(inventoryRow).join("")
        : '<tr><td colspan="7" class="empty">Este vendedor no tiene artículos con esos filtros.</td></tr>';
}

function inventoryRow(listing) {
    const tail = `<td>${languageName(listing.language)}</td><td class="num">${
        listing.quantity
    }</td><td class="num price">${formatPrice(listing.price)}</td>${ADD_BUTTON(listing)}</tr>`;
    if (listing.card === null) {
        const product = PRODUCTS[listing.product];
        return `<tr><td><button class="lk" data-pd="${product.id}">${escapeText(product.name)}</button><small>${productTag(
            product
        )}${product.category}</small></td><td>${
            product.set ? DEMO.sets[product.set].name : "—"
        }</td><td>${NEW_CONDITION}</td>${tail}`;
    }
    const card = CARDS[listing.card];
    return `<tr><td><button class="lk" data-card="${card.id}">${escapeText(card.name)}</button><small>${marketTag(
        card
    )}${card.kind} · ${card.subtypes.join(" / ")}</small></td><td>${printingCell(
        card,
        listing
    )}</td><td>${conditionCell(listing)}</td>${tail}`;
}

// ---------------------------------------------------------------------------
// Ficha de una carta de la demo (se abre desde el inventario de un vendedor)
// ---------------------------------------------------------------------------

function openDemoCard(id) {
    const card = CARDS[id];
    const facts =
        card.kind === "Monstruo"
            ? `<div><span>Atributo</span>${card.attribute}</div><div><span>Nivel / Rango / Link</span>${levelText(
                  card
              )}</div><div><span>ATK / DEF</span>${card.atk} / ${
                  card.subtypes.includes("Link") ? "—" : card.def
              }</div>`
            : `<div><span>Tipo</span>${card.kind} ${card.subtypes[0].toLowerCase()}</div>`;
    const languages = card.ocg ? DEMO.ocgLanguages : DEMO.tcgLanguages;
    byId("mb").innerHTML = `<div class="top"><div><h2>${escapeText(card.name)}</h2>${cardChips(
        card
    )}</div>${closeButton("md")}</div><div class="hero">${thumbnail(
        card,
        "thumb big"
    )}<div class="facts">${facts}<div><span>Impresiones</span>${
        card.printings.length
    }</div></div></div><div id="ch" class="chart"></div><div class="sel"><select id="fp" aria-label="Impresión"><option value="">Todas las impresiones</option>${card.printings
        .map((printing, index) => `<option value="${index}">${printing.code} · ${printing.rarity}</option>`)
        .join(
            ""
        )}</select><select id="fc" aria-label="Estado mínimo"><option value="6">Cualquier estado</option>${conditionOptions()}</select><select id="fl" aria-label="Idioma"><option value="">Todos los idiomas</option>${languages
        .map((code) => `<option value="${code}">${DEMO.languages[code].name}</option>`)
        .join(
            ""
        )}</select></div><div class="wrap"><table><thead><tr><th>Vendedor</th><th>Impresión</th><th>Estado</th><th>Idioma</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="ot"></tbody></table></div>`;
    openDialog("c", id);
    renderCardOffers();
    drawChart();
    byId("md").classList.add("on");
}

function renderCardOffers() {
    const card = CARDS[Number(byId("md").dataset.id)];
    const printing = byId("fp").value;
    const worstCondition = Number(byId("fc").value);
    const language = byId("fl").value;
    const listings = inStock(
        (listing) =>
            listing.card === card.id &&
            (printing === "" || listing.printing === Number(printing)) &&
            listing.condition <= worstCondition &&
            (!language || listing.language === language)
    ).sort((a, b) => a.price - b.price);
    byId("ot").innerHTML = listings.length
        ? listings
              .map(
                  (listing) =>
                      `<tr><td>${sellerCell(listing)}</td><td>${printingCell(card, listing)}</td><td>${conditionCell(
                          listing
                      )}</td><td>${DEMO.languages[listing.language].name}</td><td class="num">${
                          listing.quantity
                      }</td><td class="num price">${formatPrice(listing.price)}</td>${ADD_BUTTON(listing)}</tr>`
              )
              .join("")
        : '<tr><td colspan="7" class="empty">Sin ofertas con esos filtros. Prueba con otro estado, idioma o impresión.</td></tr>';
}

// ---------------------------------------------------------------------------
// Historial de precios inventado y su gráfico
// ---------------------------------------------------------------------------

let chartRangeDays = DEMO_HISTORY.defaultRangeDays;
// Datos del gráfico dibujado, para el tooltip al mover el puntero.
let drawnChart = null;
const historyCache = {};

// Ventas semanales de una impresión: un paseo aleatorio alrededor de su
// precio de referencia, con semilla propia para que no cambie entre visitas.
function priceHistory(card, printingIndex) {
    const key = `${card.id}-${printingIndex}`;
    if (historyCache[key]) return historyCache[key];
    const random = seededRandom(card.id * 131 + printingIndex * 17 + 7);
    const reference = referencePrice(card, card.printings[printingIndex]);
    let price = reference * (0.7 + random() * 0.3);
    const sales = [];
    const lastSale = Date.now() - Math.floor(random() * DEMO_HISTORY.maxDaysSinceLastSale) * DAY_MS;
    for (let week = DEMO_HISTORY.weeks - 1; week >= 0; week--) {
        // Variación de ±5 % con una ligera atracción hacia el precio de referencia.
        price = Math.max(
            reference * 0.35,
            price * (1 + (random() - 0.5) * 0.1 + ((reference - price) / reference) * 0.06)
        );
        sales.push({ time: lastSale - week * 7 * DAY_MS, price: roundCents(price) });
    }
    return (historyCache[key] = sales);
}

// Última venta de cualquier impresión de la carta.
function lastSaleOf(card) {
    let latest = null;
    card.printings.forEach((_, index) => {
        const sale = lastSaleOfPrinting(card, index);
        if (!latest || sale.time > latest.time) latest = sale;
    });
    return latest;
}

function lastSaleOfPrinting(card, printing) {
    const sales = priceHistory(card, printing);
    return { ...sales[sales.length - 1], printing };
}

function drawChart() {
    const container = byId("ch");
    if (!container) return;
    const card = CARDS[Number(byId("md").dataset.id)];
    const selected = byId("fp").value;
    const printings = selected === "" ? card.printings.map((_, index) => index) : [Number(selected)];
    const since = Date.now() - chartRangeDays * DAY_MS;
    const series = printings.map((index) => {
        const sales = priceHistory(card, index);
        const visible = sales.filter((sale) => sale.time >= since);
        return visible.length > 1 ? visible : sales.slice(-2);
    });
    const all = series.flat();
    const prices = all.map((sale) => sale.price);
    const times = all.map((sale) => sale.time);
    let low = Math.min(...prices);
    let high = Math.max(...prices);
    const padding = (high - low) * 0.12 || high * 0.1;
    low = Math.max(0, low - padding);
    high += padding;
    const start = Math.min(...times);
    const end = Math.max(...times);
    const { width, height, left, right, top, bottom } = DEMO_HISTORY.size;
    const colors = DEMO_HISTORY.lineColors;
    const x = (time) => left + ((time - start) / (end - start || 1)) * (width - left - right);
    const y = (price) => top + (1 - (price - low) / (high - low)) * (height - top - bottom);

    let svg = "";
    for (let step = 0; step < 3; step++) {
        const value = low + ((high - low) * step) / 2;
        svg += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(
            value
        )}" stroke="rgba(170,215,255,.15)"/><text x="${left - 6}" y="${
            y(value) + 4
        }" text-anchor="end" font-size="11" fill="#9db0c6">${formatPrice(value)}</text>`;
    }
    svg += `<text x="${left}" y="${height - 5}" font-size="11" fill="#9db0c6">${formatDate(start)}</text><text x="${
        width - right
    }" y="${height - 5}" text-anchor="end" font-size="11" fill="#9db0c6">${formatDate(end)}</text>`;
    series.forEach((sales, index) => {
        const path = sales
            .map((sale, step) => `${step ? "L" : "M"}${x(sale.time).toFixed(1)} ${y(sale.price).toFixed(1)}`)
            .join("");
        if (series.length === 1)
            svg += `<path d="${path}L${x(sales[sales.length - 1].time)} ${height - bottom}L${x(sales[0].time)} ${
                height - bottom
            }Z" fill="rgba(111,211,242,.12)"/>`;
        svg += `<path d="${path}" fill="none" stroke="${
            colors[printings[index] % colors.length]
        }" stroke-width="2" stroke-linejoin="round"/>`;
    });
    svg += `<line id="cv" y1="${top}" y2="${
        height - bottom
    }" stroke="rgba(255,255,255,.4)" style="display:none"/><rect id="cs" x="${left}" y="0" width="${
        width - left - right
    }" height="${height}" fill="transparent"/>`;

    const last = selected === "" ? lastSaleOf(card) : lastSaleOfPrinting(card, Number(selected));
    const first = series[0];
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const change = (first[first.length - 1].price / first[0].price - 1) * 100;
    const stock = inStock(
        (listing) => listing.card === card.id && (selected === "" || listing.printing === Number(selected))
    ).length;
    drawnChart = { series, printings, card, start, end };

    const rangeButtons = DEMO_HISTORY.ranges
        .map(
            ([label, days]) =>
                `<button data-cr="${days}" aria-pressed="${days === chartRangeDays}">${label}</button>`
        )
        .join("");
    const legend =
        printings.length > 1
            ? `<div style="margin-bottom:4px">${printings
                  .map(
                      (index) =>
                          `<span class="chip"><span style="color:${colors[index % colors.length]}">●</span> ${
                              card.printings[index].code
                          }</span>`
                  )
                  .join("")}</div>`
            : "";
    container.innerHTML = `<div class="cht"><b>Historial de precio</b><div class="seg m">${rangeButtons}</div></div>${legend}<svg id="csv" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico del historial de precio">${svg}</svg><div class="tip" id="tip"></div><div class="cs"><div><small>Última venta</small><b>${formatPrice(
        last.price
    )}</b><small>${formatDate(last.time)}${
        printings.length > 1 ? ` · ${card.printings[last.printing].code}` : ""
    }</small></div><div><small>Media del periodo</small><b>${formatPrice(
        average
    )}</b></div><div><small>Mínimo / máximo</small><b>${formatPrice(Math.min(...prices))} / ${formatPrice(
        Math.max(...prices)
    )}</b></div><div><small>Variación</small><b style="color:${change >= 0 ? "#8fe3a5" : "#ff9b92"}">${
        change >= 0 ? "+" : ""
    }${change.toFixed(1)}%</b></div></div>${
        stock
            ? ""
            : `<div class="warn">Nadie la tiene a la venta ahora. Última venta registrada: ${formatPrice(
                  last.price
              )} el ${formatDate(last.time)}.</div>`
    }`;
}

// Tooltip del gráfico: muestra la venta más cercana al puntero en cada línea.
document.addEventListener("pointermove", (event) => {
    const tip = byId("tip");
    if (!tip) return;
    const cursor = byId("cv");
    const overChart = event.target.closest && event.target.closest("#cs");
    if (!overChart || !drawnChart) {
        tip.style.display = "none";
        if (cursor) cursor.style.display = "none";
        return;
    }
    const { width, left, right } = DEMO_HISTORY.size;
    const colors = DEMO_HISTORY.lineColors;
    const { series, printings, card, start, end } = drawnChart;
    const box = byId("csv").getBoundingClientRect();
    const pointerX = ((event.clientX - box.left) / box.width) * width;
    const time = start + ((pointerX - left) / (width - left - right)) * (end - start);
    let html = "";
    let shownTime = 0;
    series.forEach((sales, index) => {
        let nearest = sales[0];
        for (const sale of sales) if (Math.abs(sale.time - time) < Math.abs(nearest.time - time)) nearest = sale;
        if (index === 0) {
            shownTime = nearest.time;
            html = `<b>${formatDate(nearest.time)}</b>`;
        }
        html += `<div><span style="color:${colors[printings[index] % colors.length]}">●</span> ${
            card.printings[printings[index]].code
        }: ${formatPrice(nearest.price)}</div>`;
    });
    const lineX = left + ((shownTime - start) / (end - start || 1)) * (width - left - right);
    cursor.setAttribute("x1", lineX);
    cursor.setAttribute("x2", lineX);
    cursor.style.display = "";
    tip.innerHTML = html;
    tip.style.display = "block";
    const chartBox = byId("ch").getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(event.clientX - chartBox.left + 12, 0), chartBox.width - 170)}px`;
    tip.style.top = "34px";
});

// ---------------------------------------------------------------------------
// Productos sellados y accesorios
// ---------------------------------------------------------------------------

function inMarket(product) {
    return !product.market || product.market === market;
}

function openProduct(id) {
    const product = PRODUCTS[id];
    const set = product.set
        ? `${DEMO.sets[product.set].name} (${DEMO.setTypes[DEMO.sets[product.set].type]})`
        : "Accesorio, sin set";
    byId("mb").innerHTML = `<div class="top"><div><h2>${escapeText(product.name)}</h2>${productTag(
        product
    )}<span class="chip">${product.category}</span></div>${closeButton(
        "md"
    )}</div><div class="facts" style="margin-bottom:10px"><div><span>Set</span>${set}</div><div><span>Lanzamiento</span>${releaseDate(
        product.set
    )}</div></div><div class="wrap"><table><thead><tr><th>Vendedor</th><th>Idioma</th><th>Estado</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="pt"></tbody></table></div>`;
    openDialog("p", id);
    renderProductOffers();
    byId("md").classList.add("on");
}

function renderProductOffers() {
    const id = Number(byId("md").dataset.id);
    const listings = inStock((listing) => listing.product === id).sort((a, b) => a.price - b.price);
    byId("pt").innerHTML = listings.length
        ? listings
              .map(
                  (listing) =>
                      `<tr><td>${sellerCell(listing)}</td><td>${languageName(
                          listing.language
                      )}</td><td>${NEW_CONDITION}</td><td class="num">${
                          listing.quantity
                      }</td><td class="num price">${formatPrice(listing.price)}</td>${ADD_BUTTON(listing)}</tr>`
              )
              .join("")
        : '<tr><td colspan="6" class="empty">Nadie lo tiene a la venta ahora.</td></tr>';
}

// Novedades primero (por fecha de lanzamiento del set), luego por nombre.
function byReleaseThenName(a, b) {
    const releasedA = DEMO.sets[a.set]?.released || "";
    const releasedB = DEMO.sets[b.set]?.released || "";
    if (releasedA !== releasedB) return releasedB < releasedA ? -1 : 1;
    return a.name.localeCompare(b.name);
}

function renderProducts() {
    const categorySelect = byId("pc");
    if (!categorySelect.options.length)
        fillSelect(
            categorySelect,
            DEMO.productCategories.map((category) => [category, category]),
            "Todas las categorías"
        );
    const search = byId("q").value.toLowerCase();
    const category = categorySelect.value;
    const products = PRODUCTS.filter(
        (product) =>
            inMarket(product) &&
            (!category || product.category === category) &&
            `${product.name} ${product.set ? DEMO.sets[product.set].name : ""}`.toLowerCase().includes(search)
    ).sort(byReleaseThenName);
    byId("pcnt").textContent = `${products.length} productos`;
    byId("pl").innerHTML = products.length
        ? products
              .map((product) => {
                  const offers = inStock((listing) => listing.product === product.id);
                  const lowest = lowestPrice(offers);
                  return `<tr class="row" tabindex="0" data-pd="${
                      product.id
                  }"><td><div class="nm"><div class="thumb" style="background:#3b4a6b"><i>${
                      product.icon
                  }</i></div><div><b>${escapeText(product.name)}</b><small>${
                      product.set ? DEMO.sets[product.set].name : "Accesorio"
                  }</small></div></div></td><td>${productTag(product)}<span class="chip">${
                      product.category
                  }</span></td><td class="hide">${releaseDate(product.set)}</td><td class="num price">${
                      lowest === null ? "Sin stock" : formatPrice(lowest)
                  }</td><td class="num hide">${offers.length}</td></tr>`;
              })
              .join("")
        : '<tr><td colspan="5" class="empty">Ningún producto coincide con esos filtros.</td></tr>';
}

// ---------------------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------------------

// En la página del carrito, "Vaciar carrito" pide un segundo clic para confirmar.
var cartClearArmed = false;

// Agrupa el carrito por vendedor. Cada vendedor envía por separado: el envío
// se cobra por vendedor y es gratis a partir de SHIPPING.freeFrom.
function cartTotals() {
    const groups = {};
    let subtotal = 0;
    for (const key of Object.keys(cart)) {
        const listing = LISTINGS[key];
        const amount = listing.price * cart[key];
        if (!groups[listing.seller])
            groups[listing.seller] = { seller: SELLERS[listing.seller], keys: [], sub: 0, units: 0 };
        const group = groups[listing.seller];
        group.keys.push(key);
        group.sub += amount;
        group.units += cart[key];
        subtotal += amount;
    }
    const sellers = Object.values(groups);
    for (const group of sellers) group.ship = group.sub >= SHIPPING.freeFrom ? 0 : SHIPPING.perSeller;
    const shipping = sellers.reduce((sum, group) => sum + group.ship, 0);
    return { sellers, sub: subtotal, ship: shipping, total: subtotal + shipping };
}

// Nombre, etiqueta y detalle de una línea del carrito.
function cartLine(key) {
    const listing = LISTINGS[key];
    if (listing.card === null) {
        const product = PRODUCTS[listing.product];
        return {
            name: product.name,
            tag: productTag(product),
            meta: product.category + (listing.language ? ` · ${languageName(listing.language)}` : "")
        };
    }
    const card = CARDS[listing.card];
    const printing = card.printings[listing.printing];
    return {
        name: card.name,
        tag: marketTag(card),
        meta: `${printing.code} · ${printing.rarity} · ${DEMO.conditions[listing.condition].code} · ${languageName(
            listing.language
        )}`
    };
}

function toast(message) {
    const element = byId("ts");
    element.textContent = message;
    element.style.display = "block";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
        element.style.display = "none";
    }, TOAST_DURATION_MS);
}

function addToCart(id) {
    const listing = LISTINGS[id];
    const inCart = cart[id] || 0;
    if (inCart >= listing.quantity) {
        toast(`Solo hay ${listing.quantity} unidades de ${SELLERS[listing.seller].name}`);
        return;
    }
    cart[id] = inCart + 1;
    updateCartCount();
    toast(`${listingName(listing)} añadido al carrito`);
}

function updateCartCount() {
    byId("cc").textContent = Object.values(cart).reduce((sum, units) => sum + units, 0);
}

function emptyCart() {
    for (const key of Object.keys(cart)) delete cart[key];
}

// Ventana emergente del carrito. "Ampliar carrito" abre la página completa
// (frontend/js/cart-page.js).
function showCart() {
    const keys = Object.keys(cart);
    let html = `<div class="top"><h2>Tu carrito</h2>${closeButton("cart")}</div>`;
    if (!keys.length)
        html +=
            '<div class="empty">Tu carrito está vacío. Abre una carta, un producto o el inventario de un vendedor y añade lo que prefieras.</div>';
    else {
        const rows = keys
            .map((key) => {
                const listing = LISTINGS[key];
                const line = cartLine(key);
                // En la ventana el idioma de un producto no se muestra, sí el vendedor.
                const meta =
                    listing.card === null ? PRODUCTS[listing.product].category : line.meta;
                return `<tr><td><b>${escapeText(line.name)}</b> ${line.tag}<small>${meta} · ${escapeText(
                    SELLERS[listing.seller].name
                )}</small></td><td class="num">${cart[key]} × ${formatPrice(
                    listing.price
                )}</td><td class="num"><button class="ghost" data-rm="${key}">Quitar</button></td></tr>`;
            })
            .join("");
        const totals = cartTotals();
        const sellers = totals.sellers.length;
        html += `<table><tbody>${rows}</tbody></table><div class="tot sm"><span>Subtotal</span><span>${formatPrice(
            totals.sub
        )}</span></div><div class="tot sm" style="padding-top:4px"><span>Envío (${sellers}${
            sellers === 1 ? " vendedor" : " vendedores"
        }, gratis desde ${formatPrice(SHIPPING.freeFrom)} por vendedor)</span><span>${
            totals.ship ? formatPrice(totals.ship) : "Gratis"
        }</span></div><div class="tot"><span>Total</span><span>${formatPrice(
            totals.total
        )}</span></div><p class="cart-actions"><button class="ghost" data-cart-expand>Ampliar carrito</button><button class="btn" data-buy="1">Finalizar compra</button></p>`;
    }
    byId("cbx").innerHTML = html;
    byId("cart").classList.add("on");
}

// Compra de demostración: descuenta el stock y vacía el carrito.
function checkout() {
    for (const key in cart) LISTINGS[key].quantity -= cart[key];
    emptyCart();
    updateCartCount();
    showTab();
    byId("cbx").innerHTML = `<div class="top"><h2>Pedido recibido</h2>${closeButton(
        "cart"
    )}</div><div class="empty">Es una demo: no se ha cobrado nada, pero el stock de cada vendedor se ha actualizado.</div>`;
}

// ---------------------------------------------------------------------------
// Navegación: pestañas, mercado y moneda
// ---------------------------------------------------------------------------

function renderTabs() {
    byId("tabs").innerHTML = TABS.map(
        (name) => `<button aria-pressed="${name === tab}" data-g="${name}">${TAB_LABELS[name]}</button>`
    ).join("");
}

// Muestra la pestaña actual. catalog.js la sustituye y la llama solo para
// "Productos" y "Vendedores".
function showTab() {
    renderTabs();
    const panel = { Productos: "prod", Vendedores: "vend" }[tab];
    for (const id of ["home", "prod", "vend", "cat"]) byId(id).style.display = id === panel ? "" : "none";
    refreshList();
}

// Vuelve a dibujar el listado de la pestaña actual.
function refreshList() {
    if (tab === "Productos") renderProducts();
    if (tab === "Vendedores") renderSellers();
}

// Las ventanas emergentes empiezan justo debajo de la cabecera.
function alignDialogs() {
    const offset = document.querySelector("header").getBoundingClientRect().bottom + DIALOG_GAP_PX;
    byId("md").style.paddingTop = `${offset}px`;
    byId("cart").style.paddingTop = `${offset}px`;
}

function updateMarketButtons() {
    document.querySelectorAll("[data-mk]").forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.mk === market);
    });
}

// Tras cambiar de moneda, vuelve a pintar lo que esté a la vista.
function refreshPrices() {
    refreshList();
    const dialog = byId("md");
    if (dialog.classList.contains("on")) {
        const mode = dialog.dataset.mode;
        if (mode === "c") {
            renderCardOffers();
            drawChart();
        } else if (mode === "p") renderProductOffers();
        else if (mode === "v") {
            byId("vv").innerHTML = formatPrice(inventoryOf(Number(dialog.dataset.id)).value);
            renderInventory();
        }
    }
    if (byId("cart").classList.contains("on")) showCart();
}

byId("cur").innerHTML = CURRENCIES.map(
    (item) =>
        `<option value="${item.code}"${item.code === currency ? " selected" : ""}>${item.code} · ${
            item.name
        }</option>`
).join("");
byId("cur").addEventListener("change", (event) => {
    currency = event.target.value;
    try {
        localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
        /* Preferencia opcional. */
    }
    refreshPrices();
});

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

// Un único receptor de clics: cada botón declara su acción con un atributo
// data-*. El orden importa cuando un elemento está dentro de otro. Las
// acciones llaman a las funciones por su nombre global en el momento del clic,
// porque catalog.js las envuelve (aviso de demo) después de cargar este archivo.
const CLICK_ACTIONS = [
    ["[data-mk]", (button) => {
        market = button.dataset.mk;
        updateMarketButtons();
        showTab();
    }],
    ["[data-cr]", (button) => {
        chartRangeDays = Number(button.dataset.cr);
        drawChart();
    }],
    ["[data-pd]", (button) => openProduct(Number(button.dataset.pd))],
    ["[data-go]", (button) => {
        tab = button.dataset.go;
        showTab();
    }],
    ["[data-g]", (button) => {
        tab = button.dataset.g;
        showTab();
    }],
    ["[data-add]", (button) => addToCart(Number(button.dataset.add))],
    ["[data-rm]", (button) => {
        delete cart[button.dataset.rm];
        updateCartCount();
        showCart();
    }],
    ["[data-buy]", checkout],
    ["[data-close]", (button) => byId(button.dataset.close).classList.remove("on")],
    ["#md, #cart", (dialog, target) => {
        // Solo al pulsar el fondo oscuro, no el contenido de la ventana.
        if (target === dialog) dialog.classList.remove("on");
        else return false;
    }],
    ["#cb", () => showCart()],
    ["[data-v]", (element) => openSeller(Number(element.dataset.v))],
    ["[data-card]", (element) => openDemoCard(Number(element.dataset.card))]
];

document.addEventListener("click", (event) => {
    alignDialogs();
    for (const [selector, action] of CLICK_ACTIONS) {
        const element = event.target.closest(selector);
        if (element && action(element, event.target) !== false) return;
    }
});

document.addEventListener("input", (event) => {
    if (event.target.id === "vq") renderInventory();
});

document.addEventListener("change", (event) => {
    const id = event.target.id;
    if (id === "fp" || id === "fc" || id === "fl") renderCardOffers();
    if (id === "fp") drawChart();
    if (id === "pc") renderProducts();
    if (id === "vk" || id === "vc" || id === "vs") renderInventory();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        byId("md").classList.remove("on");
        byId("cart").classList.remove("on");
    }
    alignDialogs();
    const row = event.target;
    if (event.key === "Enter" && row.classList && row.classList.contains("row")) {
        if (row.dataset.v) openSeller(Number(row.dataset.v));
        else if (row.dataset.pd) openProduct(Number(row.dataset.pd));
    }
});
// La vista inicial la pinta catalog.js cuando carga sus módulos.
