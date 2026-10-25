// Two quiet columns at the end of the home page: what is new on Cardmática,
// and news about Yu-Gi-Oh! with the page each one comes from, in the
// visitor's language when there are (backend/app/api/news.py). An item in
// another language says which, and is marked so screen readers read it right.
import { escapeHtml } from "./html.js";
import { formatDate } from "./format.js";
import { lang, t } from "./lang.js";

const h = escapeHtml;
const LANGUAGE_NAMES = { es: "En español", pt: "En portugués", en: "En inglés" };
const SECTIONS = [
    ["site", "Novedades de Cardmática"],
    ["yugioh", "Noticias de Yu-Gi-Oh!"]
];

function itemHtml(item) {
    const title = item.url
        ? `<a href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${h(item.title)}</a>`
        : h(item.title);
    const other = item.language && item.language !== lang;
    const source = [
        item.source_name ? t("Fuente: {source}", { source: item.source_name }) : "",
        other ? t(LANGUAGE_NAMES[item.language]) : ""
    ].filter(Boolean);
    return `<li${other ? ` lang="${h(item.language)}"` : ""}><time datetime="${h(item.published_on)}">${h(
        formatDate(item.published_on)
    )}</time><b>${title}</b><p>${h(item.summary)}</p>${source.length ? `<small>${h(source.join(" · "))}</small>` : ""}</li>`;
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
