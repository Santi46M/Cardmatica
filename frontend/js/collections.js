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
