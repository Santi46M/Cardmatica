// A larger image of the card next to the pointer while hovering its name or
// its image, in the list, the grid or the home page. Mouse only: on touch
// screens a tap opens the card directly.
//
// It is a popover, so the browser draws it in the top layer, above the header,
// the banner and any open window, whatever their z-index.
import { previewHtml } from "./catalog-view.js";
import { HOVER_PREVIEW } from "./config.js";

// lookup(id) returns the card shown on the page with that id.
export function installCardPreview({ lookup }) {
    const preview = document.createElement("div");
    preview.id = "card-preview";
    preview.className = "card-preview gl";
    preview.hidden = true;
    preview.popover = "manual";
    preview.setAttribute("aria-hidden", "true");
    document.body.append(preview);
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    let timer;
    let target;

    function hidePreview() {
        clearTimeout(timer);
        target = null;
        if (preview.hidden) return;
        preview.hidden = true;
        if (preview.matches(":popover-open")) preview.hidePopover();
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

    // On entering a card, and on moving over one after a scroll hid the preview.
    function consider(event) {
        // The "!" of a provisional image keeps its own explanation.
        if (event.target.closest(".img-warn")) return hidePreview();
        const hovered = event.target.closest("[data-preview]");
        if (!canHover.matches || !hovered || hovered === target) return;
        const card = lookup(hovered.dataset.preview);
        if (!card) return;
        target = hovered;
        clearTimeout(timer);
        timer = setTimeout(() => {
            preview.innerHTML = previewHtml(card);
            preview.hidden = false;
            preview.showPopover?.();
            place(event.clientX, event.clientY);
        }, HOVER_PREVIEW.delayMs);
    }

    document.addEventListener("pointerover", consider);
    document.addEventListener("pointermove", (event) => {
        if (!preview.hidden && target) place(event.clientX, event.clientY);
        else consider(event);
    });
    document.addEventListener("pointerout", (event) => {
        if (target && !target.contains(event.relatedTarget)) hidePreview();
    });
    window.addEventListener("scroll", hidePreview, { passive: true });
    return { hidePreview };
}
