// Two quiet columns at the end of the home page: what is new on Cardmática,
// and news about Yu-Gi-Oh! with the page each one comes from. The API sends
// only news in the visitor's language (backend/app/services/news.py); a column
// with none is left out.
import { escapeHtml } from "./html.js";
import { formatDate } from "./format.js";
import { t } from "./lang.js";

const h = escapeHtml;
const SECTIONS = [
    ["site", "Novedades de Cardmática"],
    ["yugioh", "Noticias de Yu-Gi-Oh!"]
];

function itemHtml(item) {
    const title = item.url
        ? `<a href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${h(item.title)}</a>`
        : h(item.title);
    const source = item.source_name
        ? `<small>${h(t("Fuente: {source}", { source: item.source_name }))}</small>`
        : "";
    return `<li>
        <time datetime="${h(item.published_on)}">${h(formatDate(item.published_on))}</time>
        <b>${title}</b>
        <p>${h(item.summary)}</p>
        ${source}
    </li>`;
}

export function newsHtml(data) {
    const columns = SECTIONS.filter(([key]) => data?.[key]?.length);
    if (!columns.length) return "";
    return `<section class="news" aria-label="${t("Noticias")}">${columns
        .map(
            ([key, title]) =>
                `<div><h2 class="news-title">${t(title)}</h2><ul>${data[key].map(itemHtml).join("")}</ul></div>`
        )
        .join("")}</section>`;
}
