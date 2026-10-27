// The cover of the site (/): one box per card game. Choosing one opens its
// marketplace (/yugioh, /magic, /pokemon), each with the same layout.
//
// The boxes are drawn here, in the site's own style: no game's logo or art,
// which belong to Konami, Wizards of the Coast and The Pokémon Company.
// Under each name, the number of cards its catalogue has, once the API says.
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";

const h = escapeHtml;
// Announced on the cover, not yet open (docs: expansion plan).
const SOON = [{ name: "One Piece Card Game", colors: ["#b3262e", "#e0b44a"] }];

// Three cards fanned out, in the game's two colours.
function artHtml([first, second]) {
    return html`
        <svg class="portal-art" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
            <rect x="22" y="14" width="40" height="58" rx="5" transform="rotate(-14 42 43)" fill="${second}" opacity=".55"/>
            <rect x="58" y="14" width="40" height="58" rx="5" transform="rotate(14 78 43)" fill="${second}" opacity=".75"/>
            <rect x="40" y="9" width="40" height="60" rx="5" fill="${first}"/>
            <rect x="45" y="14" width="30" height="24" rx="2" fill="#fff" opacity=".22"/>
            <rect x="45" y="43" width="30" height="3" rx="1.5" fill="#fff" opacity=".35"/>
            <rect x="45" y="50" width="22" height="3" rx="1.5" fill="#fff" opacity=".25"/>
        </svg>`;
}

function gameHtml(code, counts) {
    const game = window.GAMES[code];
    const markets = game.markets.length > 1 ? game.markets.map((market) => t(market.label)).join(" · ") : "";
    const count = counts?.[code];
    const cards = count
        ? `<span class="portal-count">${t(count === 1 ? "{count} carta en el catálogo" : "{count} cartas en el catálogo", {
              count: count.toLocaleString(window.I18N.locale)
          })}</span>`
        : "";
    return html`
        <a class="portal-game gl" href="${h(game.path)}" data-game-go="${h(code)}" style="--g1:${h(game.colors[0])};--g2:${h(game.colors[1])}">
            ${artHtml(game.colors)}
            <span class="portal-body">
                <span class="portal-name">${h(game.name)}</span>
                <span class="portal-line">${h(t(game.tagline))}</span>
                <span class="portal-meta">${h(markets)}${cards}</span>
            </span>
            <span class="btn portal-go">${t("Entrar al mercado")}</span>
        </a>`;
}

function soonHtml(game) {
    return html`
        <div class="portal-game gl soon" style="--g1:${h(game.colors[0])};--g2:${h(game.colors[1])}" aria-disabled="true">
            ${artHtml(game.colors)}
            <span class="portal-body">
                <span class="portal-name">${h(game.name)}</span>
                <span class="portal-line">${t("Muy pronto en Cardmática.")}</span>
            </span>
            <span class="portal-soon">${t("Próximamente")}</span>
        </div>`;
}

// What every marketplace shares, in three short points.
const POINTS = [
    ["Vendedores del Mercosur", "Tiendas y coleccionistas de Argentina, Brasil, Paraguay, Uruguay y Bolivia, cada uno con su inventario."],
    ["Precios en tu moneda", "Pesos, reales, guaraníes, bolivianos, dólares o euros, siempre a la vista."],
    ["Cada impresión por separado", "Rareza, idioma, edición y acabado de cada carta, con su historial de ventas."]
];

export function portalHtml(counts = null) {
    const points = POINTS.map(([title, text]) => `<div><b>${t(title)}</b><p>${t(text)}</p></div>`).join("");
    return html`
        <section class="portal-hero">
            <h1>${t("Cartas coleccionables del <b>Mercosur</b>")}</h1>
            <p>${t("Elige tu juego: cada uno tiene su mercado, con sus cartas, rarezas, cajas y accesorios.")}</p>
        </section>
        <nav class="portal-games" aria-label="${t("Juegos")}">
            ${window.GAME_ORDER.map((code) => gameHtml(code, counts)).join("")}
            ${SOON.map(soonHtml).join("")}
        </nav>
        <section class="portal-points gl" aria-label="${t("Lo que comparten todos los mercados")}">${points}</section>`;
}

// The number of cards of each game, one small request each, kept for the visit.
let counts = null;
export async function portalCounts(api) {
    if (counts) return counts;
    const entries = await Promise.all(
        window.GAME_ORDER.map((code) =>
            api.get("cards", { game: code, page_size: 1 }).then(
                (data) => [code, data.total],
                () => [code, 0]
            )
        )
    );
    counts = Object.fromEntries(entries);
    return counts;
}
