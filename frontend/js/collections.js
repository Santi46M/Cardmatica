// Sets and archetypes: their own page (/set/<id>, /arquetipo/<id>) and the
// banner of the latest set under the tabs.
//
// A set or archetype page is the catalogue list limited to it, with a header
// on top. A set page also shows the boxes and packs of that set the demo
// store sells, when there are any (frontend/demo).
import { escapeHtml, html } from "./html.js";
import { formatDate } from "./format.js";
import { t } from "./lang.js";

const h = escapeHtml;
const PATH = /^\/(set|arquetipo)\/([0-9a-f-]{36})(?:\/|$)/i;
const KINDS = { set: "set", arquetipo: "archetype" };
const PATHS = { set: "set", archetype: "arquetipo" };

export function scopeFromPath(pathname) {
    const match = pathname.match(PATH);
    return match ? { kind: KINDS[match[1].toLowerCase()], id: match[2].toLowerCase() } : null;
}

export const scopePath = (scope) => `/${PATHS[scope.kind]}/${scope.id}`;

export function scopeParams(scope) {
    if (!scope) return {};
    return scope.kind === "set" ? { set_id: scope.id } : { archetype_id: scope.id };
}

// The API answer that describes the set or archetype.
export const scopeInfoPath = (scope) => `${scope.kind === "set" ? "sets" : "archetypes"}/${scope.id}`;

// An anchor that opens a set or archetype page (catalog.js handles the click).
export function scopeLink(kind, id, label) {
    return `<a class="lk" href="/${PATHS[kind]}/${h(id)}" data-scope="${kind}" data-scope-id="${h(id)}">${h(label)}</a>`;
}

const comparable = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "") // accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

// Boxes and packs of the demo store printed for this set, by the set's name.
function demoProducts(set) {
    const { PRODUCTS: products = [], DEMO: demo } = window;
    return products.filter(
        (product) =>
            product.set &&
            product.market === set.market &&
            comparable(demo.sets[product.set].name) === comparable(set.name)
    );
}

function productsHtml(set) {
    const products = demoProducts(set);
    if (!products.length) {
        const none = t("Todavía no hay cajas ni sobres de este set a la venta. Aparecerán acá cuando los vendedores los publiquen.");
        return `<p class="catalog-status">${none}</p>`;
    }
    const buttons = products
        .map(
            (product) => html`
                <button class="ghost" data-pd="${product.id}">
                    <b>${h(window.productName(product))}</b>
                    <small>${h(t(product.category))} · ${t("tienda de demostración")}</small>
                </button>`
        )
        .join("");
    return `<div class="scope-products">${buttons}</div>`;
}

// Header of a set or archetype page; info is the API answer (null while loading).
export function scopeHeadHtml(scope, info) {
    if (!info) return `<div class="scope-head gl"><p class="catalog-status">${t("Cargando…")}</p></div>`;
    const close = `<button class="ghost" data-scope-clear>${t("Ver todas las cartas")}</button>`;
    const inCatalogue = t(info.card_count === 1 ? "{count} carta en el catálogo" : "{count} cartas en el catálogo", {
        count: info.card_count
    });
    const head = (kind, line) => html`
        <div class="scope-head gl">
            <div>
                <small>${t(kind)}</small>
                <h2>${h(info.name)}</h2>
                <p>${h(line)}</p>
            </div>
            ${close}
        </div>`;
    if (scope.kind === "archetype") return head("Arquetipo", inCatalogue);
    const facts = [
        info.market,
        info.release_date ? t("lanzado el {date}", { date: formatDate(info.release_date) }) : "",
        info.product_type,
        inCatalogue
    ].filter(Boolean);
    return html`
        ${head("Set", facts.join(" · "))}
        <section class="scope-section">
            <h3>${t("Cajas y sobres")}</h3>
            ${productsHtml(info)}
        </section>
        <h3 class="scope-section">${t("Cartas sueltas")}</h3>`;
}

// ---- Banner of the latest set ------------------------------------------------

// Its photo comes from the set's official page, only in the private test view
// with images on (frontend/demo/store.js loads PRODUCT_PHOTOS); elsewhere the
// banner shows the same text over the site's colours.
const PHOTO_WARNING = () =>
    t("Foto provisional de la página oficial, sin licencia: visible solo en la vista de prueba privada. No publicar.");

function setPhoto(set) {
    return set.code ? window.PRODUCT_PHOTOS?.[set.code.toLowerCase()] : null;
}

export function promoHtml(set) {
    if (!set) return "";
    const photo = setPhoto(set);
    const released = set.release_date ? ` · ${h(formatDate(set.release_date))}` : "";
    const contents = t(
        set.card_count === 1 ? "Cajas, sobres y {count} carta suelta" : "Cajas, sobres y {count} cartas sueltas",
        { count: set.card_count }
    );
    const warning = h(PHOTO_WARNING());
    // The same picture twice: faint and blurred behind, clear on the right.
    const background = photo ? `<img class="promo-bg" src="${h(photo)}" alt="" aria-hidden="true">` : "";
    const art = photo
        ? html`
            <span class="img-wrap promo-art">
                <img src="${h(photo)}" alt="${h(set.name)}" width="300" height="300" decoding="async">
                <span class="img-warn" tabindex="0" role="img" aria-label="${warning}" data-tip="${warning}">!</span>
            </span>`
        : "";
    return html`
        <section class="promo${photo ? " with-photo" : ""}" aria-label="${t("Último set lanzado")}">
            ${background}
            <div class="promo-body">
                <small>${h(t("Último set {market}", { market: set.market }))}${released}</small>
                <h2>${h(set.name)}</h2>
                <p>${h(contents)}</p>
                <p class="promo-actions">
                    <a class="btn" href="${scopePath({ kind: "set", id: set.id })}" data-scope="set" data-scope-id="${h(set.id)}">${t("Ver el set")}</a>
                    <button class="ghost" data-go="Productos">${t("Cajas y accesorios")}</button>
                </p>
            </div>
            ${art}
        </section>`;
}
