import { formatDate } from "./storage.js";

const h = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])
    );

const STATUS = {
    forbidden: { label: "Prohibida", mark: "✕", tone: "forbidden" },
    limited: { label: "Limitada", mark: "1", tone: "limited" },
    semi_limited: { label: "Semi-limitada", mark: "2", tone: "semi" },
    unlimited: { label: "Permitida", mark: "✓", tone: "ok" },
    unknown: { label: "Sin estado verificado", mark: "?", tone: "unknown" }
};

// Konami has not announced the next lists. The OCG regulation has changed every
// quarter (1 Jan, 1 Apr, 1 Jul, 1 Oct), so its next date is shown as an estimate.
const NEXT = {
    OCG: {
        date: "2027-01-01T00:00:00+09:00",
        note: "Estimado según el calendario trimestral de la OCG. Konami suele anunciarla unas semanas antes."
    },
    TCG: null
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
    if (status.max_copies === null || status.max_copies === undefined) return "";
    return status.max_copies === 1 ? "1 copia" : `${status.max_copies} copias`;
}

export function statusFor(card, market) {
    return (card.banlist_status || []).find((item) => item.format === market);
}

export function badgeHtml(status) {
    if (!status) return "";
    const info = STATUS[status.status] || STATUS.unknown;
    const title = `${info.label} en ${status.format}${
        copies(status) ? ` (${copies(status)})` : ""
    } · lista del ${formatDate(status.effective_date)}`;
    return `<span class="bn bn-${info.tone}" role="img" aria-label="${h(title)}" title="${h(
        title
    )}">${info.mark}</span>`;
}

export function banlistSectionHtml(card, market) {
    const rows = (card.banlist_status || [])
        .slice()
        .sort((a, b) => (a.format === market ? -1 : b.format === market ? 1 : 0))
        .map((status) => {
            const info = STATUS[status.status] || STATUS.unknown;
            const url = safeUrl(status.source_url);
            return `<div class="bl-row${status.format === market ? " current" : ""}">${badgeHtml(
                status
            )}<div><b>${h(status.format)} · ${h(info.label)}</b>${
                copies(status) ? ` · ${h(copies(status))}` : ""
            }<small>Vigente desde el ${h(formatDate(status.effective_date))} · ${
                url
                    ? `<a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(
                          status.source_name
                      )}</a>`
                    : h(status.source_name)
            }${status.scope_note ? `<br>${h(status.scope_note)}` : ""}</small></div></div>`;
        })
        .join("");
    const imported = (card.banlist || [])
        .map(
            (entry) =>
                `<li>${h(entry.format)} · ${h(formatDate(entry.effective_date))} · ${h(
                    (STATUS[entry.status] || STATUS.unknown).label
                )}</li>`
        )
        .join("");
    return `<section class="catalog-section"><h3>Banlist</h3>${
        rows || '<p class="catalog-status">Todavía no hay listas importadas en el catálogo.</p>'
    }${
        imported
            ? `<details><summary>Estados históricos de importaciones autorizadas</summary><ul>${imported}</ul></details>`
            : ""
    }</section>`;
}

export function homeBanlistHtml(lists, market) {
    const panel = (format) => {
        const current = lists.find((item) => item.format === format);
        const next = NEXT[format];
        const url = current && safeUrl(current.source_url);
        const since = current
            ? `<small>Lista vigente desde el ${h(formatDate(current.effective_date))}: ${
                  current.counts.forbidden
              } prohibidas, ${current.counts.limited} limitadas, ${
                  current.counts.semi_limited
              } semi-limitadas.${
                  url
                      ? ` <a href="${h(url)}" target="_blank" rel="noopener noreferrer">Fuente</a>`
                      : ""
              }</small>`
            : "<small>Todavía no hay una lista importada para este formato.</small>";
        const body = next
            ? `<div class="cd" data-countdown="${h(next.date)}" aria-live="off"></div><small>${h(
                  next.note
              )}</small>`
            : `<p class="price">Sin fecha anunciada</p><small>Konami todavía no anunció la próxima lista ${h(
                  format
              )}.${
                  current
                      ? ` Han pasado ${Math.max(
                            0,
                            Math.floor((Date.now() - Date.parse(current.effective_date)) / 864e5)
                        )} días desde la última.`
                      : ""
              }</small>`;
        return `<div class="gl pnl${format === market ? " current" : ""}"><b>Próxima banlist ${h(
            format
        )}</b>${body}${since}</div>`;
    };
    return `<h3>Banlist</h3><div class="two">${panel(market)}${panel(
        market === "TCG" ? "OCG" : "TCG"
    )}</div>`;
}

function tick() {
    for (const element of document.querySelectorAll("[data-countdown]")) {
        const seconds = Math.max(
            0,
            Math.floor((Date.parse(element.dataset.countdown) - Date.now()) / 1000)
        );
        const parts = [
            [Math.floor(seconds / 86400), "días"],
            [Math.floor((seconds % 86400) / 3600), "horas"],
            [Math.floor((seconds % 3600) / 60), "min"],
            [seconds % 60, "seg"]
        ];
        element.innerHTML = parts
            .map(([value, label]) => `<div><b>${value}</b><small>${label}</small></div>`)
            .join("");
    }
}

let timer;
export function startCountdowns() {
    tick();
    if (!timer) timer = setInterval(tick, 1000);
}
