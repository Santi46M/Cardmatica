import { CatalogApi } from "./api.js";
import { catalogRows, detailHtml, escapeHtml, homeHtml, pager } from "./catalog-view.js";

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
const cardTypes = { Monstruo: "Monster", Magia: "Spell", Trampa: "Trap" };
const isCommerce = () => ["Productos", "Vendedores"].includes(window.tab);
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

async function loadCards(reset = false) {
    clearTimeout(timer);
    if (isCommerce()) return commerceList();
    if (window.tab === "Inicio" && element("q").value.trim()) {
        window.tab = "Todas";
        return window.init();
    }
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
        if (home) element("home").innerHTML = homeHtml(data);
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
            ).innerHTML = `<tr><td colspan="5" class="empty" role="alert">${message}</td></tr>`;
            pagination.innerHTML = "";
        }
        status("No se pudo cargar el catálogo.");
    }
}

window.list = function () {
    if (isCommerce()) return commerceList();
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
    const panel = window.tab === "Inicio" ? "home" : "cat";
    for (const id of ["home", "cat", "prod", "vend"])
        element(id).style.display = id === panel ? "" : "none";
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
        const [card, printings] = await Promise.all([
            api.get(`cards/${id}`),
            api.get(`cards/${id}/printings`, { page: 1, page_size: 24, market: window.mk })
        ]);
        if (
            current !== detailGeneration ||
            element("md").dataset.mode !== "catalog" ||
            !element("md").classList.contains("on")
        )
            return;
        detail = card;
        printingPage = printings;
        element("mb").innerHTML = detailHtml(detail, printingPage);
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
                element("mb").innerHTML = detailHtml(detail, printingPage);
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
    if (event.target.id === "catalog-printing" && detail)
        element("mb").innerHTML = detailHtml(detail, printingPage, event.target.value);
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
try {
    const market = localStorage.getItem("cm_market");
    if (["TCG", "OCG"].includes(market)) window.mk = market;
} catch {
    /* Storage can be disabled by the browser. */
}
window.seg();
window.init();
