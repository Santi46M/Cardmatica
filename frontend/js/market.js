// Real offers on Cardmática: what sellers put on sale from "Mi stock"
// (stock.js), read from /api/v1/listings (backend/app/api/listings.py).
//
// They show in three places: under each card of the catalogue, in the
// "Vendedores" tab above the demo stores, and in each seller's window. Prices
// are kept in the seller's currency and shown in the visitor's, with the same
// exchange rates as the rest of the storefront (frontend/demo/data.js).
// Buying them comes with orders; until then they are shown, not sold.
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";
import { request } from "./session-api.js";
import { finishName } from "./catalog-view.js";
import { toEuro } from "./format.js";
import { rarityBadge } from "./rarities.js";

const h = escapeHtml;
export const LISTINGS = "/api/v1/listings";
// Offers asked for in the last half minute are not asked for again.
const FRESH_MS = 30_000;
const cache = new Map();

export async function offers(params) {
    const query = new URLSearchParams(params).toString();
    const kept = cache.get(query);
    if (kept && Date.now() - kept.at < FRESH_MS) return kept.rows;
    const rows = await request(`${LISTINGS}?${query}`);
    cache.set(query, { at: Date.now(), rows });
    return rows;
}

// After a seller changes their stock, everyone's lists are asked for again.
export function forgetOffers() {
    cache.clear();
}

// Prices compare and add up in euros, the storefront's base (format.js).
const inEuros = (listing) => toEuro(listing.price, listing.currency) ?? Number(listing.price);

// A seller's stock in figures: items, units, value in euros, items with a photo.
export function stockTotals(rows) {
    const totals = { items: rows.length, units: 0, value: 0, photos: 0 };
    for (const listing of rows) {
        totals.units += listing.quantity;
        totals.value += listing.quantity * inEuros(listing);
        if (listing.photo_url) totals.photos += 1;
    }
    return totals;
}

export const priceHtml = (listing) => window.formatPrice(inEuros(listing));

export function conditionHtml(code) {
    const condition = window.DEMO.conditions.find((item) => item.code === code);
    return `<span class="cond" style="background:${condition.color}" title="${h(t(condition.name))}">${code}</span>`;
}

export const languageText = (code) => (window.DEMO.languages[code] ? t(window.DEMO.languages[code].name) : code);

// "Foil", "Reverse"...: the finish, when the printing has more than one.
export const finishText = (finish) => (finish ? ` · ${h(finishName(finish))}` : "");

// The seller's photo of the copy: small here, whole in a new tab.
export function photoThumb(listing) {
    if (!listing.photo_url) return "";
    const label = t("Foto del vendedor");
    return `<a class="photo-thumb" href="${h(listing.photo_url)}" target="_blank" rel="noopener" title="${label}"><img src="${h(listing.photo_url)}" alt="${label}" width="34" height="46" loading="lazy" decoding="async"></a>`;
}

// A flag only for a seller who said their country (the demo ones always have).
const flagHtml = (country) => (country && window.DEMO.flags[country] ? window.flag(country) : "");

const sellerHtml = (seller) =>
    `${flagHtml(seller.country)}<button class="lk" data-real-seller="${h(seller.id)}">${h(seller.name)}</button>`;

// ---- Under a card: its offers, the shown printing's first -------------------

function cardOfferRow(listing) {
    const comment = listing.comment ? `<small>${h(listing.comment)}</small>` : "";
    return html`
        <tr>
            <td>${sellerHtml(listing.seller)}<small>${t("Desde {year}", { year: listing.seller.since })}</small></td>
            <td>
                <div class="st-card">
                    ${photoThumb(listing)}
                    <div>
                        <b>${h(listing.code)}</b> ${conditionHtml(listing.condition)} ${languageText(listing.language)}${finishText(listing.finish)}
                        <small>${rarityBadge(listing, listing.game)} ${h(listing.set_name)}</small>
                        ${comment}
                    </div>
                </div>
            </td>
            <td class="num price">${priceHtml(listing)}<small>${t("{count} disp.", { count: listing.quantity })}</small></td>
        </tr>`;
}

let shownCard = null;

export async function fillCardOffers(cardId, printingId) {
    shownCard = { cardId, printingId };
    const body = document.querySelector("#mb .cd-offers tbody");
    if (!body) return;
    let rows;
    try {
        rows = await offers({ card_id: cardId });
    } catch {
        return;
    }
    if (shownCard?.cardId !== cardId || !document.contains(body) || !rows.length) return;
    const first = (listing) => (listing.printing_id === printingId ? 0 : 1);
    rows = [...rows].sort((a, b) => first(a) - first(b) || inEuros(a) - inEuros(b));
    body.innerHTML = rows.map(cardOfferRow).join("");
}

// ---- The "Vendedores" tab: real sellers above the demo stores ----------------

function sellersOf(rows) {
    const sellers = new Map();
    for (const listing of rows) {
        const entry = sellers.get(listing.seller.id) || { ...listing.seller, listings: 0, units: 0, value: 0 };
        entry.listings += 1;
        entry.units += listing.quantity;
        entry.value += listing.quantity * inEuros(listing);
        sellers.set(listing.seller.id, entry);
    }
    return [...sellers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sellerRow(seller) {
    return html`
        <tr class="row real-seller" tabindex="0" data-real-seller="${h(seller.id)}">
            <td>
                ${flagHtml(seller.country)}<b class="lk">${h(seller.name)}</b>
                <small>${t("Desde {year}", { year: seller.since })} · <span class="real-tag">${t("Vendedor real")}</span></small>
            </td>
            <td class="hide">${seller.country ? t(seller.country) : "—"}</td>
            <td title="${t("Todavía sin valoraciones")}">${t("Nuevo")}</td>
            <td class="num hide">${seller.listings}</td>
            <td class="num hide">${seller.units}</td>
            <td class="num price">${window.formatPrice(seller.value)}</td>
        </tr>`;
}

export async function addRealSellers(list) {
    const game = window.game;
    let rows;
    try {
        rows = await offers({ game });
    } catch {
        return;
    }
    if (window.tab !== "Vendedores" || window.game !== game) return;
    list.querySelectorAll(".real-seller").forEach((row) => row.remove());
    list.insertAdjacentHTML("afterbegin", sellersOf(rows).map(sellerRow).join(""));
}

// ---- One seller's window -----------------------------------------------------

function inventoryRow(listing) {
    return html`
        <tr>
            <td>
                <div class="st-card">
                    ${photoThumb(listing)}
                    <div>
                        <button class="lk" data-catalog-card="${h(listing.card_id)}">${h(listing.card_name)}</button>
                        ${listing.comment ? `<small>${h(listing.comment)}</small>` : ""}
                    </div>
                </div>
            </td>
            <td><b>${h(listing.code)}</b><small>${rarityBadge(listing, listing.game)} ${h(listing.set_name)}</small></td>
            <td>${conditionHtml(listing.condition)} <span class="lang">${languageText(listing.language)}${finishText(listing.finish)}</span></td>
            <td class="num" data-label="${t("Disp.")}">${listing.quantity}</td>
            <td class="num price">${priceHtml(listing)}</td>
        </tr>`;
}

let openSeller = null;

export async function openRealSeller(id) {
    openSeller = id;
    const dialog = document.getElementById("md");
    dialog.dataset.mode = "real-seller";
    dialog.dataset.id = id;
    const box = document.getElementById("mb");
    box.innerHTML = `<div class="top"><h2>${t("Cargando…")}</h2><button class="ghost" data-close="md">${t("Cerrar")}</button></div>`;
    window.alignDialogs();
    dialog.classList.add("on");
    let rows;
    try {
        rows = await offers({ seller_id: id, game: window.game });
    } catch (error) {
        box.querySelector("h2").textContent = error.message;
        return;
    }
    if (openSeller !== id || dialog.dataset.mode !== "real-seller") return;
    const [seller] = sellersOf(rows);
    if (!seller) {
        box.querySelector("h2").textContent = t("Este vendedor no tiene artículos con esos filtros.");
        return;
    }
    box.innerHTML = html`
        <div class="top">
            <div>
                <h2>${flagHtml(seller.country)}${h(seller.name)}</h2>
                <small>${seller.country ? `${t(seller.country)} · ` : ""}${t("vendedor desde {year}", { year: seller.since })}</small>
            </div>
            <button class="ghost" data-close="md">${t("Cerrar")}</button>
        </div>
        <div class="facts" style="margin-bottom:10px">
            <div><span>${t("Artículos")}</span>${seller.listings}</div>
            <div><span>${t("Unidades en stock")}</span>${seller.units}</div>
            <div><span>${t("Valor del inventario")}</span><b>${window.formatPrice(seller.value)}</b></div>
        </div>
        <p class="catalog-status">${t("Las ofertas de vendedores reales se podrán comprar cuando lleguen los pedidos.")}</p>
        <div class="wrap">
            <table class="stack">
                <thead>
                    <tr>
                        <th>${t("Carta")}</th>
                        <th>${t("Impresión")}</th>
                        <th>${t("Estado e idioma")}</th>
                        <th class="num">${t("Disp.")}</th>
                        <th class="num">${t("Precio")}</th>
                    </tr>
                </thead>
                <tbody>${rows.map(inventoryRow).join("")}</tbody>
            </table>
        </div>`;
}

export function installMarket() {
    // The demo store draws its sellers; the real ones go on top.
    const drawSellers = window.renderSellers;
    window.renderSellers = function (...args) {
        drawSellers(...args);
        addRealSellers(document.getElementById("vl"));
    };
    // A new currency redraws the prices of what is open.
    const refreshPrices = window.refreshPrices;
    window.refreshPrices = function (...args) {
        refreshPrices(...args);
        const dialog = document.getElementById("md");
        if (!dialog.classList.contains("on")) return;
        if (dialog.dataset.mode === "real-seller") openRealSeller(dialog.dataset.id);
        if (dialog.dataset.mode === "catalog" && shownCard) fillCardOffers(shownCard.cardId, shownCard.printingId);
    };
    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-real-seller]");
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openRealSeller(target.dataset.realSeller);
    }, true);
    document.addEventListener("keydown", (event) => {
        const row = event.target.closest?.("tr[data-real-seller]");
        if (row && event.key === "Enter") openRealSeller(row.dataset.realSeller);
    });
}
