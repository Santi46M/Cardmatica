// A larger image of the card next to the pointer while hovering its name in
// the list. Mouse only: on touch screens a tap opens the card directly.
import { previewHtml } from "./catalog-view.js";
import { HOVER_PREVIEW } from "./config.js";

// lookup(id) returns the card shown in the list with that id.
export function installCardPreview({ lookup }) {
    const preview = document.createElement("div");
    preview.id = "card-preview";
    preview.className = "card-preview gl";
    preview.hidden = true;
    preview.setAttribute("aria-hidden", "true");
    document.body.append(preview);
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    let timer;
    let target;

    function hidePreview() {
        clearTimeout(timer);
        target = null;
        preview.hidden = true;
    }

    function place(x, y) {
        const box = preview.getBoundingClientRect();
        const { offsetPx, marginPx } = HOVER_PREVIEW;
        // Prefer the right of the pointer; flip to the left near the window edge.
        const fitsRight = x + offsetPx + box.width <= window.innerWidth - marginPx;
        const left = fitsRight ? x + offsetPx : x - box.width - offsetPx;
        const top = Math.min(
            Math.max(marginPx, y - box.height / 2),
            window.innerHeight - box.height - marginPx
        );
        preview.style.left = `${Math.max(marginPx, left)}px`;
        preview.style.top = `${top}px`;
    }

    document.addEventListener("pointerover", (event) => {
        const hovered = event.target.closest("[data-preview]");
        if (!canHover.matches || !hovered || hovered === target) return;
        const card = lookup(hovered.dataset.preview);
        if (!card) return;
        target = hovered;
        clearTimeout(timer);
        timer = setTimeout(() => {
            preview.innerHTML = previewHtml(card);
            preview.hidden = false;
            place(event.clientX, event.clientY);
        }, HOVER_PREVIEW.delayMs);
    });
    document.addEventListener("pointermove", (event) => {
        if (!preview.hidden && target) place(event.clientX, event.clientY);
    });
    document.addEventListener("pointerout", (event) => {
        if (target && !target.contains(event.relatedTarget)) hidePreview();
    });
    window.addEventListener("scroll", hidePreview, { passive: true });
    return { hidePreview };
}
