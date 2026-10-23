// Title and description of the page as the person moves around the site.
// The server sends the right ones for the first load (backend/app/api/pages.py);
// these keep them right after moving between tabs or opening a card.

const SITE = "Cardmática";
const DEFAULT_DESCRIPTION =
    "Catálogo de cartas de Yu-Gi-Oh! TCG y OCG con banlist, impresiones e historial de precios, para compradores y vendedores del Mercosur.";

// [title, description] per tab; tabs not listed use the site's own.
const TABS = {
    Inicio: [`${SITE} · Cartas de Yu-Gi-Oh! en el Mercosur`, DEFAULT_DESCRIPTION],
    Todas: [`Todas las cartas · ${SITE}`, "Busca cartas de Yu-Gi-Oh! por nombre, código, tipo, rareza o set."],
    Monstruo: [`Monstruos · ${SITE}`, "Monstruos de Yu-Gi-Oh! por clase, tipo, atributo y nivel."],
    Magia: [`Magias · ${SITE}`, "Cartas mágicas de Yu-Gi-Oh!: normales, de juego rápido, continuas, de equipo, de campo y de ritual."],
    Trampa: [`Trampas · ${SITE}`, "Cartas trampa de Yu-Gi-Oh!: normales, continuas y de contraefecto."],
    Productos: [`Cajas y accesorios (demo) · ${SITE}`, "Cajas selladas, sobres y accesorios de la tienda de demostración."],
    Vendedores: [`Vendedores (demo) · ${SITE}`, "Vendedores de la tienda de demostración."],
    Wantlists: [`Mis wantlists · ${SITE}`, "Las cartas que buscas, con avisos de precio."],
    Perfil: [`Mi perfil · ${SITE}`, DEFAULT_DESCRIPTION],
    Carrito: [`Carrito · ${SITE}`, DEFAULT_DESCRIPTION],
    Acceso: [`Iniciar sesión o crear cuenta · ${SITE}`, DEFAULT_DESCRIPTION],
    Seguridad: [`Seguridad de la cuenta · ${SITE}`, DEFAULT_DESCRIPTION],
    Admin: [`Administración · ${SITE}`, DEFAULT_DESCRIPTION]
};

function set(title, description) {
    document.title = title;
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]'])
        document.querySelector(selector)?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
}

export function tabMeta(tab) {
    const [title, description] = TABS[tab] || TABS.Inicio;
    set(title, description);
}

export function cardMeta(name) {
    set(
        `${name} · Cartas sueltas · ${SITE}`,
        `${name}: impresiones, rarezas, estado en la banlist e historial de precios en ${SITE}.`
    );
}
