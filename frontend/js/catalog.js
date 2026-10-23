import { CatalogApi } from "./api.js";
import { homeBanlistHtml, startCountdowns } from "./banlist.js";
import { installCart, renderCart } from "./cart-page.js";
import {
    catalogGrid,
    catalogRows,
    detailHtml,
    homeHtml,
    pager,
    previewHtml,
    skeletonRows,
    skeletonTiles
} from "./catalog-view.js";
import { BACK_TO_TOP_PX, CATALOG, HOVER_PREVIEW } from "./config.js";
import { escapeHtml } from "./html.js";
import { priceChartHtml } from "./price-chart.js";
import { installProfile, renderProfile } from "./profile.js";
import { readJson, writeJson } from "./storage.js";
import { installWantlists, refreshAlerts, renderWantlists } from "./wantlists.js";

const api = new CatalogApi();
const h = escapeHtml;
const element = (id) => document.getElementById(id);
const demoRefreshList = window.refreshList;
const demoShowTab = window.showTab;
let page = 1;
let pendingPage = null;
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
let view = readJson("cm_view", "list") === "grid" ? "grid" : "list";
let shownItems = new Map();
let closingFromHistory = false;
// Filter values from the URL wait here until their options exist.
const wanted = {};
const cardTypes = { Monstruo: "Monster", Magia: "Spell", Trampa: "Trap" };
const isCommerce = () => ["Productos", "Vendedores"].includes(window.tab);
// Panels stored in this browser only; they never query the catalogue list.
const localPanels = { Wantlists: "wlv", Perfil: "pfv", Carrito: "cartv" };
const renderLocal = { Wantlists: renderWantlists, Perfil: renderProfile, Carrito: renderCart };
const isLocal = () => window.tab in localPanels;
const isCatalog = () => !isCommerce() && !isLocal() && window.tab !== "Inicio";
const SORTS =
    '<option value="name">Nombre</option><option value="name_desc">Nombre: Z–A</option><option value="updated">Actualizadas recientemente</option>';

// Layout pieces around the existing table: view toggle, top pager and the grid.
const tableWrap = element("list").closest(".pn");
const pagination = document.createElement("div");
pagination.id = "catalog-pagination";
const topPagination = document.createElement("div");
topPagination.id = "catalog-pagination-top";
const grid = document.createElement("div");
grid.id = "catalog-grid";
grid.className = "card-grid";
grid.hidden = true;
tableWrap.before(topPagination);
tableWrap.after(grid);
grid.after(pagination);
const viewToggle = document.createElement("div");
viewToggle.className = "seg m view-toggle";
viewToggle.setAttribute("role", "group");
viewToggle.setAttribute("aria-label", "Vista");
element("cnt").before(viewToggle);

function renderViewToggle() {
    viewToggle.innerHTML = [
        ["list", "Lista"],
        ["grid", "Grilla"]
    ]
        .map(
            ([value, label]) =>
                `<button data-view="${value}" aria-pressed="${value === view}">${label}</button>`
        )
        .join("");
}

function status(message, { quiet = false } = {}) {
    const node = element("catalog-status");
    node.textContent = message;
    // While loading, the skeleton is the visible feedback; the text stays for screen readers.
    node.classList.toggle("sr-only", quiet);
}

// ---- URL state: shareable searches and the browser's Back button -------------

function readUrl() {
    const params = new URLSearchParams(location.search);
    return {
        tab: params.get("tab"),
        mk: params.get("mk"),
        q: params.get("q") || "",
        sub: params.get("sub") || "",
        rar: params.get("rar") || "",
        stp: params.get("stp") || "",
        srt: params.get("srt") || "name",
        page: Math.max(1, Number(params.get("page")) || 1),
        view: params.get("view"),
        card: params.get("card")
    };
}

function applyUrl(state) {
    const tabs = [...window.TABS, "Carrito"];
    window.tab = tabs.includes(state.tab) ? state.tab : "Inicio";
    if (["TCG", "OCG"].includes(state.mk)) window.market = state.mk;
    element("q").value = state.q;
    Object.assign(wanted, { sub: state.sub, rar: state.rar, stp: state.stp, srt: state.srt });
    pendingPage = state.page;
    if (["list", "grid"].includes(state.view)) view = state.view;
}

function applyWanted() {
    for (const id of ["sub", "rar", "stp", "srt"]) {
        if (!(id in wanted)) continue;
        const select = element(id);
        if ([...select.options].some((option) => option.value === wanted[id])) {
            select.value = wanted[id];
            delete wanted[id];
        }
    }
}

function openCardId() {
    return element("md").classList.contains("on") && element("md").dataset.mode === "catalog"
        ? element("md").dataset.catalogId
        : null;
}

function writeUrl(mode = "replace") {
    const params = new URLSearchParams();
    if (window.tab !== "Inicio") params.set("tab", window.tab);
    if (window.market !== "TCG") params.set("mk", window.market);
    const q = element("q").value.trim();
    if (q) params.set("q", q);
    if (isCatalog()) {
        for (const id of ["sub", "rar", "stp"]) if (element(id).value) params.set(id, element(id).value);
        if (element("srt").value && element("srt").value !== "name")
            params.set("srt", element("srt").value);
        if (page > 1) params.set("page", page);
        if (view !== "list") params.set("view", view);
    }
    const card = openCardId();
    if (card) params.set("card", card);
    const url = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    if (url === `${location.pathname}${location.search}${location.hash}`) return;
    if (mode === "push") history.pushState({ card }, "", url);
    else history.replaceState(history.state, "", url);
}

window.addEventListener("popstate", () => {
    const state = readUrl();
    applyUrl(state);
    window.updateMarketButtons();
    if (!state.card && openCardId()) {
        closingFromHistory = true;
        element("md").classList.remove("on");
    }
    window.showTab();
    if (state.card && openCardId() !== state.card) openCard(state.card, { push: false });
});

// Closing the card returns to the list entry the card was opened from.
new MutationObserver(() => {
    if (element("md").classList.contains("on")) return;
    if (closingFromHistory) {
        closingFromHistory = false;
        return;
    }
    if (!new URLSearchParams(location.search).get("card")) return;
    if (history.state?.card) history.back();
    else writeUrl();
}).observe(element("md"), { attributes: true, attributeFilter: ["class"] });

// ---- Catalogue list ---------------------------------------------------------

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
        market: window.market
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
        slot.innerHTML = homeBanlistHtml(await api.get("banlists"), window.market);
        startCountdowns();
    } catch (error) {
        slot.innerHTML = `<p class="catalog-status" role="alert">No se pudo cargar la banlist: ${h(
            error.message
        )}</p>`;
    }
}

function showViewContainers() {
    tableWrap.hidden = view === "grid";
    grid.hidden = view !== "grid";
}

function showSkeleton(home) {
    if (home) {
        if (!element("home").innerHTML.trim())
            element("home").innerHTML = `<div class="sk-hero gl" aria-hidden="true"></div><div class="grid">${skeletonTiles(
                4
            )}</div>`;
        return;
    }
    showViewContainers();
    if (view === "grid") grid.innerHTML = skeletonTiles(12);
    else element("list").innerHTML = skeletonRows(8);
}

function renderResults(data) {
    shownItems = new Map(data.items.map((card) => [card.id, card]));
    showViewContainers();
    if (view === "grid") grid.innerHTML = catalogGrid(data);
    else element("list").innerHTML = catalogRows(data);
    element("cnt").textContent = `${data.total} cartas`;
    const pages = Math.ceil(data.total / data.page_size);
    pagination.innerHTML = pager(data);
    topPagination.innerHTML = pages > 1 ? pager(data) : "";
}

let lastData = null;

async function loadCards(reset = false) {
    clearTimeout(timer);
    if (isCommerce()) return demoRefreshList();
    if ((window.tab === "Inicio" || isLocal()) && element("q").value.trim()) {
        window.tab = "Todas";
        return window.showTab();
    }
    if (isLocal()) return;
    if (reset) page = pendingPage || 1;
    pendingPage = null;
    controller?.abort();
    controller = new AbortController();
    const current = ++generation;
    const home = window.tab === "Inicio";
    status("Consultando catálogo…", { quiet: true });
    element(home ? "home" : "cat").setAttribute("aria-busy", "true");
    // Cached answers arrive at once; only slower ones show placeholders.
    const skeleton = setTimeout(
        () => current === generation && showSkeleton(home),
        CATALOG.skeletonDelayMs
    );
    try {
        await loadFacets();
        applyWanted();
        writeUrl();
        const data = await api.get(
            "cards",
            {
                page: home ? 1 : page,
                page_size: home ? CATALOG.homeSize : CATALOG.pageSize,
                market: window.market,
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
        } else {
            lastData = data;
            renderResults(data);
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
            showViewContainers();
            element(
                "list"
            ).innerHTML = `<tr><td colspan="3" class="empty" role="alert">${message}</td></tr>`;
            grid.innerHTML = `<p class="empty" role="alert">${message}</p>`;
            pagination.innerHTML = "";
            topPagination.innerHTML = "";
        }
        status("No se pudo cargar el catálogo.");
    } finally {
        clearTimeout(skeleton);
        if (current === generation) element(home ? "home" : "cat").removeAttribute("aria-busy");
    }
}

window.refreshList = function () {
    if (isCommerce()) return demoRefreshList();
    if (isLocal() && !element("q").value.trim()) return;
    clearTimeout(timer);
    timer = setTimeout(() => loadCards(true), CATALOG.searchDelayMs);
};

window.showTab = function () {
    ++generation;
    controller?.abort();
    clearTimeout(timer);
    try {
        localStorage.setItem("cm_market", window.market);
    } catch {
        /* Preference is optional. */
    }
    element("commercial-notice").hidden = !isCommerce();
    for (const id of Object.values(localPanels)) element(id).style.display = "none";
    if (isCommerce()) {
        status("");
        writeUrl();
        return demoShowTab();
    }
    element("tabs").innerHTML = window.TABS.map(
        (tab) =>
            `<button aria-pressed="${tab === window.tab}" data-g="${h(tab)}">${h(
                window.TAB_LABELS[tab]
            )}</button>`
    ).join("");
    const panel = localPanels[window.tab] || (window.tab === "Inicio" ? "home" : "cat");
    for (const id of ["home", "cat", "prod", "vend", ...Object.values(localPanels)])
        element(id).style.display = id === panel ? "" : "none";
    if (isLocal()) {
        status("");
        renderLocal[window.tab](element(localPanels[window.tab]));
        writeUrl();
        if (openCardId()) openCard(openCardId(), { push: false });
        return;
    }
    // Keep the chosen order when the options are rebuilt.
    const sort = wanted.srt ?? element("srt").value;
    element("srt").innerHTML = SORTS;
    element("srt").value = [...element("srt").options].some((option) => option.value === sort)
        ? sort
        : "name";
    delete wanted.srt;
    renderViewToggle();
    loadCards(true);
    if (openCardId()) openCard(openCardId(), { push: false });
};

async function openCard(id, { push = true } = {}) {
    const current = ++detailGeneration;
    element("md").dataset.mode = "catalog";
    element("md").dataset.catalogId = id;
    element("mb").innerHTML =
        '<div class="top"><h2>Cargando ficha…</h2><button class="ghost" data-close="md">Cerrar</button></div>';
    window.alignDialogs();
    element("md").classList.add("on");
    hidePreview();
    writeUrl(push ? "push" : "replace");
    try {
        priceHistory = undefined;
        const market = window.market;
        const history = api
            .get(`cards/${id}/price-history`, { market, days: CATALOG.historyDays })
            .catch(() => null);
        const [card, printings] = await Promise.all([
            api.get(`cards/${id}`),
            api.get(`cards/${id}/printings`, { page: 1, page_size: CATALOG.pageSize, market })
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
            "[data-catalog-card], [data-catalog-page], [data-printing-page], [data-catalog-retry], [data-view]"
        );
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (target.dataset.catalogCard) return openCard(target.dataset.catalogCard);
        if (target.dataset.view) {
            view = target.dataset.view;
            writeJson("cm_view", view);
            renderViewToggle();
            writeUrl();
            if (lastData) renderResults(lastData);
            return;
        }
        if (target.hasAttribute("data-catalog-retry")) {
            facets = undefined;
            api.cache.clear();
            return loadCards();
        }
        if (target.dataset.catalogPage) {
            page = Number(target.dataset.catalogPage);
            await loadCards();
            if (target.closest("#catalog-pagination"))
                topPagination.scrollIntoView({ block: "nearest" });
            return;
        }
        if (target.dataset.printingPage && detail) {
            const current = detailGeneration;
            target.disabled = true;
            try {
                const data = await api.get(`cards/${detail.id}/printings`, {
                    page: Number(target.dataset.printingPage),
                    page_size: CATALOG.pageSize,
                    market: window.market
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

// Search box and list filters. The demo store's product list also reads the
// search box, so this goes through window.refreshList for every tab.
element("q").addEventListener("input", () => window.refreshList());
for (const id of ["sub", "rar", "stp", "srt"])
    element(id).addEventListener("change", () => window.refreshList());

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

// ---- Card preview on hover (mouse only; touch opens the card directly) -------

const preview = document.createElement("div");
preview.id = "card-preview";
preview.className = "card-preview gl";
preview.hidden = true;
preview.setAttribute("aria-hidden", "true");
document.body.append(preview);
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
let previewTimer;
let previewTarget;

function hidePreview() {
    clearTimeout(previewTimer);
    previewTarget = null;
    preview.hidden = true;
}

function placePreview(x, y) {
    const box = preview.getBoundingClientRect();
    const { offsetPx, marginPx } = HOVER_PREVIEW;
    // Prefer the right of the pointer; flip to the left near the window edge.
    const fitsRight = x + offsetPx + box.width <= window.innerWidth - marginPx;
    const left = fitsRight ? x + offsetPx : x - box.width - offsetPx;
    const top = Math.min(
        Math.max(marginPx, y - box.height / 2),
        window.innerHeight - box.height - marginPx
    );
    preview.style.left = `${Math.max(marginPx, left)}px`;
    preview.style.top = `${top}px`;
}

document.addEventListener("pointerover", (event) => {
    const target = event.target.closest("[data-preview]");
    if (!canHover.matches || !target || target === previewTarget) return;
    const card = shownItems.get(target.dataset.preview);
    if (!card) return;
    previewTarget = target;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
        preview.innerHTML = previewHtml(card);
        preview.hidden = false;
        placePreview(event.clientX, event.clientY);
    }, HOVER_PREVIEW.delayMs);
});
document.addEventListener("pointermove", (event) => {
    if (!preview.hidden && previewTarget) placePreview(event.clientX, event.clientY);
});
document.addEventListener("pointerout", (event) => {
    if (previewTarget && !previewTarget.contains(event.relatedTarget)) hidePreview();
});
window.addEventListener("scroll", hidePreview, { passive: true });

// ---- Keyboard shortcut and back to top ----------------------------------------

document.addEventListener("keydown", (event) => {
    const editing = event.target.closest?.("input, textarea, select, [contenteditable]");
    if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        element("q").focus();
        element("q").select();
        return;
    }
    const row = event.target.closest("[data-catalog-card]");
    if (row && ["Enter", " "].includes(event.key) && event.target.tagName !== "BUTTON") {
        event.preventDefault();
        openCard(row.dataset.catalogCard);
    }
});

const toTop = document.createElement("button");
toTop.id = "to-top";
toTop.className = "btn to-top";
toTop.type = "button";
toTop.hidden = true;
toTop.textContent = "↑ Arriba";
toTop.setAttribute("aria-label", "Volver arriba");
document.body.append(toTop);
toTop.addEventListener("click", () => {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    element("q").focus({ preventScroll: true });
});
window.addEventListener(
    "scroll",
    () => {
        toTop.hidden = window.scrollY < Math.min(BACK_TO_TOP_PX, window.innerHeight);
    },
    { passive: true }
);

// ---- Local panels and the demo store ------------------------------------------

installWantlists({
    api,
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
        window.showTab();
        window.scrollTo(0, 0);
    }
});
document.addEventListener(
    "error",
    (event) => {
        if (event.target.matches?.("img.catalog-image")) {
            const fallback = document.createElement("span");
            fallback.className = `catalog-image-fallback${
                event.target.classList.contains("grid") ? " grid" : ""
            }`;
            fallback.textContent = "Imagen no disponible";
            // A broken image takes its provisional warning with it.
            (event.target.closest(".img-wrap") || event.target).replaceWith(fallback);
        }
    },
    true
);

for (const name of ["openDemoCard", "openSeller", "openProduct", "showCart"]) {
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
window.TAB_LABELS.Productos = "Productos (demo)";
window.TAB_LABELS.Vendedores = "Vendedores (demo)";
// The cart page opens from the cart popup, so it has no tab of its own.
for (const name of ["Wantlists", "Perfil"]) if (!window.TABS.includes(name)) window.TABS.push(name);
window.TAB_LABELS.Wantlists = "Wantlists";
window.TAB_LABELS.Perfil = "Perfil";
try {
    const market = localStorage.getItem("cm_market");
    if (["TCG", "OCG"].includes(market)) window.market = market;
} catch {
    /* Storage can be disabled by the browser. */
}
const initial = readUrl();
applyUrl(initial);
window.updateMarketButtons();
window.showTab();
if (initial.card) openCard(initial.card, { push: false });
refreshAlerts();
