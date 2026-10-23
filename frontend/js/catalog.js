import { CatalogApi } from "./api.js";
import { homeBanlistHtml, startCountdowns } from "./banlist.js";
import { installCart, renderCart } from "./cart-page.js";
import { catalogRows, detailHtml, escapeHtml, homeHtml, pager } from "./catalog-view.js";
import { priceChartHtml } from "./price-chart.js";
import { installProfile, renderProfile } from "./profile.js";
import { installWantlists, renderWantlists } from "./wantlists.js";

const api = new CatalogApi();
const h = escapeHtml;
const element = (id) => document.getElementById(id);
const commerceList = window.list;
const commerceInit = window.init;
let page = 1;
let generation = 0;
let detailGeneration = 0;
let controller;
let timer;
let facets;
let detail;
let printingPage;
let selectedPrinting = "";
let priceHistory;
let chartDays = 365;
const cardTypes = { Monstruo: "Monster", Magia: "Spell", Trampa: "Trap" };
const isCommerce = () => ["Productos", "Vendedores"].includes(window.tab);
// Panels stored in this browser only; they never query the catalogue list.
const localPanels = { Wantlists: "wlv", Perfil: "pfv", Carrito: "cartv" };
const renderLocal = { Wantlists: renderWantlists, Perfil: renderProfile, Carrito: renderCart };
const isLocal = () => window.tab in localPanels;
const pagination = document.createElement("div");
pagination.id = "catalog-pagination";
element("cat").append(pagination);

function status(message) {
    element("catalog-status").textContent = message;
}

async function loadFacets() {
    if (facets) return;
    facets = await api.get("facets");
    for (const [id, items, label] of [
        ["sub", facets.subtypes, "Todos los subtipos"],
        ["rar", facets.rarities, "Todas las rarezas"],
        ["stp", facets.product_types, "Cualquier origen"]
    ]) {
        const select = element(id);
        const previous = select.value;
        select.innerHTML =
            `<option value="">${label}</option>` +
            items.map((value) => `<option value="${h(value)}">${h(value)}</option>`).join("");
        select.value = items.includes(previous) ? previous : "";
    }
}

function renderDetail() {
    element("mb").innerHTML = detailHtml(detail, printingPage, selectedPrinting, {
        market: window.mk
    });
    renderChart();
}

function renderChart() {
    const slot = element("price-history");
    if (!slot) return;
    slot.innerHTML = priceChartHtml(priceHistory, { printingId: selectedPrinting, days: chartDays });
}

async function loadHomeBanlist() {
    const slot = element("home-banlist");
    if (!slot) return;
    try {
        slot.innerHTML = homeBanlistHtml(await api.get("banlists"), window.mk);
        startCountdowns();
    } catch (error) {
        slot.innerHTML = `<p class="catalog-status" role="alert">No se pudo cargar la banlist: ${h(
            error.message
        )}</p>`;
    }
}

async function loadCards(reset = false) {
    clearTimeout(timer);
    if (isCommerce()) return commerceList();
    if ((window.tab === "Inicio" || isLocal()) && element("q").value.trim()) {
        window.tab = "Todas";
        return window.init();
    }
    if (isLocal()) return;
    if (reset) page = 1;
    controller?.abort();
    controller = new AbortController();
    const current = ++generation;
    const home = window.tab === "Inicio";
    status("Consultando catálogo…");
    try {
        await loadFacets();
        const data = await api.get(
            "cards",
            {
                page: home ? 1 : page,
                page_size: home ? 8 : 24,
                market: window.mk,
                q: element("q").value.trim(),
                card_type: cardTypes[window.tab],
                subtype: home ? undefined : element("sub").value,
                rarity: home ? undefined : element("rar").value,
                product_type: home ? undefined : element("stp").value,
                sort: home ? "updated" : element("srt").value,
                language: "es"
            },
            { signal: controller.signal }
        );
        if (current !== generation || isCommerce()) return;
        if (home) {
            element("home").innerHTML = `${homeHtml(data)}<div id="home-banlist"></div>`;
            loadHomeBanlist();
        }
        else {
            element("list").innerHTML = catalogRows(data);
            element("cnt").textContent = `${data.total} cartas`;
            pagination.innerHTML = pager(data);
        }
        status(
            data.total
                ? ""
                : "El catálogo no contiene resultados para este mercado y estos filtros."
        );
    } catch (error) {
        if (error.name === "AbortError" || current !== generation) return;
        const message = `${h(
            error.message
        )} <button class="ghost" data-catalog-retry>Reintentar</button>`;
        if (home) element("home").innerHTML = `<div class="empty gl" role="alert">${message}</div>`;
        else {
            element(
                "list"
            ).innerHTML = `<tr><td colspan="3" class="empty" role="alert">${message}</td></tr>`;
            pagination.innerHTML = "";
        }
        status("No se pudo cargar el catálogo.");
    }
}

window.list = function () {
    if (isCommerce()) return commerceList();
    if (isLocal() && !element("q").value.trim()) return;
    clearTimeout(timer);
    timer = setTimeout(() => loadCards(true), 250);
};

window.init = function () {
    ++generation;
    controller?.abort();
    clearTimeout(timer);
    try {
        localStorage.setItem("cm_market", window.mk);
    } catch {
        /* Preference is optional. */
    }
    element("commercial-notice").hidden = !isCommerce();
    for (const id of Object.values(localPanels)) element(id).style.display = "none";
    if (isCommerce()) {
        status("");
        return commerceInit();
    }
    element("tabs").innerHTML = window.TABS.map(
        (tab) =>
            `<button aria-pressed="${tab === window.tab}" data-g="${h(tab)}">${h(
                window.TN[tab]
            )}</button>`
    ).join("");
    const panel = localPanels[window.tab] || (window.tab === "Inicio" ? "home" : "cat");
    for (const id of ["home", "cat", "prod", "vend", ...Object.values(localPanels)])
        element(id).style.display = id === panel ? "" : "none";
    if (isLocal()) {
        status("");
        renderLocal[window.tab](element(localPanels[window.tab]));
        if (element("md").classList.contains("on") && element("md").dataset.mode === "catalog")
            openCard(element("md").dataset.catalogId);
        return;
    }
    element("srt").innerHTML =
        '<option value="name">Nombre</option><option value="name_desc">Nombre: Z–A</option><option value="updated">Actualizadas recientemente</option>';
    loadCards(true);
    if (element("md").classList.contains("on") && element("md").dataset.mode === "catalog") {
        openCard(element("md").dataset.catalogId);
    }
};

async function openCard(id) {
    const current = ++detailGeneration;
    element("md").dataset.mode = "catalog";
    element("md").dataset.catalogId = id;
    element("mb").innerHTML =
        '<div class="top"><h2>Cargando ficha…</h2><button class="ghost" data-close="md">Cerrar</button></div>';
    window.pad();
    element("md").classList.add("on");
    try {
        priceHistory = undefined;
        const market = window.mk;
        const history = api
            .get(`cards/${id}/price-history`, { market, days: 3650 })
            .catch(() => null);
        const [card, printings] = await Promise.all([
            api.get(`cards/${id}`),
            api.get(`cards/${id}/printings`, { page: 1, page_size: 24, market })
        ]);
        if (
            current !== detailGeneration ||
            element("md").dataset.mode !== "catalog" ||
            !element("md").classList.contains("on")
        )
            return;
        detail = card;
        printingPage = printings;
        selectedPrinting = "";
        renderDetail();
        history.then((data) => {
            if (current !== detailGeneration || element("md").dataset.mode !== "catalog") return;
            priceHistory = data;
            renderChart();
        });
    } catch (error) {
        if (current !== detailGeneration || element("md").dataset.mode !== "catalog") return;
        element(
            "mb"
        ).innerHTML = `<div class="top"><h2>No se pudo cargar la ficha</h2><button class="ghost" data-close="md">Cerrar</button></div><p role="alert">${h(
            error.message
        )}</p>`;
    }
}

document.addEventListener(
    "click",
    async (event) => {
        const target = event.target.closest(
            "[data-catalog-card], [data-catalog-page], [data-printing-page], [data-catalog-retry]"
        );
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (target.dataset.catalogCard) return openCard(target.dataset.catalogCard);
        if (target.hasAttribute("data-catalog-retry")) {
            facets = undefined;
            api.cache.clear();
            return loadCards();
        }
        if (target.dataset.catalogPage) {
            page = Number(target.dataset.catalogPage);
            return loadCards();
        }
        if (target.dataset.printingPage && detail) {
            const current = detailGeneration;
            target.disabled = true;
            try {
                const data = await api.get(`cards/${detail.id}/printings`, {
                    page: Number(target.dataset.printingPage),
                    page_size: 24,
                    market: window.mk
                });
                if (current !== detailGeneration || element("md").dataset.mode !== "catalog")
                    return;
                printingPage = data;
                selectedPrinting = "";
                renderDetail();
            } catch (error) {
                window.toast(error.message);
            } finally {
                target.disabled = false;
            }
        }
    },
    true
);

document.addEventListener("change", (event) => {
    if (event.target.id === "catalog-printing" && detail) {
        selectedPrinting = event.target.value;
        renderDetail();
    }
    // Prices follow the currency chosen in the header while a card is open.
    if (event.target.id === "cur" && detail && element("md").dataset.mode === "catalog")
        renderChart();
});
document.addEventListener(
    "click",
    (event) => {
        const range = event.target.closest("[data-ph-range]");
        if (!range) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        chartDays = Number(range.dataset.phRange);
        renderChart();
    },
    true
);
installWantlists({
    panel: () => (window.tab === "Wantlists" ? element("wlv") : null),
    detail: () =>
        detail && element("md").dataset.mode === "catalog"
            ? { card: detail, printings: printingPage, selectedId: selectedPrinting }
            : null
});
installProfile({ panel: () => element("pfv") });
installCart({
    panel: () => element("cartv"),
    open: () => {
        window.tab = "Carrito";
        window.init();
        window.scrollTo(0, 0);
    }
});
document.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-catalog-card]");
    if (row && ["Enter", " "].includes(event.key) && event.target.tagName !== "BUTTON") {
        event.preventDefault();
        openCard(row.dataset.catalogCard);
    }
});
document.addEventListener(
    "error",
    (event) => {
        if (event.target.matches?.("img.catalog-image")) {
            const fallback = document.createElement("span");
            fallback.className = "catalog-image-fallback";
            fallback.textContent = "Imagen no disponible";
            event.target.replaceWith(fallback);
        }
    },
    true
);

for (const name of ["detail", "vendor", "popen", "showCart"]) {
    const original = window[name];
    window[name] = function (...args) {
        const result = original(...args);
        const container = element(name === "showCart" ? "cbx" : "mb");
        const notice = document.createElement("p");
        notice.className = "catalog-status";
        notice.textContent = "Comercio de demostración: ofertas, precios y stock ilustrativos.";
        container.prepend(notice);
        return result;
    };
}
window.TN.Productos = "Productos (demo)";
window.TN.Vendedores = "Vendedores (demo)";
// The cart page opens from the cart popup, so it has no tab of its own.
for (const name of ["Wantlists", "Perfil"]) if (!window.TABS.includes(name)) window.TABS.push(name);
window.TN.Wantlists = "Wantlists";
window.TN.Perfil = "Perfil";
try {
    const market = localStorage.getItem("cm_market");
    if (["TCG", "OCG"].includes(market)) window.mk = market;
} catch {
    /* Storage can be disabled by the browser. */
}
window.seg();
window.init();
