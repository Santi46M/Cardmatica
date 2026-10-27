// The page's language, at the far right of the header: a flag and its code,
// opening the three languages with their flags. Choosing one reloads the page
// in it (window.I18N.choose, frontend/i18n.js).
//
// Spanish shows the Mercosur flag, the region the site serves; Portuguese,
// Brazil's; English, the United States'.
import { html } from "./html.js";
import { lang, t } from "./lang.js";

// A five-pointed star centred on (x, y), for the flags below.
function star(x, y, size) {
    const points = Array.from({ length: 10 }, (_, index) => {
        const radius = index % 2 ? size * 0.42 : size;
        const angle = (Math.PI / 5) * index - Math.PI / 2;
        return `${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`;
    });
    return `<polygon points="${points.join(" ")}"/>`;
}

// Drawn on a 30 × 20 grid.
const FLAGS = {
    // White field, the Southern Cross in blue over a green horizon.
    es: `<rect width="30" height="20" fill="#fff"/><path d="M4 17.5Q15 9.5 26 17.5" fill="none" stroke="#1d9a46" stroke-width="2.4" stroke-linecap="round"/><g fill="#1a3f8f">${star(15, 3.4, 2.6)}${star(9.6, 7.8, 2.4)}${star(20.4, 8.2, 2.2)}${star(15, 12.4, 2.6)}${star(18.4, 11.2, 1.2)}</g>`,
    pt: '<rect width="30" height="20" fill="#009b3a"/><path d="M15 2.4 27.4 10 15 17.6 2.6 10Z" fill="#fedf00"/><circle cx="15" cy="10" r="4.3" fill="#002776"/><path d="M10.9 9.2q4.3-1 8.3 1.4" stroke="#fff" stroke-width=".9" fill="none"/>',
    // Thirteen stripes and the blue canton.
    en: `<rect width="30" height="20" fill="#fff"/><g fill="#b22234">${Array.from(
        { length: 7 },
        (_, index) => `<rect y="${(index * 40) / 13}" width="30" height="${20 / 13}"/>`
    ).join("")}</g><rect width="12" height="${140 / 13}" fill="#3c3b6e"/><g fill="#fff">${[2, 6, 10]
        .flatMap((x) => [2.2, 5.4, 8.6].map((y) => `<circle cx="${x}" cy="${y}" r=".75"/>`))
        .join("")}</g>`
};

const flag = (code) => `<svg class="lang-flag" viewBox="0 0 30 20" aria-hidden="true">${FLAGS[code]}</svg>`;
const CHEVRON =
    '<svg class="lang-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function installLanguageMenu() {
    const languages = window.I18N.languages;
    const current = languages.find(([code]) => code === lang)?.[1] || lang;
    const items = languages
        .map(
            ([code, name]) =>
                `<button role="menuitemradio" aria-checked="${code === lang}" data-lang-pick="${code}" lang="${code}">${flag(code)}<span>${name}</span></button>`
        )
        .join("");
    const wrap = document.createElement("div");
    wrap.className = "lang-menu";
    wrap.innerHTML = html`
        <button class="lang-button" id="lang-button" aria-haspopup="menu" aria-expanded="false" aria-controls="lang-list" aria-label="${t("Idioma")}: ${current}" title="${t("Idioma")}">
            ${flag(lang)}<span class="lang-code">${lang.toUpperCase()}</span>${CHEVRON}
        </button>
        <div class="lang-list gl" id="lang-list" role="menu" aria-labelledby="lang-button" hidden>${items}</div>`;
    document.querySelector("header .bar").append(wrap);

    const button = wrap.querySelector("#lang-button");
    const list = wrap.querySelector("#lang-list");
    const options = [...list.querySelectorAll("[data-lang-pick]")];
    const close = (focusButton = false) => {
        if (list.hidden) return;
        list.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (focusButton) button.focus();
    };
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!list.hidden) return close();
        list.hidden = false;
        button.setAttribute("aria-expanded", "true");
        (options.find((option) => option.lang === lang) || options[0]).focus();
    });
    list.addEventListener("click", (event) => {
        const option = event.target.closest("[data-lang-pick]");
        if (!option) return;
        if (option.dataset.langPick === lang) return close(true);
        window.I18N.choose(option.dataset.langPick);
    });
    document.addEventListener("click", (event) => {
        if (!wrap.contains(event.target)) close();
    });
    list.addEventListener("keydown", (event) => {
        if (event.key === "Escape") return close(true);
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        options.at(next % options.length).focus();
    });
}
