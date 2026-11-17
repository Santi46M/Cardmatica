// The account's own pages under one row of links, as in any marketplace's
// account area: profile, stock (for sellers), wantlists and security.
import { escapeHtml } from "./html.js";
import { t } from "./lang.js";

const PAGES = [
    ["Perfil", "Mi perfil"],
    ["Stock", "Mi stock", "sellers"],
    ["Deseados", "Listas de deseados"],
    ["Seguridad", "Seguridad"]
];

// current: the tab on screen; sells: whether "Mi stock" is offered.
export function accountNavHtml(current, sells) {
    const links = PAGES.filter(([, , who]) => !who || sells)
        .map(([tab, label]) => {
            const here = tab === current ? ' aria-current="page"' : "";
            return `<button type="button" class="pill" data-go="${tab}"${here}>${escapeHtml(t(label))}</button>`;
        })
        .join("");
    return `<nav class="acct-nav" aria-label="${escapeHtml(t("Tu cuenta"))}">${links}</nav>`;
}
