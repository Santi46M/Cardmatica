import { escapeHtml } from "./html.js";
import { NEXT_BANLIST } from "./config.js";
import { formatDate } from "./format.js";
import { t } from "./lang.js";

const h = escapeHtml;

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
    const title = `${t("{status} en {format}", { status: t(info.label), format: status.format })}${
        copies(status) ? ` (${copies(status)})` : ""
    } · ${t("lista del {date}", { date: formatDate(status.effective_date) })}`;
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
            )}<div><b>${h(status.format)} · ${h(t(info.label))}</b>${
                copies(status) ? ` · ${h(copies(status))}` : ""
            }<small>${h(t("Vigente desde el {date}", { date: formatDate(status.effective_date) }))} · ${
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
                    t((STATUS[entry.status] || STATUS.unknown).label)
                )}</li>`
        )
        .join("");
    return `<section class="catalog-section"><h3>Banlist</h3>${
        rows || `<p class="catalog-status">${t("Todavía no hay listas importadas en el catálogo.")}</p>`
    }${
        imported
            ? `<details><summary>${t("Estados históricos de importaciones autorizadas")}</summary><ul>${imported}</ul></details>`
            : ""
    }</section>`;
}

export function homeBanlistHtml(lists, market) {
    const panel = (format) => {
        const current = lists.find((item) => item.format === format);
        const next = NEXT_BANLIST[format];
        const url = current && safeUrl(current.source_url);
        const since = current
            ? `<small>${h(
                  t("Lista vigente desde el {date}: {forbidden} prohibidas, {limited} limitadas, {semi} semi-limitadas.", {
                      date: formatDate(current.effective_date),
                      forbidden: current.counts.forbidden,
                      limited: current.counts.limited,
                      semi: current.counts.semi_limited
                  })
              )}${
                  url
                      ? ` <a href="${h(url)}" target="_blank" rel="noopener noreferrer">${t("Fuente")}</a>`
                      : ""
              }</small>`
            : `<small>${t("Todavía no hay una lista importada para este formato.")}</small>`;
        const body = next
            ? `<div class="cd" data-countdown="${h(next.date)}" aria-live="off"></div><small>${h(
                  t(next.note)
              )}</small>`
            : `<p class="price">${t("Sin fecha anunciada")}</p><small>${h(
                  t("Konami todavía no anunció la próxima lista {format}.", { format })
              )}${
                  current
                      ? ` ${h(
                            t("Han pasado {days} días desde la última.", {
                                days: Math.max(0, Math.floor((Date.now() - Date.parse(current.effective_date)) / 864e5))
                            })
                        )}`
                      : ""
              }</small>`;
        return `<div class="gl pnl${format === market ? " current" : ""}"><b>${h(
            t("Próxima banlist {format}", { format })
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
            .map(([value, label]) => `<div><b>${value}</b><small>${t(label)}</small></div>`)
            .join("");
    }
}

let timer;
export function startCountdowns() {
    tick();
    if (!timer) timer = setInterval(tick, 1000);
}
