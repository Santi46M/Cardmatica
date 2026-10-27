// Forbidden & Limited status of a card, and the banlist box of the home page.
import { escapeHtml, html } from "./html.js";
import { NEXT_BANLIST } from "./config.js";
import { formatDate } from "./format.js";
import { t } from "./lang.js";

const h = escapeHtml;
const DAY_MS = 864e5;

const STATUS = {
    forbidden: { label: "Prohibida", mark: "✕", tone: "forbidden" },
    limited: { label: "Limitada", mark: "1", tone: "limited" },
    semi_limited: { label: "Semi-limitada", mark: "2", tone: "semi" },
    unlimited: { label: "Permitida", mark: "✓", tone: "ok" },
    unknown: { label: "Sin estado verificado", mark: "?", tone: "unknown" }
};

function safeUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function copies(status) {
    if (status.max_copies == null) return "";
    return t(status.max_copies === 1 ? "{count} copia" : "{count} copias", { count: status.max_copies });
}

export function statusFor(card, market) {
    return (card.banlist_status || []).find((item) => item.format === market);
}

export function badgeHtml(status) {
    if (!status) return "";
    const info = STATUS[status.status] || STATUS.unknown;
    const limit = copies(status) ? ` (${copies(status)})` : "";
    const list = t("lista del {date}", { date: formatDate(status.effective_date) });
    const title = h(`${t("{status} en {format}", { status: t(info.label), format: status.format })}${limit} · ${list}`);
    return `<span class="bn bn-${info.tone}" role="img" aria-label="${title}" title="${title}">${info.mark}</span>`;
}

const sourceLink = (url, name) =>
    url ? `<a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(name)}</a>` : h(name);

// One row per format, the current market first.
function statusRow(status, market) {
    const info = STATUS[status.status] || STATUS.unknown;
    const limit = copies(status) ? ` · ${h(copies(status))}` : "";
    const since = h(t("Vigente desde el {date}", { date: formatDate(status.effective_date) }));
    const note = status.scope_note ? `<br>${h(status.scope_note)}` : "";
    return html`
        <div class="bl-row${status.format === market ? " current" : ""}">
            ${badgeHtml(status)}
            <div>
                <b>${h(status.format)} · ${h(t(info.label))}</b>${limit}
                <small>${since} · ${sourceLink(safeUrl(status.source_url), status.source_name)}${note}</small>
            </div>
        </div>`;
}

export function banlistSectionHtml(card, market) {
    const rows = (card.banlist_status || [])
        .slice()
        .sort((a, b) => (a.format === market ? -1 : b.format === market ? 1 : 0))
        .map((status) => statusRow(status, market))
        .join("");
    const imported = (card.banlist || [])
        .map((entry) => {
            const label = t((STATUS[entry.status] || STATUS.unknown).label);
            return `<li>${h(entry.format)} · ${h(formatDate(entry.effective_date))} · ${h(label)}</li>`;
        })
        .join("");
    const none = `<p class="catalog-status">${t("Todavía no hay listas importadas en el catálogo.")}</p>`;
    const history = imported
        ? `<details><summary>${t("Estados históricos de importaciones autorizadas")}</summary><ul>${imported}</ul></details>`
        : "";
    return `<section class="catalog-section"><h3>Banlist</h3>${rows || none}${history}</section>`;
}

// The home page box of one format: countdown to the next list, or how long
// since the last one, and what the current list holds.
function homePanel(lists, format, market) {
    const current = lists.find((item) => item.format === format);
    const next = NEXT_BANLIST[format];
    const url = current && safeUrl(current.source_url);
    const source = url ? ` <a href="${h(url)}" target="_blank" rel="noopener noreferrer">${t("Fuente")}</a>` : "";
    const counts = current
        ? t("Lista vigente desde el {date}: {forbidden} prohibidas, {limited} limitadas, {semi} semi-limitadas.", {
              date: formatDate(current.effective_date),
              forbidden: current.counts.forbidden,
              limited: current.counts.limited,
              semi: current.counts.semi_limited
          })
        : "";
    const since = current
        ? `<small>${h(counts)}${source}</small>`
        : `<small>${t("Todavía no hay una lista importada para este formato.")}</small>`;
    let body;
    if (next) {
        body = `<div class="cd" data-countdown="${h(next.date)}" aria-live="off"></div><small>${h(t(next.note))}</small>`;
    } else {
        const days = current ? Math.max(0, Math.floor((Date.now() - Date.parse(current.effective_date)) / DAY_MS)) : 0;
        const elapsed = current ? ` ${h(t("Han pasado {days} días desde la última.", { days }))}` : "";
        const unannounced = h(t("Konami todavía no anunció la próxima lista {format}.", { format }));
        body = `<p class="price">${t("Sin fecha anunciada")}</p><small>${unannounced}${elapsed}</small>`;
    }
    return html`
        <div class="gl pnl${format === market ? " current" : ""}">
            <b>${h(t("Próxima banlist {format}", { format }))}</b>
            ${body}
            ${since}
        </div>`;
}

export function homeBanlistHtml(lists, market) {
    const other = market === "TCG" ? "OCG" : "TCG";
    return `<h3>Banlist</h3><div class="two">${homePanel(lists, market, market)}${homePanel(lists, other, market)}</div>`;
}

function tick() {
    for (const element of document.querySelectorAll("[data-countdown]")) {
        const seconds = Math.max(0, Math.floor((Date.parse(element.dataset.countdown) - Date.now()) / 1000));
        const parts = [
            [Math.floor(seconds / 86400), "días"],
            [Math.floor((seconds % 86400) / 3600), "horas"],
            [Math.floor((seconds % 3600) / 60), "min"],
            [seconds % 60, "seg"]
        ];
        element.innerHTML = parts
            .map(([value, label]) => `<div><b>${value}</b><small>${t(label)}</small></div>`)
            .join("");
    }
}

let timer;
export function startCountdowns() {
    tick();
    if (!timer) timer = setInterval(tick, 1000);
}
