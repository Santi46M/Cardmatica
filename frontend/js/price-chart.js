// Price history of a card: the chart, its figures and the tooltip.
import { escapeHtml, html } from "./html.js";
import { formatDate, money, toEuro } from "./format.js";
import { t } from "./lang.js";

const h = escapeHtml;

const RANGES = [
    ["1M", 30],
    ["3M", 90],
    ["6M", 180],
    ["1A", 365],
    ["2A", 730],
    ["Todo", 3650]
];
// One colour per printing, from the theme (styles.css, --c1 … --c6).
const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
const SIZE = { width: 640, height: 190, left: 66, right: 10, top: 8, bottom: 22 };
let rendered = null;

function header(days) {
    const buttons = RANGES.map(
        ([label, value]) => `<button data-ph-range="${value}" aria-pressed="${value === days}">${t(label)}</button>`
    ).join("");
    return html`
        <div class="cht">
            <b>${t("Historial de precio")}</b>
            <div class="seg m" role="group" aria-label="${t("Periodo")}">${buttons}</div>
        </div>`;
}

function lastSaleHtml(sale, withCode) {
    const code = withCode ? ` · ${h(sale.code)}` : "";
    const condition = sale.condition ? ` · ${h(sale.condition)}` : "";
    return html`
        <div>
            <small>${t("Última venta")}</small>
            <b>${h(money(sale.price, sale.currency))}</b>
            <small>${h(formatDate(sale.observed_at))}${code}${condition}</small>
        </div>`;
}

// Averages shown next to the chart (last 30, 7 and 1 days), in euros, from the
// sales of the selected printing (or of every printing). null means no sales.
const SUMMARY_WINDOWS = [
    ["Media 30 días", 30],
    ["Media 7 días", 7],
    ["Media 1 día", 1]
];
const DAY_MS = 864e5;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function priceSummary(history, printingId = "", now = Date.now()) {
    if (!history) return null;
    const sales = history.points
        .filter((item) => !printingId || item.printing_id === printingId)
        .map((item) => ({ time: Date.parse(item.observed_at), euro: toEuro(item.price, item.currency) }))
        .filter((item) => item.euro !== null);
    const last = printingId ? history.points.filter((item) => item.printing_id === printingId).at(-1) : history.last_sale;
    const averages = SUMMARY_WINDOWS.map(([label, days]) => {
        const recent = sales.filter((item) => item.time >= now - days * DAY_MS).map((item) => item.euro);
        return [label, recent.length ? average(recent) : null];
    });
    return { last: last || null, averages };
}

// The chart itself: three price lines, the dates at both ends, one line (and
// its dots) per printing, and an invisible area that follows the pointer.
function chartSvg(series, keys, points) {
    const values = points.map((item) => item.euro);
    const times = points.map((item) => item.time);
    let low = Math.min(...values);
    let high = Math.max(...values);
    const padding = (high - low) * 0.12 || high * 0.1 || 1;
    low = Math.max(0, low - padding);
    high += padding;
    const start = Math.min(...times);
    const end = Math.max(...times);
    const { width, height, left, right, top, bottom } = SIZE;
    const floor = height - bottom;
    const x = (time) => left + ((time - start) / (end - start || 1)) * (width - left - right);
    const y = (value) => top + (1 - (value - low) / (high - low)) * (height - top - bottom);

    let svg = "";
    for (let step = 0; step < 3; step++) {
        const value = low + ((high - low) * step) / 2;
        svg += html`
            <line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="ch-grid"/>
            <text x="${left - 6}" y="${y(value) + 4}" text-anchor="end" font-size="11" class="ch-axis">${h(window.formatPrice(value))}</text>`;
    }
    svg += html`
        <text x="${left}" y="${height - 5}" font-size="11" class="ch-axis">${h(formatDate(start))}</text>
        <text x="${width - right}" y="${height - 5}" text-anchor="end" font-size="11" class="ch-axis">${h(formatDate(end))}</text>`;
    keys.forEach((key, index) => {
        const line = series.get(key);
        const color = COLORS[index % COLORS.length];
        const path = line
            .map((item, step) => `${step ? "L" : "M"}${x(item.time).toFixed(1)} ${y(item.euro).toFixed(1)}`)
            .join("");
        // With a single printing, the area under its line is shaded.
        if (keys.length === 1 && line.length > 1)
            svg += `<path d="${path}L${x(line[line.length - 1].time)} ${floor}L${x(line[0].time)} ${floor}Z" class="ch-area"/>`;
        if (line.length > 1)
            svg += `<path d="${path}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round"/>`;
        const radius = line.length > 1 ? 2.5 : 4;
        svg += line
            .map((item) => `<circle cx="${x(item.time).toFixed(1)}" cy="${y(item.euro).toFixed(1)}" r="${radius}" style="fill:${color}"/>`)
            .join("");
    });
    svg += html`
        <line id="ph-cursor" y1="${top}" y2="${floor}" class="ch-cursor" style="display:none"/>
        <rect id="ph-hit" x="${left}" y="0" width="${width - left - right}" height="${height}" fill="transparent"/>`;
    rendered = { series, keys, start, end, x };
    return svg;
}

// The figures under the chart: last sale, average, lowest and highest, change.
function statsHtml(points, last, printingId) {
    const values = points.map((item) => item.euro);
    const first = points[0].euro;
    const final = points[points.length - 1].euro;
    const change = first ? (final / first - 1) * 100 : 0;
    const sales = t(points.length === 1 ? "{count} venta" : "{count} ventas", { count: points.length });
    const range = `${h(window.formatPrice(Math.min(...values)))} / ${h(window.formatPrice(Math.max(...values)))}`;
    return html`
        <div class="cs">
            ${lastSaleHtml(last, !printingId)}
            <div><small>${t("Media del periodo")}</small><b>${h(window.formatPrice(average(values)))}</b><small>${sales}</small></div>
            <div><small>${t("Mínimo / máximo")}</small><b>${range}</b></div>
            <div><small>${t("Variación")}</small><b class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</b></div>
        </div>
        <small class="catalog-status">${t("Ventas completadas en Cardmática, convertidas a la moneda elegida con tipos de cambio aproximados.")}</small>`;
}

// stats: false leaves out the figures under the chart, for layouts that show
// priceSummary() elsewhere.
export function priceChartHtml(history, { printingId = "", days = 365, stats = true } = {}) {
    if (history === undefined) return `${header(days)}<p class="catalog-status">${t("Cargando historial…")}</p>`;
    if (history === null)
        return `${header(days)}<p class="catalog-status" role="alert">${t("No se pudo cargar el historial de precios.")}</p>`;
    const all = history.points.filter((item) => !printingId || item.printing_id === printingId);
    const last = printingId ? all[all.length - 1] : history.last_sale;
    if (!last) {
        rendered = null;
        const none = printingId
            ? "Todavía no hay ventas registradas de esta impresión en Cardmática. El historial se completa con cada pedido finalizado."
            : "Todavía no hay ventas registradas de esta carta en Cardmática. El historial se completa con cada pedido finalizado.";
        return `${header(days)}<p class="empty">${t(none)}</p>`;
    }
    const cut = Date.now() - days * DAY_MS;
    const points = all
        .filter((item) => Date.parse(item.observed_at) >= cut)
        .map((item) => ({ ...item, time: Date.parse(item.observed_at), euro: toEuro(item.price, item.currency) }))
        .filter((item) => item.euro !== null);
    if (!points.length) {
        rendered = null;
        const quiet = t("Sin ventas en este periodo. La última se registró el {date} por {price}.", {
            date: formatDate(last.observed_at),
            price: money(last.price, last.currency)
        });
        return `${header(days)}<div class="cs">${lastSaleHtml(last, !printingId)}</div><div class="warn">${h(quiet)}</div>`;
    }
    const series = new Map();
    for (const item of points) {
        if (!series.has(item.printing_id)) series.set(item.printing_id, []);
        series.get(item.printing_id).push(item);
    }
    const keys = [...series.keys()];
    const legendChips = keys
        .map((key, index) => {
            const first = series.get(key)[0];
            return `<span class="chip"><span style="color:${COLORS[index % COLORS.length]}">●</span> ${h(first.code)} · ${h(first.rarity)}</span>`;
        })
        .join("");
    const legend = keys.length > 1 ? `<div class="ph-legend">${legendChips}</div>` : "";
    const label = t("Historial de precio: {count} ventas en el periodo", { count: points.length });
    const { width, height } = SIZE;
    const chart = html`
        ${header(days)}
        ${legend}
        <svg id="ph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${chartSvg(series, keys, points)}</svg>
        <div class="tip" id="ph-tip"></div>`;
    return stats ? chart + statsHtml(points, last, printingId) : chart;
}

document.addEventListener("pointermove", (event) => {
    const tip = document.getElementById("ph-tip");
    const cursor = document.getElementById("ph-cursor");
    if (!tip || !cursor) return;
    if (!rendered || event.target.id !== "ph-hit") {
        tip.style.display = "none";
        cursor.style.display = "none";
        return;
    }
    const box = document.getElementById("ph-svg").getBoundingClientRect();
    const { width, left, right } = SIZE;
    const position = ((event.clientX - box.left) / box.width) * width;
    const time =
        rendered.start +
        ((position - left) / (width - left - right)) * (rendered.end - rendered.start);
    let nearest;
    for (const key of rendered.keys)
        for (const item of rendered.series.get(key))
            if (!nearest || Math.abs(item.time - time) < Math.abs(nearest.time - time)) nearest = item;
    const lineX = rendered.x(nearest.time);
    cursor.setAttribute("x1", lineX);
    cursor.setAttribute("x2", lineX);
    cursor.style.display = "";
    const units = nearest.quantity > 1 ? ` × ${nearest.quantity}` : "";
    tip.innerHTML = `<b>${h(formatDate(nearest.observed_at))}</b><div>${h(nearest.code)}: ${h(money(nearest.price, nearest.currency))}${units}</div>`;
    tip.style.display = "block";
    const container = tip.parentElement.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(event.clientX - container.left + 12, 0), container.width - 180)}px`;
    tip.style.top = "40px";
});
