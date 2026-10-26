// The banner under the tabs: the newest sets of the market, one at a time.
//
// It shows about four slides: the newest sets of the catalogue (GET
// /api/v1/sets/recent) and, when they are fewer, the newest boxes and packs of
// the demo store for that market (frontend/demo/data.js), so OCG has its
// banner too. Every ROTATE_MS a slide slides out to the side and the next one
// comes in. As carousels must (WCAG 2.2.2), it stops while the pointer or
// the focus is on it, can be paused for good, and does not move by itself
// for people who asked their system for reduced motion.
//
// On the home page it is big; in the catalogue it shrinks to one line and
// stops, so it does not get in the way of a search (styles.css, .promo.compact).
import { escapeHtml, html } from "./html.js";
import { formatDate } from "./format.js";
import { t } from "./lang.js";
import { scopePath } from "./collections.js";

const h = escapeHtml;
const SLIDES = 4;
// Long enough to read the slide; the usual pace of a home carousel.
const ROTATE_MS = 7000;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Photos come from each set's official page, only in the private test view
// with images on (frontend/demo/store.js loads PRODUCT_PHOTOS).
const PHOTO_WARNING = () =>
    t("Foto provisional de la página oficial, sin licencia: visible solo en la vista de prueba privada. No publicar.");
const photoFor = (key) => (key ? window.PRODUCT_PHOTOS?.[key.toLowerCase()] : null);

const comparable = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

// ---- What the slides say ---------------------------------------------------

function setSlide(set) {
    const contents = t(
        set.card_count === 1 ? "Cajas, sobres y {count} carta suelta" : "Cajas, sobres y {count} cartas sueltas",
        { count: set.card_count }
    );
    const href = scopePath({ kind: "set", id: set.id });
    return {
        key: `set:${set.id}`,
        name: set.name,
        released: set.release_date,
        line: contents,
        photo: photoFor(set.code),
        action: `<a class="btn" href="${href}" data-scope="set" data-scope-id="${h(set.id)}">${t("Ver el set")}</a>`
    };
}

// The newest box or pack of each demo set of this market not already shown
// (nor left out on purpose, like the set whose page is open).
function demoSlides(market, shown, hidden) {
    const { PRODUCTS: products = [], DEMO: demo } = window;
    const seen = new Set([...shown.map((slide) => slide.name), ...hidden].map(comparable));
    const slides = [];
    const newest = products
        .filter((product) => product.set && product.market === market)
        .sort((a, b) => (b.released > a.released ? 1 : b.released < a.released ? -1 : 0));
    for (const product of newest) {
        const name = demo.sets[product.set].name;
        if (seen.has(comparable(name))) continue;
        seen.add(comparable(name));
        slides.push({
            key: `product:${product.id}`,
            name,
            released: product.released,
            line: t(product.detail || product.category),
            photo: photoFor(product.image),
            action: `<button class="btn" data-pd="${product.id}">${t("Ver el producto")}</button>`
        });
    }
    return slides;
}

export function promoSlides(sets, market, hidden = []) {
    const slides = sets.map(setSlide);
    return [...slides, ...demoSlides(market, slides, hidden)].slice(0, SLIDES);
}

function slideHtml(slide, index, count, market) {
    const label = index === 0 ? t("Último set {market}", { market }) : t("Set {market}", { market });
    const released = slide.released ? ` · ${h(formatDate(slide.released))}` : "";
    const warning = h(PHOTO_WARNING());
    // The same picture twice: faint and blurred behind, clear on the right.
    const background = slide.photo ? `<img class="promo-bg" src="${h(slide.photo)}" alt="" aria-hidden="true">` : "";
    const art = slide.photo
        ? html`
            <span class="img-wrap promo-art">
                <img src="${h(slide.photo)}" alt="${h(slide.name)}" width="300" height="300" decoding="async">
                <span class="img-warn" tabindex="0" role="img" aria-label="${warning}" data-tip="${warning}">!</span>
            </span>`
        : "";
    const position = t("{index} de {count}", { index: index + 1, count });
    return html`
        <div class="promo-slide${slide.photo ? " with-photo" : ""}" role="group" aria-roledescription="${t("diapositiva")}" aria-label="${position}: ${h(slide.name)}">
            ${background}
            <div class="promo-body">
                <small class="promo-label">${h(label)}${released}</small>
                <h2>${h(slide.name)}</h2>
                <p class="promo-text">${h(slide.line)}</p>
                <p class="promo-actions">
                    ${slide.action}
                    <button class="ghost" data-go="Productos">${t("Cajas y accesorios")}</button>
                </p>
            </div>
            ${art}
        </div>`;
}

function promoHtml(slides, market) {
    const dots = slides
        .map((slide, index) => `<button class="promo-dot" data-promo-show="${index}" aria-label="${t("Mostrar {name}", { name: h(slide.name) })}"></button>`)
        .join("");
    const controls =
        slides.length > 1
            ? html`
                <div class="promo-controls">
                    ${dots}
                    <button class="promo-pause" data-promo-pause aria-pressed="false" aria-label="${t("Pausar el banner")}"></button>
                </div>`
            : "";
    return html`
        <section class="promo" aria-roledescription="${t("carrusel")}" aria-label="${t("Últimos sets")}">
            <div class="promo-track">${slides.map((slide, index) => slideHtml(slide, index, slides.length, market)).join("")}</div>
            ${controls}
        </section>`;
}

// ---- The carousel ----------------------------------------------------------

export function installPromo({ slot, api }) {
    const recent = new Map(); // market → sets, or a pending request
    let shown = { content: "", market: null };
    let index = 0;
    let timer = null;
    let paused = false; // by the person, for good
    let held = false; // while the pointer or focus is on it

    const banner = () => slot.querySelector(".promo");
    const slides = () => [...slot.querySelectorAll(".promo-slide")];

    function show(next) {
        const all = slides();
        if (!all.length) return;
        index = (next + all.length) % all.length;
        slot.querySelector(".promo-track").style.transform = `translateX(${-100 * index}%)`;
        all.forEach((slide, position) => {
            const current = position === index;
            slide.classList.toggle("current", current);
            // The slides out of view cannot be reached with the keyboard.
            slide.inert = !current;
        });
        slot.querySelectorAll("[data-promo-show]").forEach((dot, position) => {
            dot.setAttribute("aria-current", String(position === index));
        });
    }

    function schedule() {
        clearTimeout(timer);
        const element = banner();
        const still =
            !element || paused || held || reducedMotion.matches || document.hidden || element.classList.contains("compact");
        if (still || slides().length < 2) return;
        timer = setTimeout(() => {
            show(index + 1);
            schedule();
        }, ROTATE_MS);
    }

    function draw(market, { visible, compact, hideSetId }) {
        const sets = recent.get(market);
        const all = Array.isArray(sets) ? sets : [];
        const list = all.filter((set) => set.id !== hideSetId);
        const hidden = all.filter((set) => set.id === hideSetId).map((set) => set.name);
        const items = visible && Array.isArray(sets) ? promoSlides(list, market, hidden) : [];
        const content = items.length ? promoHtml(items, market) : "";
        // The same banner is kept when only its size changes, so the CSS
        // transition plays and the current slide stays.
        if (content !== shown.content || market !== shown.market || !banner() !== !content) {
            shown = { content, market };
            slot.innerHTML = content;
            index = 0;
            if (content) show(0);
        }
        banner()?.classList.toggle("compact", compact);
        schedule();
    }

    let last = null;
    function render(market, options) {
        last = [market, options];
        if (!recent.has(market)) {
            recent.set(market, "loading");
            api.get("sets/recent", { market, limit: SLIDES })
                .catch(() => [])
                .then((sets) => {
                    recent.set(market, sets);
                    if (last?.[0] === market) draw(...last);
                });
        }
        draw(market, options);
    }

    slot.addEventListener("click", (event) => {
        const dot = event.target.closest("[data-promo-show]");
        if (dot) {
            show(Number(dot.dataset.promoShow));
            schedule();
        }
        const pause = event.target.closest("[data-promo-pause]");
        if (pause) {
            paused = !paused;
            pause.setAttribute("aria-pressed", String(paused));
            pause.setAttribute("aria-label", paused ? t("Reanudar el banner") : t("Pausar el banner"));
            schedule();
        }
    });
    const hold = (value) => () => {
        held = value;
        schedule();
    };
    slot.addEventListener("pointerenter", hold(true));
    slot.addEventListener("pointerleave", hold(false));
    slot.addEventListener("focusin", hold(true));
    slot.addEventListener("focusout", (event) => {
        if (!slot.contains(event.relatedTarget)) hold(false)();
    });
    document.addEventListener("visibilitychange", schedule);
    reducedMotion.addEventListener?.("change", schedule);
    // The set photos may arrive after the banner is drawn.
    document.addEventListener("cm:product-photos", () => {
        shown.content = "";
        if (last) draw(...last);
    });
    return { render };
}
