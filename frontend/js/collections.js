// Sets and archetypes: their own page (/set/<id>, /arquetipo/<id>) and the
// banner of the latest set under the tabs.
//
// A set or archetype page is the catalogue list limited to it, with a header
// on top. A set page also shows the boxes and packs of that set the demo
// store sells, when there are any (frontend/demo).
import { escapeHtml } from "./html.js";
import { formatDate } from "./format.js";
import { readJson, writeJson } from "./storage.js";

const h = escapeHtml;
const PATH = /^\/(set|arquetipo)\/([0-9a-f-]{36})(?:\/|$)/i;
const KINDS = { set: "set", arquetipo: "archetype" };
const PATHS = { set: "set", archetype: "arquetipo" };
const DISMISSED_KEY = "cm_promo_closed";

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
    return `<a class="lk" href="/${PATHS[kind]}/${h(id)}" data-scope="${kind}" data-scope-id="${h(id)}">${h(
        label
    )}</a>`;
}

const comparable = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
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
    if (!products.length)
        return '<p class="catalog-status">Todavía no hay cajas ni sobres de este set a la venta. Aparecerán acá cuando los vendedores los publiquen.</p>';
    return `<div class="scope-products">${products
        .map(
            (product) =>
                `<button class="ghost" data-pd="${product.id}"><b>${h(product.name)}</b><small>${h(
                    product.category
                )} · tienda de demostración</small></button>`
        )
        .join("")}</div>`;
}

// Header of a set or archetype page; info is the API answer (null while loading).
export function scopeHeadHtml(scope, info) {
    if (!info) return '<div class="scope-head gl"><p class="catalog-status">Cargando…</p></div>';
    const close = '<button class="ghost" data-scope-clear>Ver todas las cartas</button>';
    if (scope.kind === "archetype")
        return `<div class="scope-head gl"><div><small>Arquetipo</small><h2>${h(info.name)}</h2><p>${
            info.card_count === 1 ? "1 carta" : `${info.card_count} cartas`
        } en el catálogo</p></div>${close}</div>`;
    const facts = [
        info.market,
        info.release_date ? `lanzado el ${formatDate(info.release_date)}` : "",
        info.product_type,
        info.card_count === 1 ? "1 carta en el catálogo" : `${info.card_count} cartas en el catálogo`
    ].filter(Boolean);
    return `<div class="scope-head gl"><div><small>Set</small><h2>${h(info.name)}</h2><p>${h(
        facts.join(" · ")
    )}</p></div>${close}</div><section class="scope-section"><h3>Cajas y sobres</h3>${productsHtml(
        info
    )}</section><h3 class="scope-section">Cartas sueltas</h3>`;
}

// ---- Banner of the latest set ------------------------------------------------

export function promoHtml(set) {
    if (!set) return "";
    if (readJson(DISMISSED_KEY, []).includes(set.id)) return "";
    return `<aside class="promo" aria-label="Último set lanzado"><a href="${scopePath({
        kind: "set",
        id: set.id
    })}" data-scope="set" data-scope-id="${h(set.id)}"><small>Último set ${h(set.market)}${
        set.release_date ? ` · ${h(formatDate(set.release_date))}` : ""
    }</small><b>${h(set.name)}</b><span>Cajas, sobres y ${
        set.card_count === 1 ? "1 carta suelta" : `${set.card_count} cartas sueltas`
    } →</span></a><button class="promo-close" data-promo-close="${h(
        set.id
    )}" aria-label="Ocultar este aviso">×</button></aside>`;
}

export function dismissPromo(id) {
    const closed = readJson(DISMISSED_KEY, []);
    writeJson(DISMISSED_KEY, [...new Set([...closed, id])].slice(-20));
}
