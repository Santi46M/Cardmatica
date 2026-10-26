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
//   datos:      DEMO, TABS, TAB_LABELS, CARDS, SELLERS, LISTINGS, PRODUCTS,
//               CURRENCIES, SHIPPING
//   funciones:  showTab, refreshList, formatPrice, currencyOptions, flag, toast, alignDialogs,
//               updateMarketButtons, updateCartCount, cartTotals, cartLine,
//               openDemoCard, openSeller, openProduct, showCart
// frontend/js/catalog.js sustituye showTab y refreshList para las pestañas del
// catálogo real y llama a las versiones de aquí solo para la tienda demo.

/* global DEMO, I18N, t */
// Los textos van en español y pasan por t() (frontend/i18n.js), que devuelve
// la versión del idioma de la página.

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
    // Colores del tema (styles.css), uno por impresión.
    lineColors: ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"],
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

// Las plantillas se escriben como HTML con sangría, un elemento por línea.
// markup`...` las une como las espera el navegador: quita cada salto de línea
// y la sangría que lo sigue, así que en pantalla no cambia nada. Es la misma
// función que html() de frontend/js/html.js (este archivo no es un módulo).
function markup(strings, ...values) {
    return strings.reduce(
        (out, text, index) => out + text.replace(/\n\s*/g, "") + (index < values.length ? `${values[index]}` : ""),
        ""
    );
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
    return new Date(time).toLocaleDateString(I18N.locale, { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Datos de la demo: cartas, vendedores, productos y stock
// ---------------------------------------------------------------------------

// "LOB-EN001:UR" → impresión LOB-EN001, Ultra Rare, del set LOB, en inglés.
// Los códigos sin idioma (SDK-001) son de la primera edición en inglés.
function parsePrinting(text) {
    const [code, rarityCode] = text.split(":");
    const [prefix, number] = code.split("-");
    const set = DEMO.sets[prefix];
    return {
        code,
        prefix,
        set: set.name,
        setType: set.type,
        rarity: DEMO.rarities[rarityCode].name,
        language: number.match(/^[A-Z]{2}/)?.[0] || "EN"
    };
}

function demoCard(card, id, ocg) {
    return {
        id,
        name: card.name,
        kind: card.kind,
        subtypes: card.subtypes,
        attribute: card.attribute || "",
        level: card.level || 0,
        atk: card.atk || 0,
        def: card.def || 0,
        basePrice: card.basePrice,
        ocg,
        printings: (ocg ? card.ocg : card.printings).map(parsePrinting)
    };
}

// Cada carta es TCG; las que tienen impresiones japonesas también tienen su
// versión OCG.
var CARDS = DEMO.cards.map((card, index) => demoCard(card, index, false));
for (const card of DEMO.cards) if (card.ocg) CARDS.push(demoCard(card, CARDS.length, true));

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
            language: card.printings[printing].language,
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
    ...product,
    id: index,
    market: product.market || null,
    released: product.released || DEMO.sets[product.set]?.released || ""
}));

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
            language: productLanguage(product),
            quantity: 3,
            price: product.basePrice
        });
}

// Nombre de un producto en el idioma de la página: los sellados llevan el
// nombre del set en {set} ("Caja de sobres {set}").
function productName(product) {
    return t(product.name, { set: product.set ? DEMO.sets[product.set].name : "" });
}

// Ofertas con unidades disponibles que cumplen el filtro.
function inStock(filter) {
    return LISTINGS.filter((listing) => listing.quantity > 0 && filter(listing));
}

function listingName(listing) {
    return listing.card === null ? productName(PRODUCTS[listing.product]) : CARDS[listing.card].name;
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
        new Intl.NumberFormat(I18N.locale, {
            style: "currency",
            currency,
            minimumFractionDigits: selected.decimals,
            maximumFractionDigits: selected.decimals
        });
    return priceFormats[currency].format(euros * selected.perEuro);
}

function flag(country) {
    return `<svg class="fl" viewBox="0 0 30 20" role="img" aria-label="${t(country)}">${DEMO.flags[country] || ""}</svg>`;
}

// "Nivel 8", "Rango 4" o "LINK-3"; vacío para magias y trampas.
function levelText(card) {
    if (card.kind !== "Monstruo") return "";
    if (card.subtypes.includes("Link")) return `LINK-${card.level}`;
    return t(card.subtypes.includes("Xyz") ? "Rango {number}" : "Nivel {number}", { number: card.level });
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
    return `<span class="rr" data-tone="${rarity.tone}">${name}</span>`;
}

function marketTag(item) {
    return `<span class="tag ${item.ocg ? "o" : "t"}">${item.ocg ? "OCG" : "TCG"}</span>`;
}

function productTag(product) {
    return product.market
        ? marketTag({ ocg: product.market === "OCG" })
        : `<span class="tag a">${t("Accesorio")}</span>`;
}

function cardChips(card) {
    return (
        marketTag(card) +
        `<span class="chip">${t(card.kind)}</span>` +
        card.subtypes.map((subtype) => `<span class="chip">${t(subtype)}</span>`).join("")
    );
}

function languageName(code) {
    return code ? t(DEMO.languages[code].name) : "—";
}

// "2026-10-09" es un día del calendario: se lee a medianoche local, no en UTC,
// para que no se muestre el día anterior en América.
function releaseDate(released) {
    return released ? formatDate(Date.parse(`${released}T00:00`)) : "—";
}

// "Estado mínimo": Mint solo, y del resto ese estado o uno mejor.
function conditionOptions() {
    return DEMO.conditions
        .slice(0, -1)
        .map((condition, index) => {
            const orBetter = index ? ` ${t("o mejor")}` : "";
            return `<option value="${index}">${t(condition.name)} (${condition.code})${orBetter}</option>`;
        })
        .join("");
}

const ADD_BUTTON = (listing) =>
    `<td class="num"><button class="btn s" data-add="${listing.id}">${t("Añadir")}</button></td>`;
const NEW_CONDITION = () => `<span class="cond" style="background:#1b7f4d">${t("Nuevo")}</span>`;

function sellerCell(listing) {
    const seller = SELLERS[listing.seller];
    return `${flag(seller.country)}<button class="lk" data-v="${seller.id}">${escapeText(seller.name)}</button>`;
}

function printingCell(card, listing) {
    const printing = card.printings[listing.printing];
    const origin = `${printing.set} · ${t(DEMO.setTypes[printing.setType])}`;
    return `<b>${printing.code}</b> ${rarityBadge(printing.rarity)}<small>${origin}</small>`;
}

function conditionCell(listing) {
    const condition = DEMO.conditions[listing.condition];
    return `<span class="cond" style="background:${condition.color}" title="${t(condition.name)}">${condition.code}</span>`;
}

function closeButton(dialog) {
    return `<button class="ghost" data-close="${dialog}">${t("Cerrar")}</button>`;
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
        return markup`
            <tr class="row" tabindex="0" data-v="${seller.id}">
                <td>
                    ${flag(seller.country)}<b class="lk">${escapeText(seller.name)}</b>
                    <small>${t("Desde {year}", { year: seller.since })}</small>
                </td>
                <td class="hide">${t(seller.country)}</td>
                <td title="${t("Valoración ficticia de la tienda de demostración")}">★ ${seller.rating}</td>
                <td class="num">${inventory.listings.length}</td>
                <td class="num hide">${inventory.units}</td>
                <td class="num price">${formatPrice(inventory.value)}</td>
            </tr>`;
    }).join("");
}

function openSeller(id) {
    const seller = SELLERS[id];
    const inventory = inventoryOf(id);
    const kinds = ["Monstruo", "Magia", "Trampa", "Producto"]
        .map((kind) => `<option value="${kind}">${t(kind)}</option>`)
        .join("");
    const since = t("vendedor desde {year}", { year: seller.since });
    byId("mb").innerHTML = markup`
        <div class="top">
            <div>
                <h2>${flag(seller.country)}${escapeText(seller.name)}</h2>
                <small>${t(seller.country)} · ★ ${seller.rating} · ${since}</small>
            </div>
            ${closeButton("md")}
        </div>
        <div class="facts" style="margin-bottom:10px">
            <div>
                <span>${escapeText(t("Base de datos de {name}", { name: seller.name }))}</span>
                ${t("{count} artículos en venta", { count: inventory.listings.length })}
            </div>
            <div><span>${t("Unidades en stock")}</span>${inventory.units}</div>
            <div><span>${t("Valor del inventario")}</span><b id="vv">${formatPrice(inventory.value)}</b></div>
        </div>
        <div class="sel">
            <input id="vq" type="search" placeholder="${t("Buscar en su inventario")}" aria-label="${t("Buscar en inventario")}">
            <select id="vk" aria-label="${t("Tipo")}">
                <option value="">${t("Todos los tipos")}</option>
                ${kinds}
            </select>
            <select id="vc" aria-label="${t("Estado")}">
                <option value="6">${t("Cualquier estado")}</option>
                ${conditionOptions()}
            </select>
            <select id="vs" aria-label="${t("Ordenar")}">
                <option value="n">${t("Nombre")}</option>
                <option value="pa">${t("Precio: menor a mayor")}</option>
                <option value="pd">${t("Precio: mayor a menor")}</option>
            </select>
        </div>
        <div class="wrap">
            <table>
                <thead>
                    <tr>
                        <th>${t("Carta")}</th>
                        <th>${t("Impresión")}</th>
                        <th>${t("Estado")}</th>
                        <th>${t("Idioma")}</th>
                        <th class="num">${t("Disp.")}</th>
                        <th class="num">${t("Precio")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="vt"></tbody>
            </table>
        </div>`;
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
            return (!kind || kind === "Producto") && productName(PRODUCTS[listing.product]).toLowerCase().includes(search);
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
        : `<tr><td colspan="7" class="empty">${t("Este vendedor no tiene artículos con esos filtros.")}</td></tr>`;
}

function inventoryRow(listing) {
    const tail = markup`
            <td>${languageName(listing.language)}</td>
            <td class="num">${listing.quantity}</td>
            <td class="num price">${formatPrice(listing.price)}</td>
            ${ADD_BUTTON(listing)}
        </tr>`;
    if (listing.card === null) {
        const product = PRODUCTS[listing.product];
        return markup`
            <tr>
                <td>
                    <button class="lk" data-pd="${product.id}">${escapeText(productName(product))}</button>
                    <small>${productTag(product)}${t(product.category)}</small>
                </td>
                <td>${escapeText(productOrigin(product))}</td>
                <td>${NEW_CONDITION()}</td>
                ${tail}`;
    }
    const card = CARDS[listing.card];
    const subtypes = card.subtypes.map((subtype) => t(subtype)).join(" / ");
    return markup`
        <tr>
            <td>
                <button class="lk" data-card="${card.id}">${escapeText(card.name)}</button>
                <small>${marketTag(card)}${t(card.kind)} · ${subtypes}</small>
            </td>
            <td>${printingCell(card, listing)}</td>
            <td>${conditionCell(listing)}</td>
            ${tail}`;
}

// ---------------------------------------------------------------------------
// Ficha de una carta de la demo (se abre desde el inventario de un vendedor)
// ---------------------------------------------------------------------------

// Misma disposición que la ficha del catálogo real (catalog-view.js): cabecera,
// imagen, panel de información con gráfico y, debajo, la tabla de ofertas con
// sus filtros a la izquierda.
function openDemoCard(id) {
    const card = CARDS[id];
    const languages = [...new Set(card.printings.map((printing) => printing.language))];
    const defense = card.subtypes.includes("Link") ? "—" : card.def;
    const stats = [
        t(card.kind),
        card.subtypes.map((subtype) => t(subtype)).join(" / "),
        card.attribute ? t(card.attribute) : "",
        levelText(card),
        card.kind === "Monstruo" ? `ATK ${card.atk} / DEF ${defense}` : ""
    ]
        .filter(Boolean)
        .join(" · ");
    const printingOptions = card.printings
        .map((printing, index) => `<option value="${index}">${printing.code} · ${printing.rarity}</option>`)
        .join("");
    const languageOptions = languages
        .map((code) => `<option value="${code}">${t(DEMO.languages[code].name)}</option>`)
        .join("");
    byId("mb").innerHTML = markup`
        <div class="card-detail">
            <div class="cd-head">
                <div>
                    <h2>${escapeText(card.name)}</h2>
                    <p class="cd-sub" id="cd-sub"></p>
                </div>
                <div class="top-actions">${closeButton("md")}</div>
            </div>
            <div class="cd-top">
                <figure class="cd-image gl">
                    ${thumbnail(card, "thumb big")}
                    <figcaption>${cardChips(card)}</figcaption>
                </figure>
                <div class="cd-info gl">
                    <div class="cd-tabs" role="tablist">
                        <button role="tab" aria-selected="true" data-cd-tab="info">ⓘ ${t("Info")}</button>
                    </div>
                    <div class="cd-panel" data-cd-panel="info">
                        <div class="cd-cols">
                            <div><dl class="cd-facts" id="cd-facts"></dl></div>
                            <div class="cd-chart"><div id="ch" class="chart"></div></div>
                        </div>
                        <div class="cd-text"><p class="cd-stats">${stats}</p></div>
                    </div>
                </div>
            </div>
            <section class="cd-offers">
                <aside class="cd-filters gl" aria-label="Filtrar ofertas">
                    <label>
                        ${t("Impresión")}
                        <select id="fp">
                            <option value="">${t("Todas las impresiones")}</option>
                            ${printingOptions}
                        </select>
                    </label>
                    <label>
                        ${t("Estado mínimo")}
                        <select id="fc">
                            <option value="6">${t("Cualquier estado")}</option>
                            ${conditionOptions()}
                        </select>
                    </label>
                    <label>
                        ${t("Idioma")}
                        <select id="fl">
                            <option value="">${t("Todos los idiomas")}</option>
                            ${languageOptions}
                        </select>
                    </label>
                </aside>
                <div class="gl wrap">
                    <table class="cd-table">
                        <thead>
                            <tr>
                                <th>${t("Vendedor")}</th>
                                <th>${t("Información del producto")}</th>
                                <th class="num">${t("Oferta")}</th>
                            </tr>
                        </thead>
                        <tbody id="ot"></tbody>
                    </table>
                </div>
            </section>
        </div>`;
    openDialog("c", id);
    renderCardOffers();
    drawChart();
    byId("md").classList.add("on");
}

function factRow(label, value) {
    return `<div><dt>${t(label)}</dt><dd>${value}</dd></div>`;
}

// Datos de la impresión elegida (o de la primera) y resumen de precios.
function renderDemoFacts(card, selected, summary) {
    const printing = card.printings[selected === "" ? 0 : Number(selected)];
    const offers = inStock(
        (listing) => listing.card === card.id && (selected === "" || listing.printing === Number(selected))
    );
    const units = offers.reduce((sum, listing) => sum + listing.quantity, 0);
    const lowest = lowestPrice(offers);
    // Con varias impresiones a la vista, la última venta dice de cuál fue.
    const which =
        selected === "" && card.printings.length > 1 ? ` · ${card.printings[summary.last.printing].code}` : "";
    const rising = summary.change >= 0;
    byId("cd-sub").textContent = `${printing.set} · ${t("Cartas sueltas")}`;
    byId("cd-facts").innerHTML =
        factRow("Rareza", rarityBadge(printing.rarity)) +
        factRow("Número", printing.code) +
        factRow("Impreso en", `${printing.set} <small>${t(DEMO.setTypes[printing.setType])}</small>`) +
        factRow("Disponibles", units) +
        factRow("Desde", lowest === null ? t("Sin stock") : formatPrice(lowest)) +
        factRow("Última venta", `${formatPrice(summary.last.price)} <small>${formatDate(summary.last.time)}${which}</small>`) +
        factRow("Media del periodo", formatPrice(summary.average)) +
        factRow("Mínimo / máximo", `${formatPrice(summary.low)} / ${formatPrice(summary.high)}`) +
        factRow("Variación", `<b class="${rising ? "up" : "down"}">${rising ? "+" : ""}${summary.change.toFixed(1)}%</b>`);
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
    if (!listings.length) {
        const none = t("Sin ofertas con esos filtros. Prueba con otro estado, idioma o impresión.");
        byId("ot").innerHTML = `<tr><td colspan="3" class="empty">${none}</td></tr>`;
        return;
    }
    byId("ot").innerHTML = listings
        .map((listing) => {
            const offer = card.printings[listing.printing];
            return markup`
                <tr>
                    <td>${sellerCell(listing)}</td>
                    <td>
                        <div class="cd-product">
                            ${conditionCell(listing)}
                            <span>${t(DEMO.languages[listing.language].name)}</span>
                            <small>${offer.code} · ${offer.rarity}</small>
                        </div>
                    </td>
                    <td class="num">
                        <div class="cd-offer">
                            <b class="price">${formatPrice(listing.price)}</b>
                            <span title="${t("Unidades disponibles")}">${listing.quantity}</span>
                            <button class="btn s" data-add="${listing.id}" aria-label="${t("Añadir al carrito")}">🛒</button>
                        </div>
                    </td>
                </tr>`;
        })
        .join("");
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

    const floor = height - bottom;

    // Tres líneas de precio, las fechas de los extremos y una línea por impresión.
    let svg = "";
    for (let step = 0; step < 3; step++) {
        const value = low + ((high - low) * step) / 2;
        svg += markup`
            <line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="ch-grid"/>
            <text x="${left - 6}" y="${y(value) + 4}" text-anchor="end" font-size="11" class="ch-axis">${formatPrice(value)}</text>`;
    }
    svg += markup`
        <text x="${left}" y="${height - 5}" font-size="11" class="ch-axis">${formatDate(start)}</text>
        <text x="${width - right}" y="${height - 5}" text-anchor="end" font-size="11" class="ch-axis">${formatDate(end)}</text>`;
    series.forEach((sales, index) => {
        const path = sales
            .map((sale, step) => `${step ? "L" : "M"}${x(sale.time).toFixed(1)} ${y(sale.price).toFixed(1)}`)
            .join("");
        // Con una sola línea, el área bajo ella va sombreada.
        if (series.length === 1)
            svg += `<path d="${path}L${x(sales[sales.length - 1].time)} ${floor}L${x(sales[0].time)} ${floor}Z" class="ch-area"/>`;
        const color = colors[printings[index] % colors.length];
        svg += `<path d="${path}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round"/>`;
    });
    // Cursor vertical y zona que recibe el puntero (ver "pointermove" más abajo).
    svg += markup`
        <line id="cv" y1="${top}" y2="${floor}" class="ch-cursor" style="display:none"/>
        <rect id="cs" x="${left}" y="0" width="${width - left - right}" height="${height}" fill="transparent"/>`;

    const last = selected === "" ? lastSaleOf(card) : lastSaleOfPrinting(card, Number(selected));
    const first = series[0];
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const change = (first[first.length - 1].price / first[0].price - 1) * 100;
    const stock = inStock(
        (listing) => listing.card === card.id && (selected === "" || listing.printing === Number(selected))
    ).length;
    drawnChart = { series, printings, card, start, end };

    const rangeButtons = DEMO_HISTORY.ranges
        .map(([label, days]) => `<button data-cr="${days}" aria-pressed="${days === chartRangeDays}">${t(label)}</button>`)
        .join("");
    const legendChips = printings
        .map(
            (index) =>
                `<span class="chip"><span style="color:${colors[index % colors.length]}">●</span> ${card.printings[index].code}</span>`
        )
        .join("");
    const legend = printings.length > 1 ? `<div style="margin-bottom:4px">${legendChips}</div>` : "";
    const soldOut = t("Nadie la tiene a la venta ahora. Última venta registrada: {price} el {date}.", {
        price: formatPrice(last.price),
        date: formatDate(last.time)
    });
    container.innerHTML = markup`
        <div class="cht">
            <b>${t("Historial de precio")}</b>
            <div class="seg m">${rangeButtons}</div>
        </div>
        ${legend}
        <svg id="csv" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("Gráfico del historial de precio")}">${svg}</svg>
        <div class="tip" id="tip"></div>
        ${stock ? "" : `<div class="warn">${soldOut}</div>`}`;
    renderDemoFacts(card, selected, {
        last,
        average,
        change,
        low: Math.min(...prices),
        high: Math.max(...prices)
    });
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
    let lines = "";
    let shownTime = 0;
    series.forEach((sales, index) => {
        let nearest = sales[0];
        for (const sale of sales) if (Math.abs(sale.time - time) < Math.abs(nearest.time - time)) nearest = sale;
        if (index === 0) {
            shownTime = nearest.time;
            lines = `<b>${formatDate(nearest.time)}</b>`;
        }
        const color = colors[printings[index] % colors.length];
        const code = card.printings[printings[index]].code;
        lines += `<div><span style="color:${color}">●</span> ${code}: ${formatPrice(nearest.price)}</div>`;
    });
    const lineX = left + ((shownTime - start) / (end - start || 1)) * (width - left - right);
    cursor.setAttribute("x1", lineX);
    cursor.setAttribute("x2", lineX);
    cursor.style.display = "";
    tip.innerHTML = lines;
    tip.style.display = "block";
    const chartBox = byId("ch").getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(event.clientX - chartBox.left + 12, 0), chartBox.width - 170)}px`;
    tip.style.top = "34px";
});

// ---------------------------------------------------------------------------
// Productos sellados y accesorios
// ---------------------------------------------------------------------------

// De qué set es un producto sellado, o de qué marca un accesorio.
function productOrigin(product) {
    return product.set ? DEMO.sets[product.set].name : product.brand || "—";
}

// Fotos provisionales de los productos, de sus páginas oficiales. La API solo
// las da en la vista de prueba privada con imágenes activadas
// (backend/app/services/product_images.py); en cualquier otro caso la lista
// llega vacía y cada producto muestra su ícono.
var PRODUCT_PHOTOS = {};
fetch("/api/v1/product-images")
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
        PRODUCT_PHOTOS = data.images || {};
        if (Object.keys(PRODUCT_PHOTOS).length && tab === "Productos") renderProducts();
    })
    .catch(() => {});

const PHOTO_WARNING = () =>
    t("Foto provisional de la página oficial, sin licencia: visible solo en la vista de prueba privada. No publicar.");

function productIcon(product, big = false) {
    return `<div class="thumb${big ? " big" : ""}" style="background:#3b4a6b"><i>${product.icon}</i></div>`;
}

// La foto del producto con su aviso, o su ícono si no hay foto.
function productThumb(product, big = false) {
    const photo = PRODUCT_PHOTOS[product.image];
    if (!photo) return productIcon(product, big);
    const size = big ? 220 : 54;
    const name = big ? escapeText(productName(product)) : "";
    const warning = escapeText(PHOTO_WARNING());
    return markup`
        <span class="img-wrap">
            <img class="product-photo${big ? " big" : ""}" src="${escapeText(photo)}" alt="${name}" data-icon="${escapeText(product.icon)}" width="${size}" height="${size}" loading="lazy" decoding="async">
            <span class="img-warn"${big ? ' tabindex="0"' : ""} role="img" aria-label="${warning}" data-tip="${warning}">!</span>
        </span>`;
}

// Una foto que no carga deja su lugar al ícono, sin aviso.
document.addEventListener(
    "error",
    (event) => {
        const photo = event.target;
        if (!photo.matches?.(".product-photo")) return;
        const icon = document.createElement("div");
        icon.className = `thumb${photo.classList.contains("big") ? " big" : ""}`;
        icon.style.background = "#3b4a6b";
        icon.innerHTML = `<i>${escapeText(photo.dataset.icon)}</i>`;
        photo.closest(".img-wrap").replaceWith(icon);
    },
    true
);

function inMarket(product) {
    return !product.market || product.market === market;
}

function openProduct(id) {
    const product = PRODUCTS[id];
    const set = DEMO.sets[product.set];
    const origin = set ? ["Set", `${set.name} · ${DEMO.setTypes[set.type]}`] : ["Marca", product.brand || "—"];
    const detail = product.detail ? t(product.detail) : "";
    const facts = [origin, ["Lanzamiento", releaseDate(product.released)], ["Contenido", detail]]
        .filter(([, value]) => value && value !== "—")
        .map(([label, value]) => `<div><span>${t(label)}</span>${escapeText(value)}</div>`)
        .join("");
    const photo = PRODUCT_PHOTOS[product.image] ? `<div class="pd-photo">${productThumb(product, true)}</div>` : "";
    byId("mb").innerHTML = markup`
        <div class="top">
            <div>
                <h2>${escapeText(productName(product))}</h2>
                ${productTag(product)}<span class="chip">${t(product.category)}</span>
            </div>
            ${closeButton("md")}
        </div>
        ${photo}
        <div class="facts" style="margin-bottom:10px">${facts}</div>
        <div class="wrap">
            <table>
                <thead>
                    <tr>
                        <th>${t("Vendedor")}</th>
                        <th>${t("Idioma")}</th>
                        <th>${t("Estado")}</th>
                        <th class="num">${t("Disp.")}</th>
                        <th class="num">${t("Precio")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="pt"></tbody>
            </table>
        </div>`;
    openDialog("p", id);
    renderProductOffers();
    byId("md").classList.add("on");
}

function renderProductOffers() {
    const id = Number(byId("md").dataset.id);
    const listings = inStock((listing) => listing.product === id).sort((a, b) => a.price - b.price);
    if (!listings.length) {
        byId("pt").innerHTML = `<tr><td colspan="6" class="empty">${t("Nadie lo tiene a la venta ahora.")}</td></tr>`;
        return;
    }
    byId("pt").innerHTML = listings
        .map(
            (listing) => markup`
                <tr>
                    <td>${sellerCell(listing)}</td>
                    <td>${languageName(listing.language)}</td>
                    <td>${NEW_CONDITION()}</td>
                    <td class="num">${listing.quantity}</td>
                    <td class="num price">${formatPrice(listing.price)}</td>
                    ${ADD_BUTTON(listing)}
                </tr>`
        )
        .join("");
}

// Novedades primero (por fecha de lanzamiento), luego por nombre.
function byReleaseThenName(a, b) {
    if (a.released !== b.released) return b.released < a.released ? -1 : 1;
    return a.name.localeCompare(b.name);
}

function renderProducts() {
    const categorySelect = byId("pc");
    // Producto sellado y accesorios, cada uno en su grupo.
    if (!categorySelect.options.length) {
        const groups = Object.entries(DEMO.productCategories)
            .map(([group, names]) => {
                const options = names.map((name) => `<option value="${name}">${t(name)}</option>`).join("");
                return `<optgroup label="${t(group)}">${options}</optgroup>`;
            })
            .join("");
        categorySelect.innerHTML = `<option value="">${t("Todas las categorías")}</option>${groups}`;
    }
    const search = byId("q").value.toLowerCase();
    const category = categorySelect.value;
    const products = PRODUCTS.filter(
        (product) =>
            inMarket(product) &&
            (!category || product.category === category) &&
            `${productName(product)} ${productOrigin(product)} ${t(product.detail || "")}`.toLowerCase().includes(search)
    ).sort(byReleaseThenName);
    byId("pcnt").textContent = `${products.length} productos`;
    if (!products.length) {
        byId("pl").innerHTML = `<tr><td colspan="5" class="empty">${t("Ningún producto coincide con esos filtros.")}</td></tr>`;
        return;
    }
    byId("pl").innerHTML = products
        .map((product) => {
            const offers = inStock((listing) => listing.product === product.id);
            const lowest = lowestPrice(offers);
            return markup`
                <tr class="row" tabindex="0" data-pd="${product.id}">
                    <td>
                        <div class="nm">
                            ${productThumb(product)}
                            <div>
                                <b>${escapeText(productName(product))}</b>
                                <small>${escapeText(productOrigin(product))}</small>
                            </div>
                        </div>
                    </td>
                    <td>${productTag(product)}<span class="chip">${t(product.category)}</span></td>
                    <td class="hide">${releaseDate(product.released)}</td>
                    <td class="num price">${lowest === null ? t("Sin stock") : formatPrice(lowest)}</td>
                    <td class="num hide">${offers.length}</td>
                </tr>`;
        })
        .join("");
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
            name: productName(product),
            tag: productTag(product),
            meta: t(product.category) + (listing.language ? ` · ${languageName(listing.language)}` : "")
        };
    }
    const card = CARDS[listing.card];
    const printing = card.printings[listing.printing];
    const condition = DEMO.conditions[listing.condition].code;
    return {
        name: card.name,
        tag: marketTag(card),
        meta: `${printing.code} · ${printing.rarity} · ${condition} · ${languageName(listing.language)}`
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
        toast(t("Solo hay {count} unidades de {seller}", { count: listing.quantity, seller: SELLERS[listing.seller].name }));
        return;
    }
    cart[id] = inCart + 1;
    updateCartCount();
    toast(t("{name} añadido al carrito", { name: listingName(listing) }));
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
    const header = `<div class="top"><h2>${t("Tu carrito")}</h2>${closeButton("cart")}</div>`;
    if (!keys.length) {
        const empty = t("Tu carrito está vacío. Abre una carta, un producto o el inventario de un vendedor y añade lo que prefieras.");
        byId("cbx").innerHTML = `${header}<div class="empty">${empty}</div>`;
        byId("cart").classList.add("on");
        return;
    }
    const rows = keys
        .map((key) => {
            const listing = LISTINGS[key];
            const line = cartLine(key);
            // En la ventana el idioma de un producto no se muestra, sí el vendedor.
            const meta = listing.card === null ? t(PRODUCTS[listing.product].category) : line.meta;
            return markup`
                <tr>
                    <td><b>${escapeText(line.name)}</b> ${line.tag}<small>${meta} · ${escapeText(SELLERS[listing.seller].name)}</small></td>
                    <td class="num">${cart[key]} × ${formatPrice(listing.price)}</td>
                    <td class="num"><button class="ghost" data-rm="${key}">${t("Quitar")}</button></td>
                </tr>`;
        })
        .join("");
    const totals = cartTotals();
    const sellers = totals.sellers.length;
    const shipping = t("Envío ({sellers}, gratis desde {free} por vendedor)", {
        sellers: t(sellers === 1 ? "{count} vendedor" : "{count} vendedores", { count: sellers }),
        free: formatPrice(SHIPPING.freeFrom)
    });
    const noHiddenFees = t(
        "El total ya incluye el envío de cada vendedor; no se suma ningún otro cargo. Los importes en otras monedas son conversiones aproximadas."
    );
    byId("cbx").innerHTML = markup`
        ${header}
        <table><tbody>${rows}</tbody></table>
        <div class="tot sm"><span>${t("Subtotal")}</span><span>${formatPrice(totals.sub)}</span></div>
        <div class="tot sm" style="padding-top:4px">
            <span>${shipping}</span>
            <span>${totals.ship ? formatPrice(totals.ship) : t("Gratis")}</span>
        </div>
        <div class="tot"><span>${t("Total")}</span><span>${formatPrice(totals.total)}</span></div>
        <small class="catalog-status">${noHiddenFees}</small>
        <p class="cart-actions">
            <button class="ghost" data-cart-expand>${t("Ampliar carrito")}</button>
            <button class="btn" data-buy="1">${t("Finalizar compra")}</button>
        </p>`;
    byId("cart").classList.add("on");
}

// Compra de demostración: descuenta el stock y vacía el carrito.
function checkout() {
    for (const key in cart) LISTINGS[key].quantity -= cart[key];
    emptyCart();
    updateCartCount();
    showTab();
    const note = t("Es una demo: no se ha cobrado nada, pero el stock de cada vendedor se ha actualizado.");
    byId("cbx").innerHTML = markup`
        <div class="top"><h2>${t("Pedido recibido")}</h2>${closeButton("cart")}</div>
        <div class="empty">${note}</div>`;
}

// ---------------------------------------------------------------------------
// Navegación: pestañas, mercado y moneda
// ---------------------------------------------------------------------------

function renderTabs() {
    byId("tabs").innerHTML = TABS.map(
        (name) => `<button aria-pressed="${name === tab}" data-g="${name}">${t(TAB_LABELS[name])}</button>`
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

// Las ventanas emergentes empiezan justo debajo de la cabecera; en el teléfono
// la cubren y empiezan arriba, para aprovechar la pantalla.
function alignDialogs() {
    const phone = window.matchMedia("(max-width: 640px)").matches;
    const offset = phone
        ? `calc(env(safe-area-inset-top, 0px) + ${DIALOG_GAP_PX}px)`
        : `${document.querySelector("header").getBoundingClientRect().bottom + DIALOG_GAP_PX}px`;
    byId("md").style.paddingTop = offset;
    byId("cart").style.paddingTop = offset;
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

// Opciones de moneda agrupadas (Mercosur, internacionales). También las usa
// "Personalización" (frontend/js/profile.js).
function currencyOptions(selected) {
    const groups = [...new Set(CURRENCIES.map((item) => item.group))];
    const option = (item) =>
        `<option value="${item.code}"${item.code === selected ? " selected" : ""}>${item.code} · ${t(item.name)}</option>`;
    return groups
        .map((group) => {
            const options = CURRENCIES.filter((item) => item.group === group).map(option).join("");
            return `<optgroup label="${t(group)}">${options}</optgroup>`;
        })
        .join("");
}

byId("cur").innerHTML = currencyOptions(currency);
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
    ["[data-cd-tab]", (button) => {
        const info = button.closest(".cd-info");
        for (const other of info.querySelectorAll("[data-cd-tab]"))
            other.setAttribute("aria-selected", other === button);
        for (const panel of info.querySelectorAll("[data-cd-panel]"))
            panel.hidden = panel.dataset.cdPanel !== button.dataset.cdTab;
    }],
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
// ---------------------------------------------------------------------------
// Foco en las ventanas emergentes (ficha y carrito)
// ---------------------------------------------------------------------------

// Al abrirse, el foco entra en la ventana; Tab no sale de ella mientras está
// abierta; al cerrarse, el foco vuelve a lo que la abrió.
const FOCUSABLE =
    'a[href], summary, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';
// Visible y alcanzable: también descarta lo que está dentro de un <details> cerrado.
const shown = (item) => (item.checkVisibility ? item.checkVisibility() : Boolean(item.offsetParent));
const openedFrom = new Map();
// Frames to wait for a list that is redrawn after closing (about one second).
const REFOCUS_FRAMES = 60;

// The catalogue list may be redrawn just after the card closes (the address
// goes back), replacing the row that opened it. For about a second, if focus
// falls to the page body, it moves to the new row of the same card.
function returnFocus(origin) {
    if (!origin) return;
    if (origin.isConnected) origin.focus({ preventScroll: true });
    const card = origin.dataset?.catalogCard;
    if (!card) return;
    let frames = REFOCUS_FRAMES;
    const watch = () => {
        const lost = document.activeElement === document.body || !document.activeElement;
        const twin = lost && document.querySelector(`[data-catalog-card="${CSS.escape(card)}"]`);
        if (twin) twin.focus({ preventScroll: true });
        if (--frames > 0) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
}

for (const id of ["md", "cart"]) {
    const dialog = byId(id);
    const box = dialog.querySelector(".box");
    box.tabIndex = -1;
    new MutationObserver(() => {
        const open = dialog.classList.contains("on");
        if (open && !openedFrom.has(id)) {
            openedFrom.set(id, document.activeElement);
            // The content is drawn right after the class changes.
            requestAnimationFrame(() => box.focus({ preventScroll: true }));
        } else if (!open && openedFrom.has(id)) {
            const origin = openedFrom.get(id);
            openedFrom.delete(id);
            returnFocus(origin);
        }
    }).observe(dialog, { attributes: true, attributeFilter: ["class"] });
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const dialog = ["cart", "md"].map(byId).find((element) => element.classList.contains("on"));
    if (!dialog) return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(shown);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
});
// La vista inicial la pinta catalog.js cuando carga sus módulos.
