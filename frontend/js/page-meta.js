// Title and description of the page as the person moves around the site.
// The server sends the right ones for the first load (backend/app/api/pages.py);
// these keep them right after moving between tabs or opening a card. The texts
// are the same keys the server translates, so both say the same.
import { t } from "./lang.js";

const DEFAULT_DESCRIPTION =
    "Catálogo de cartas de Yu-Gi-Oh! TCG y OCG con banlist, impresiones e historial de precios, para compradores y vendedores del Mercosur.";

// [title, description] per tab; tabs not listed use the site's own.
const TABS = {
    Inicio: ["Cardmática · Cartas de Yu-Gi-Oh! en el Mercosur", DEFAULT_DESCRIPTION],
    Todas: ["Todas las cartas · Cardmática", "Busca cartas de Yu-Gi-Oh! por nombre, código, tipo, rareza o set."],
    Monstruo: ["Monstruos · Cardmática", "Monstruos de Yu-Gi-Oh! por clase, tipo, atributo y nivel."],
    Magia: [
        "Magias · Cardmática",
        "Cartas mágicas de Yu-Gi-Oh!: normales, de juego rápido, continuas, de equipo, de campo y de ritual."
    ],
    Trampa: ["Trampas · Cardmática", "Cartas trampa de Yu-Gi-Oh!: normales, continuas y de contraefecto."],
    Productos: [
        "Cajas y accesorios (demo) · Cardmática",
        "Cajas selladas, sobres y accesorios de la tienda de demostración."
    ],
    Vendedores: ["Vendedores (demo) · Cardmática", "Vendedores de la tienda de demostración."],
    Deseados: [
        "Mi lista de deseados · Cardmática",
        "Las cartas que buscas, con avisos de precio y asistente de compra."
    ],
    Perfil: ["Mi perfil · Cardmática", DEFAULT_DESCRIPTION],
    Carrito: ["Carrito · Cardmática", DEFAULT_DESCRIPTION],
    Acceso: ["Iniciar sesión o crear cuenta · Cardmática", DEFAULT_DESCRIPTION],
    Seguridad: ["Seguridad de la cuenta · Cardmática", DEFAULT_DESCRIPTION],
    Admin: ["Administración · Cardmática", DEFAULT_DESCRIPTION]
};

function set(title, description) {
    document.title = title;
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]'])
        document.querySelector(selector)?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
}

// Magic and Pokémon: their marketplace's title, and each tab named in their words.
const GAME_META = {
    magic: [
        "Cardmática · Cartas de Magic: The Gathering en el Mercosur",
        "Cartas sueltas, sobres y accesorios de Magic: The Gathering: impresiones, rarezas, acabados foil y formatos, para compradores y vendedores del Mercosur."
    ],
    pokemon: [
        "Cardmática · Cartas de Pokémon en el Mercosur",
        "Cartas sueltas, sobres y accesorios de Pokémon TCG, internacionales y japonesas: rarezas, variantes holo y formatos, para compradores y vendedores del Mercosur."
    ]
};
const PORTAL = [
    "Cardmática · Marketplace de cartas coleccionables del Mercosur",
    "Compra y vende cartas de Yu-Gi-Oh!, Magic: The Gathering y Pokémon en el Mercosur: impresiones, rarezas, historial de precios y vendedores de la región."
];

function metaFor(tab) {
    const game = window.game;
    if (tab === "Portada") return PORTAL;
    if (game === "yugioh" || !GAME_META[game]) return TABS[tab] || TABS.Inicio;
    if (tab === "Inicio") return GAME_META[game];
    // The account's own pages are the same in every game.
    if (["Deseados", "Perfil", "Carrito", "Acceso", "Seguridad", "Admin"].includes(tab)) return TABS[tab];
    // "Criaturas · Magic: The Gathering · Cardmática"
    const label = t(window.TAB_LABELS[tab] || tab).replace(/ \(demo\)$/, "");
    const name = window.GAMES[game].name;
    // "Pokémon · Pokémon" would say it twice.
    const title = label === name ? t("{tab} · Cardmática", { tab: label }) : t("{tab} · {game} · Cardmática", { tab: label, game: name });
    return [title, GAME_META[game][1]];
}

export function tabMeta(tab) {
    const [title, description] = metaFor(tab);
    set(t(title), t(description));
    // Every view has one <h1>: the home page draws its own; the others name
    // the tab for screen readers (index.html, #view-title).
    const heading = document.getElementById("view-title");
    if (heading) {
        heading.hidden = tab === "Inicio" || tab === "Portada";
        heading.textContent = t(title).replace(/ · Cardmática$/, "");
    }
}

export function cardMeta(name) {
    set(
        t("{name} · Cartas sueltas · Cardmática", { name }),
        window.game === "yugioh"
            ? t("{name}: impresiones, rarezas, estado en la banlist e historial de precios en Cardmática.", { name })
            : t("{name}: impresiones, rarezas, legalidad en torneos e historial de precios en Cardmática.", { name })
    );
}

export function scopeMeta(kind, name) {
    if (kind === "set" && window.game !== "yugioh")
        set(
            t("{name} · Set de {game} · Cardmática", { name, game: window.GAMES[window.game].name }),
            t("{name}: cartas sueltas, cajas y sobres del set en Cardmática.", { name })
        );
    else if (kind === "set")
        set(
            t("{name} · Set de Yu-Gi-Oh! · Cardmática", { name }),
            t("{name}: cartas sueltas, cajas y sobres del set en Cardmática.", { name })
        );
    else set(t("Arquetipo {name} · Cardmática", { name }), t("Todas las cartas del arquetipo {name} en Cardmática.", { name }));
}
