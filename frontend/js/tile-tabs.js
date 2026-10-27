// A home section of card tiles, one tab per list ("En tendencia", "Para ti").
//
// Its grid shows at most MAX_ROWS whole rows: with 12 cards and 5 columns it
// shows 10, with 2 columns 4, so every section ends square and short whatever
// the width of the window. The columns come from styles.css (.card-grid,
// .tile-grid); this only hides the tiles left over.
import { escapeHtml, html } from "./html.js";

const h = escapeHtml;
const MAX_ROWS = 2;

function wholeRows(grid) {
    const tiles = [...grid.children];
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    // A list shorter than one row is shown whole.
    const rows = Math.min(MAX_ROWS, Math.floor(tiles.length / columns));
    const shown = rows ? rows * columns : tiles.length;
    tiles.forEach((tile, index) => {
        tile.hidden = index >= shown;
    });
}

const resized = new ResizeObserver((entries) => entries.forEach((entry) => wholeRows(entry.target)));

// lists: [{ key, label, tiles }], without empty ones. Nothing to show, no section.
export function tileTabsHtml({ name, title, lists, active }) {
    if (!lists.length) return "";
    const current = lists.find((list) => list.key === active) || lists[0];
    const tabs = lists
        .map(
            (list) =>
                `<button role="tab" aria-selected="${list === current}" data-tile-tab="${list.key}">${h(list.label)}</button>`
        )
        .join("");
    return html`
        <section class="trend" data-tile-tabs="${name}" aria-labelledby="${name}-title">
            <h2 class="sec-title" id="${name}-title">${h(title)}</h2>
            <div class="trend-tabs" role="tablist">${tabs}</div>
            <div class="card-grid tile-grid" role="tabpanel">${current.tiles}</div>
        </section>`;
}

// Puts the section in its slot; a tab redraws it with draw(key).
export function showTileTabs(slot, content) {
    if (!slot) return;
    slot.innerHTML = content;
    const grid = slot.querySelector(".tile-grid");
    if (!grid) return;
    wholeRows(grid);
    resized.observe(grid);
}

export function installTileTabs(name, { slot, draw }) {
    document.addEventListener("click", (event) => {
        const tab = event.target.closest(`[data-tile-tabs="${name}"] [data-tile-tab]`);
        if (!tab) return;
        const key = tab.dataset.tileTab;
        showTileTabs(slot(), draw(key));
        slot()?.querySelector(`[data-tile-tab="${key}"]`)?.focus();
    });
}
