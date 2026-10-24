// Two quiet columns at the end of the home page: what is new on Cardmática,
// and news about Yu-Gi-Oh! with the page each one comes from.
// (backend/app/api/news.py; administrators add more from their panel).
import { escapeHtml } from "./html.js";
import { formatDate } from "./format.js";

const h = escapeHtml;
const SECTIONS = [
    ["site", "Novedades de Cardmática"],
    ["yugioh", "Noticias de Yu-Gi-Oh!"]
];

function itemHtml(item) {
    const title = item.url
        ? `<a href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${h(item.title)}</a>`
        : h(item.title);
    return `<li><time datetime="${h(item.published_on)}">${h(formatDate(item.published_on))}</time><b>${title}</b><p>${h(
        item.summary
    )}</p>${item.source_name ? `<small>Fuente: ${h(item.source_name)}</small>` : ""}</li>`;
}

export function newsHtml(data) {
    const columns = SECTIONS.filter(([key]) => data?.[key]?.length);
    if (!columns.length) return "";
    return `<section class="news" aria-label="Noticias">${columns
        .map(
            ([key, title]) =>
                `<div><h2 class="news-title">${title}</h2><ul>${data[key].map(itemHtml).join("")}</ul></div>`
        )
        .join("")}</section>`;
}
