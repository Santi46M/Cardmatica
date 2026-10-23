// "↑ Arriba" button that appears after scrolling down a long list.
import { BACK_TO_TOP_PX } from "./config.js";

// focus: the element that receives focus at the top (the search box).
export function installBackToTop({ focus }) {
    const button = document.createElement("button");
    button.id = "to-top";
    button.className = "btn to-top";
    button.type = "button";
    button.hidden = true;
    button.textContent = "↑ Arriba";
    button.setAttribute("aria-label", "Volver arriba");
    document.body.append(button);
    button.addEventListener("click", () => {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
        focus.focus({ preventScroll: true });
    });
    window.addEventListener(
        "scroll",
        () => {
            // Shown after a screen's height, or the threshold on tall screens.
            button.hidden = window.scrollY < Math.min(BACK_TO_TOP_PX, window.innerHeight);
        },
        { passive: true }
    );
}
