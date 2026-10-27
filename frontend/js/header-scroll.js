// On phones the header slides away while scrolling down and comes back on the
// way up, so lists and cards get the whole screen. Larger screens keep it fixed.
const PHONE = window.matchMedia("(max-width: 640px)");
// Ignore tiny movements (a finger resting on the screen).
const MIN_STEP_PX = 8;

export function installHeaderScroll(header = document.querySelector("header")) {
    let last = window.scrollY;
    let pending = false;

    // Never hide it while someone is typing in it or has one of its menus open.
    const inUse = () =>
        header.contains(document.activeElement) || header.querySelector('[aria-expanded="true"]');

    function update() {
        pending = false;
        const y = window.scrollY;
        if (Math.abs(y - last) < MIN_STEP_PX) return;
        const hide = PHONE.matches && y > last && y > header.offsetHeight && !inUse();
        header.classList.toggle("tucked", hide);
        last = y;
    }

    window.addEventListener(
        "scroll",
        () => {
            if (pending) return;
            pending = true;
            requestAnimationFrame(update);
        },
        { passive: true }
    );
    // Moving into the header with the keyboard shows it again.
    header.addEventListener("focusin", () => header.classList.remove("tucked"));
    PHONE.addEventListener("change", () => header.classList.remove("tucked"));
}
