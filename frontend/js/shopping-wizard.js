// Asistente de compra, como el Shopping Wizard de Cardmarket: con las cartas de
// una lista de deseados arma la compra por vendedor, con una de dos prioridades:
//   «Menos envíos»  pocos vendedores, aunque cueste algo más
//   «Menor precio»  el total más bajo, contando el envío de cada vendedor
// Se calculan las dos para poder compararlas. Como en Cardmarket, el resultado
// es una buena propuesta, no siempre la óptima.
//
// Las ofertas son hoy las de la tienda de demostración (frontend/demo/store.js);
// cuando haya publicaciones reales solo cambia demoCandidates.
import { escapeHtml, html } from "./html.js";
import { locale, t } from "./lang.js";
import { readJson, writeJson } from "./storage.js";

const h = escapeHtml;
const OPTIONS_KEY = "cm_wizard";
const DEFAULT_OPTIONS = { priority: "shipments", condition: 6, country: "", rating: 0 };
const PRIORITIES = { shipments: "Menos envíos", price: "Menor precio" };
// Cents never decide between two plans.
const EPSILON = 0.005;

// ---- Plan ------------------------------------------------------------------
// candidates: [{ want: { id, name, quantity }, offers: [{ id, seller, price, available }], reason }]
// shipping:   { perSeller, freeFrom } in euros, per seller.

const shippingCost = (subtotal, shipping) => (subtotal >= shipping.freeFrom ? 0 : shipping.perSeller);
const units = (lines) => lines.reduce((sum, line) => sum + line.units, 0);
const sellersIn = (lines) => new Set(lines.map((line) => line.offer.seller));

function subtotals(lines) {
    const totals = new Map();
    for (const line of lines)
        totals.set(line.offer.seller, (totals.get(line.offer.seller) || 0) + line.offer.price * line.units);
    return totals;
}

function totalCost(lines, shipping) {
    let total = 0;
    for (const subtotal of subtotals(lines).values()) total += subtotal + shippingCost(subtotal, shipping);
    return total;
}

// Each want from the cheapest offers of the allowed sellers (all when null).
// An offer can match two wants; its units are shared between them.
function fill(candidates, allowed) {
    const left = new Map();
    const lines = [];
    for (const { want, offers } of candidates) {
        let needed = want.quantity;
        for (const offer of [...offers].sort((a, b) => a.price - b.price)) {
            if (!needed) break;
            if (allowed && !allowed.has(offer.seller)) continue;
            const available = left.get(offer.id) ?? offer.available;
            const taken = Math.min(needed, available);
            if (!taken) continue;
            left.set(offer.id, available - taken);
            lines.push({ want, offer, units: taken });
            needed -= taken;
        }
    }
    return lines;
}

// Sellers one by one, each time the one that covers the most missing copies
// (the cheaper one on a tie), until nothing else can be found; then any seller
// the others already cover is dropped.
function fewestShipments(candidates, shipping) {
    const reachable = units(fill(candidates, null));
    const everyone = new Set(candidates.flatMap(({ offers }) => offers.map((offer) => offer.seller)));
    const chosen = new Set();
    let covered = 0;
    while (covered < reachable) {
        let best = null;
        for (const seller of everyone) {
            if (chosen.has(seller)) continue;
            const lines = fill(candidates, new Set([...chosen, seller]));
            const found = units(lines);
            const cost = totalCost(lines, shipping);
            if (found > covered && (!best || found > best.found || (found === best.found && cost < best.cost)))
                best = { seller, found, cost };
        }
        if (!best) break;
        chosen.add(best.seller);
        covered = best.found;
    }
    for (const seller of [...chosen]) {
        const rest = new Set(chosen);
        rest.delete(seller);
        if (units(fill(candidates, rest)) === covered) chosen.delete(seller);
    }
    return fill(candidates, chosen);
}

// Starts from the better of "every seller" and the fewest-shipments plan, then
// adds or drops one seller at a time while the real total (with each seller's
// shipping, free above its threshold) goes down. Never misses a card the other
// plan finds, and never costs more than it.
function cheapest(candidates, shipping) {
    const reachable = units(fill(candidates, null));
    const cost = (sellers) => {
        const lines = fill(candidates, sellers);
        return units(lines) === reachable ? totalCost(lines, shipping) : Infinity;
    };
    const everyone = new Set(candidates.flatMap(({ offers }) => offers.map((offer) => offer.seller)));
    let best = sellersIn(fill(candidates, null));
    const fewest = sellersIn(fewestShipments(candidates, shipping));
    if (cost(fewest) < cost(best)) best = fewest;
    let bestCost = cost(best);
    for (let improved = true; improved; ) {
        improved = false;
        for (const seller of everyone) {
            const trial = new Set(best);
            if (trial.has(seller)) trial.delete(seller);
            else trial.add(seller);
            const trialCost = cost(trial);
            if (trialCost < bestCost - EPSILON) {
                best = trial;
                bestCost = trialCost;
                improved = true;
            }
        }
    }
    return fill(candidates, best);
}

export function planPurchase(candidates, { priority = "shipments", shipping }) {
    const lines = priority === "price" ? cheapest(candidates, shipping) : fewestShipments(candidates, shipping);
    const totals = subtotals(lines);
    const sellers = [...totals]
        .map(([seller, subtotal]) => ({
            seller,
            lines: lines.filter((line) => line.offer.seller === seller),
            subtotal,
            shipping: shippingCost(subtotal, shipping)
        }))
        .sort((a, b) => b.subtotal - a.subtotal);
    const missing = candidates
        .map(({ want, reason }) => {
            const found = units(lines.filter((line) => line.want === want));
            const left = want.quantity - found;
            if (!left) return null;
            return { want, units: left, reason: found ? `Solo se encontraron ${found} de ${want.quantity}` : reason };
        })
        .filter(Boolean);
    const cards = sellers.reduce((sum, group) => sum + group.subtotal, 0);
    const delivery = sellers.reduce((sum, group) => sum + group.shipping, 0);
    return {
        priority,
        sellers,
        missing,
        found: units(lines),
        wanted: candidates.reduce((sum, { want }) => sum + want.quantity, 0),
        cards,
        shipping: delivery,
        total: cards + delivery
    };
}

// ---- Offers of the demo store ------------------------------------------------

const comparable = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

// A list entry asks for a card (and maybe a printing and a language) in one
// market. The demo store names its cards in English, as the catalogue does.
function demoCandidates(items, { condition, country, rating }) {
    const { CARDS: cards, LISTINGS: listings, SELLERS: sellers, cart = {} } = window;
    return items.map((item) => {
        const want = { id: item.id, name: item.name, quantity: item.quantity, code: item.code, rarity: item.rarity };
        const ids = new Set(
            cards.filter((card) => card.market === item.market && comparable(card.name) === comparable(item.name)).map((card) => card.id)
        );
        if (!ids.size) return { want, offers: [], reason: "La tienda de demostración no tiene esta carta" };
        const inStock = listings.filter((listing) => ids.has(listing.card) && listing.quantity > 0);
        if (!inStock.length) return { want, offers: [], reason: "Nadie la tiene a la venta ahora" };
        const asked = inStock.filter((listing) => {
            const printing = cards[listing.card].printings[listing.printing];
            return (
                (!item.code || printing.code.toLowerCase() === item.code.toLowerCase()) &&
                (!item.language || listing.language === item.language)
            );
        });
        if (!asked.length) return { want, offers: [], reason: "Nadie vende esa impresión o ese idioma" };
        const offers = asked
            .filter((listing) => {
                const seller = sellers[listing.seller];
                return (
                    listing.condition <= condition &&
                    (!country || seller.country === country) &&
                    Number(seller.rating) >= rating
                );
            })
            .map((listing) => ({
                id: listing.id,
                seller: listing.seller,
                price: listing.price,
                // What is already in the cart is not offered twice.
                available: listing.quantity - (cart[listing.id] || 0),
                condition: listing.condition,
                language: listing.language,
                printing: cards[listing.card].printings[listing.printing]
            }))
            .filter((offer) => offer.available > 0);
        return {
            want,
            offers,
            reason: offers.length ? "" : "Ninguna oferta cumple el estado, el país o la valoración elegidos"
        };
    });
}

// ---- Interface -------------------------------------------------------------

let options = { ...DEFAULT_OPTIONS, ...readJson(OPTIONS_KEY, {}) };
let plans = null;
// The list (and its quantities) the plans were made for; any change outdates them.
let plannedFor = "";
const signature = (list) => `${list.id}|${list.items.map((item) => `${item.id}:${item.quantity}`).join(",")}`;

const price = (euros) => window.formatPrice?.(euros) ?? `${euros.toFixed(2)} €`;
const condition = (index) => window.DEMO?.conditions[index]?.code || "";
const languageName = (code) => (window.DEMO?.languages[code] ? t(window.DEMO.languages[code].name) : code);

function optionsHtml() {
    const select = (id, label, entries, current) => {
        const choices = entries
            .map(([value, text]) => `<option value="${h(value)}"${String(value) === String(current) ? " selected" : ""}>${h(t(text))}</option>`)
            .join("");
        return `<label>${t(label)}<select id="${id}">${choices}</select></label>`;
    };
    const conditions = [
        [6, "Cualquier estado"],
        ...(window.DEMO?.conditions || [])
            .slice(0, -1)
            .map((item, index) => [index, `${t(item.name)} (${item.code})${index ? ` ${t("o mejor")}` : ""}`])
    ];
    const countries = [...new Set((window.SELLERS || []).map((seller) => seller.country))].sort((a, b) =>
        t(a).localeCompare(t(b), locale)
    );
    const ratings = [
        [0, "Cualquiera"],
        [4.5, "4,5 ★ o más"],
        [4.8, "4,8 ★ o más"]
    ];
    const priorities = Object.entries(PRIORITIES)
        .map(
            ([value, label]) =>
                `<button type="button" role="radio" aria-checked="${options.priority === value}" data-wz-priority="${value}">${t(label)}</button>`
        )
        .join("");
    return html`
        <div class="wz-options">
            <div class="seg" role="radiogroup" aria-label="${t("Prioridad")}">${priorities}</div>
            ${select("wz-condition", "Estado mínimo", conditions, options.condition)}
            ${select("wz-country", "País del vendedor", [["", "Todo el Mercosur"], ...countries.map((name) => [name, name])], options.country)}
            ${select("wz-rating", "Valoración mínima (ficticia)", ratings, options.rating)}
            <button class="btn" type="button" data-wz-run>${t("Armar compra")}</button>
        </div>`;
}

function lineHtml(line) {
    const offer = line.offer;
    const detail = [offer.printing.code, offer.printing.rarity, condition(offer.condition), languageName(offer.language)].join(" · ");
    return html`
        <tr>
            <td><b>${h(line.want.name)}</b><small>${h(detail)}</small></td>
            <td class="num">${line.units} × ${h(price(offer.price))}</td>
        </tr>`;
}

function sellerHtml(group) {
    const seller = window.SELLERS[group.seller];
    const shipping = group.shipping ? t("Envío {price}", { price: price(group.shipping) }) : t("Envío gratis");
    return html`
        <article class="wz-seller">
            <header>
                <span>${window.flag?.(seller.country) || ""} <b>${h(seller.name)}</b> <small>★ ${h(seller.rating)} · ${h(t(seller.country))}</small></span>
                <button class="ghost" type="button" data-wz-cart="${group.seller}">${t("Añadir al carrito")}</button>
            </header>
            <table>${group.lines.map(lineHtml).join("")}</table>
            <footer>
                <span>${h(t("Cartas {price}", { price: price(group.subtotal) }))}</span>
                <span>${h(shipping)}</span>
                <b>${h(price(group.subtotal + group.shipping))}</b>
            </footer>
        </article>`;
}

const shipmentsText = (count) => t(count === 1 ? "{count} envío" : "{count} envíos", { count });

// How the other priority would have turned out, when it differs.
function comparisonHtml(plan, other) {
    if (Math.abs(other.total - plan.total) <= EPSILON && other.sellers.length === plan.sellers.length) return "";
    const summary = t("Con «{priority}»: {shipments} · {total}", {
        priority: t(PRIORITIES[other.priority]),
        shipments: shipmentsText(other.sellers.length),
        total: price(other.total)
    });
    const found = other.found !== plan.found ? ` · ${h(t("{count} cartas", { count: other.found }))}` : "";
    return `<small>${h(summary)}${found}.</small>`;
}

function resultHtml() {
    if (!plans) return "";
    const plan = plans[options.priority];
    const other = plans[options.priority === "price" ? "shipments" : "price"];
    if (!plan.found)
        return `<p class="empty">${t("No se encontró ninguna carta de esta lista con estos filtros.")}</p>${missingHtml(plan)}`;
    const compare = comparisonHtml(plan, other);
    const found = t("{found} de {wanted} cartas", { found: plan.found, wanted: plan.wanted });
    const totals = t("en {shipments} · cartas {cards} · envío {shipping}", {
        shipments: shipmentsText(plan.sellers.length),
        cards: price(plan.cards),
        shipping: price(plan.shipping)
    });
    const demo = t(
        "Ofertas de la tienda de demostración: vendedores, precios y stock son ilustrativos. Envío por vendedor de {shipping}, gratis desde {free}. La demo no distingue ediciones.",
        { shipping: price(window.SHIPPING.perSeller), free: price(window.SHIPPING.freeFrom) }
    );
    return html`
        <div class="wz-summary" role="status">
            <div>
                <b>${h(found)}</b> ${h(totals)} · <b>${h(t("total {total}", { total: price(plan.total) }))}</b>${compare ? `<br>${compare}` : ""}
            </div>
            <button class="btn" type="button" data-wz-cart="all">${t("Añadir todo al carrito")}</button>
        </div>
        ${plan.sellers.map(sellerHtml).join("")}
        ${missingHtml(plan)}
        <small class="catalog-status">${h(demo)}</small>`;
}

function missingHtml(plan) {
    if (!plan.missing.length) return "";
    const items = plan.missing
        .map(({ want, units: left, reason }) => {
            const code = want.code ? ` · ${h(want.code)}` : "";
            return `<li><b>${h(want.name)}</b>${code} · ${h(t("faltan {count}", { count: left }))}<small>${h(t(reason))}</small></li>`;
        })
        .join("");
    const title = t("No encontradas ({count})", { count: plan.missing.length });
    return `<details class="wz-missing"${plan.found ? "" : " open"}><summary>${title}</summary><ul>${items}</ul></details>`;
}

// The section inside the list of deseados; empty lists have nothing to buy.
export function wizardHtml(list) {
    if (!list?.items.length) return "";
    if (signature(list) !== plannedFor) plans = null;
    const intro = t("Arma la compra de «{list}» entre los vendedores: con menos envíos o al menor precio.", { list: list.name });
    return html`
        <section class="gl pnl wz" id="wl-wizard">
            <div class="wz-head">
                <b>${t("Asistente de compra")}</b>
                <small>${h(intro)}</small>
            </div>
            ${optionsHtml()}
            <div id="wz-result">${resultHtml()}</div>
        </section>`;
}

function readOptions() {
    const value = (id) => document.getElementById(id)?.value;
    options = {
        ...options,
        condition: Number(value("wz-condition") ?? options.condition),
        country: value("wz-country") ?? options.country,
        rating: Number(value("wz-rating") ?? options.rating)
    };
    writeJson(OPTIONS_KEY, options);
}

function run(list) {
    readOptions();
    const candidates = demoCandidates(list.items, options);
    plannedFor = signature(list);
    plans = {
        shipments: planPurchase(candidates, { priority: "shipments", shipping: window.SHIPPING }),
        price: planPurchase(candidates, { priority: "price", shipping: window.SHIPPING })
    };
}

function addToCart(plan, seller) {
    let added = 0;
    for (const group of plan.sellers) {
        if (seller !== "all" && group.seller !== Number(seller)) continue;
        for (const line of group.lines) {
            window.cart[line.offer.id] = (window.cart[line.offer.id] || 0) + line.units;
            added += line.units;
        }
    }
    window.updateCartCount?.();
    window.toast?.(
        t(added === 1 ? "{count} carta añadida al carrito" : "{count} cartas añadidas al carrito", { count: added })
    );
}

// currentList: the list on screen (wantlists.js).
export function installShoppingWizard({ currentList }) {
    const redraw = () => {
        const slot = document.getElementById("wz-result");
        if (slot) slot.innerHTML = resultHtml();
    };
    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-wz-run], [data-wz-priority], [data-wz-cart]");
        if (!target || !document.getElementById("wl-wizard")?.contains(target)) return;
        const list = currentList();
        if (!list) return;
        if (target.dataset.wzPriority) {
            options.priority = target.dataset.wzPriority;
            for (const button of document.querySelectorAll("[data-wz-priority]"))
                button.setAttribute("aria-checked", String(button === target));
            readOptions();
        } else if (target.hasAttribute("data-wz-run")) run(list);
        else if (target.dataset.wzCart && plans) {
            addToCart(plans[options.priority], target.dataset.wzCart);
            // The cart now holds those copies: the plan is drawn again without them.
            run(list);
        }
        redraw();
    });
    // A new list, or a changed filter, makes the last plan outdated.
    document.addEventListener("change", (event) => {
        if (["wz-condition", "wz-country", "wz-rating"].includes(event.target.id)) {
            readOptions();
            plans = null;
            redraw();
        }
        if (event.target.id === "cur") redraw();
    });
}
