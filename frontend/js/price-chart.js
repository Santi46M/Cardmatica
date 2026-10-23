import { escapeHtml } from "./html.js";
import { formatDate, money, toEuro } from "./format.js";

const h = escapeHtml;

export const RANGES = [
    ["1M", 30],
    ["3M", 90],
    ["6M", 180],
    ["1A", 365],
    ["2A", 730],
    ["Todo", 3650]
];
const COLORS = ["#6fd3f2", "#ffd773", "#f5aaee", "#9be58a", "#ff9b92", "#b8b2ff"];
const SIZE = { width: 640, height: 190, left: 66, right: 10, top: 8, bottom: 22 };
let rendered = null;

function header(days) {
    return `<div class="cht"><b>Historial de precio</b><div class="seg m" role="group" aria-label="Periodo">${RANGES.map(
        ([label, value]) =>
            `<button data-ph-range="${value}" aria-pressed="${value === days}">${label}</button>`
    ).join("")}</div></div>`;
}

function lastSaleHtml(sale, withCode) {
    return `<div><small>Última venta</small><b>${h(money(sale.price, sale.currency))}</b><small>${h(
        formatDate(sale.observed_at)
    )}${withCode ? ` · ${h(sale.code)}` : ""}${
        sale.condition ? ` · ${h(sale.condition)}` : ""
    }</small></div>`;
}

export function priceChartHtml(history, { printingId = "", days = 365 } = {}) {
    if (history === undefined)
        return `${header(days)}<p class="catalog-status">Cargando historial…</p>`;
    if (history === null)
        return `${header(
            days
        )}<p class="catalog-status" role="alert">No se pudo cargar el historial de precios.</p>`;
    const all = history.points.filter((item) => !printingId || item.printing_id === printingId);
    const last = printingId ? all[all.length - 1] : history.last_sale;
    if (!last) {
        rendered = null;
        return `${header(days)}<p class="empty">Todavía no hay ventas registradas ${
            printingId ? "de esta impresión" : "de esta carta"
        } en Cardmática. El historial se completa con cada pedido finalizado.</p>`;
    }
    const cut = Date.now() - days * 864e5;
    const points = all
        .filter((item) => Date.parse(item.observed_at) >= cut)
        .map((item) => ({ ...item, time: Date.parse(item.observed_at), euro: toEuro(item.price, item.currency) }))
        .filter((item) => item.euro !== null);
    if (!points.length) {
        rendered = null;
        return `${header(days)}<div class="cs">${lastSaleHtml(
            last,
            !printingId
        )}</div><div class="warn">Sin ventas en este periodo. La última se registró el ${h(
            formatDate(last.observed_at)
        )} por ${h(money(last.price, last.currency))}.</div>`;
    }
    const series = new Map();
    for (const item of points) {
        if (!series.has(item.printing_id)) series.set(item.printing_id, []);
        series.get(item.printing_id).push(item);
    }
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
    const x = (time) => left + ((time - start) / (end - start || 1)) * (width - left - right);
    const y = (value) => top + (1 - (value - low) / (high - low)) * (height - top - bottom);
    let svg = "";
    for (let step = 0; step < 3; step++) {
        const value = low + ((high - low) * step) / 2;
        svg += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(
            value
        )}" stroke="rgba(170,215,255,.15)"/><text x="${left - 6}" y="${
            y(value) + 4
        }" text-anchor="end" font-size="11" fill="#9db0c6">${h(window.formatPrice(value))}</text>`;
    }
    svg += `<text x="${left}" y="${height - 5}" font-size="11" fill="#9db0c6">${h(
        formatDate(start)
    )}</text><text x="${width - right}" y="${
        height - 5
    }" text-anchor="end" font-size="11" fill="#9db0c6">${h(formatDate(end))}</text>`;
    const keys = [...series.keys()];
    keys.forEach((key, index) => {
        const line = series.get(key);
        const color = COLORS[index % COLORS.length];
        const path = line
            .map((item, step) => `${step ? "L" : "M"}${x(item.time).toFixed(1)} ${y(item.euro).toFixed(1)}`)
            .join("");
        if (keys.length === 1 && line.length > 1)
            svg += `<path d="${path}L${x(line[line.length - 1].time)} ${height - bottom}L${x(
                line[0].time
            )} ${height - bottom}Z" fill="rgba(111,211,242,.12)"/>`;
        if (line.length > 1)
            svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
        svg += line
            .map(
                (item) =>
                    `<circle cx="${x(item.time).toFixed(1)}" cy="${y(item.euro).toFixed(
                        1
                    )}" r="${line.length > 1 ? 2.5 : 4}" fill="${color}"/>`
            )
            .join("");
    });
    svg += `<line id="ph-cursor" y1="${top}" y2="${
        height - bottom
    }" stroke="rgba(255,255,255,.4)" style="display:none"/><rect id="ph-hit" x="${left}" y="0" width="${
        width - left - right
    }" height="${height}" fill="transparent"/>`;
    rendered = { series, keys, start, end, x };
    const first = points[0].euro;
    const final = points[points.length - 1].euro;
    const change = first ? ((final / first) - 1) * 100 : 0;
    const legend =
        keys.length > 1
            ? `<div class="ph-legend">${keys
                  .map(
                      (key, index) =>
                          `<span class="chip"><span style="color:${
                              COLORS[index % COLORS.length]
                          }">●</span> ${h(series.get(key)[0].code)} · ${h(
                              series.get(key)[0].rarity
                          )}</span>`
                  )
                  .join("")}</div>`
            : "";
    return `${header(days)}${legend}<svg id="ph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historial de precio: ${
        points.length
    } ventas en el periodo">${svg}</svg><div class="tip" id="ph-tip"></div><div class="cs">${lastSaleHtml(
        last,
        !printingId
    )}<div><small>Media del periodo</small><b>${h(
        window.formatPrice(values.reduce((sum, value) => sum + value, 0) / values.length)
    )}</b><small>${points.length} ${points.length === 1 ? "venta" : "ventas"}</small></div><div><small>Mínimo / máximo</small><b>${h(
        window.formatPrice(Math.min(...values))
    )} / ${h(window.formatPrice(Math.max(...values)))}</b></div><div><small>Variación</small><b class="${
        change >= 0 ? "up" : "down"
    }">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</b></div></div><small class="catalog-status">Ventas completadas en Cardmática, convertidas a la moneda elegida con tipos de cambio aproximados.</small>`;
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
    tip.innerHTML = `<b>${h(formatDate(nearest.observed_at))}</b><div>${h(nearest.code)}: ${h(
        money(nearest.price, nearest.currency)
    )}${nearest.quantity > 1 ? ` × ${nearest.quantity}` : ""}</div>`;
    tip.style.display = "block";
    const container = tip.parentElement.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(event.clientX - container.left + 12, 0), container.width - 180)}px`;
    tip.style.top = "40px";
});
