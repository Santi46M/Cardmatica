// Suggestions under the search box while typing: a few cards with their
// thumbnail and type line, as on Cardmarket and TCGplayer. Arrow keys move,
// Enter opens the card, Escape closes the list. The catalogue below keeps
// filtering as before; this is a shortcut to one card.
import { escapeHtml } from "./html.js";
import { typeLine } from "./card-types.js";
import { assetUrl } from "./catalog-view.js";
import { SUGGEST } from "./config.js";

const h = escapeHtml;

function optionHtml(card, index, active) {
    const url = assetUrl(card.thumbnail_url);
    const thumb = url
        ? `<img src="${h(url)}" alt="" width="32" height="46" loading="lazy" decoding="async">`
        : `<span class="suggest-ph" data-kind="${h(card.types?.kind || "")}" aria-hidden="true"></span>`;
    return `<li role="option" id="q-suggest-${index}" data-suggest="${index}" aria-selected="${
        index === active
    }">${thumb}<span class="suggest-text"><b>${h(card.name)}</b><small>${h(
        typeLine(card)
    )}</small></span></li>`;
}

export function installSearchSuggest({ input, api, market, onPick }) {
    const list = document.createElement("ul");
    list.id = "q-suggest";
    list.className = "suggest";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", window.t("Cartas sugeridas"));
    list.hidden = true;
    input.closest(".search").append(list);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");

    let cards = [];
    let active = -1;
    let shownFor = "";
    let timer;
    let controller;

    const render = () => {
        list.innerHTML = cards.map((card, index) => optionHtml(card, index, active)).join("");
        list.hidden = !cards.length;
        input.setAttribute("aria-expanded", String(!list.hidden));
        if (active >= 0) input.setAttribute("aria-activedescendant", `q-suggest-${active}`);
        else input.removeAttribute("aria-activedescendant");
    };
    const close = () => {
        active = -1;
        cards = [];
        render();
    };
    const pick = (index) => {
        const card = cards[index];
        if (!card) return;
        close();
        onPick(card.id);
    };

    async function suggest() {
        const text = input.value.trim();
        controller?.abort();
        if (text.length < SUGGEST.minLength) return close();
        if (text === shownFor && cards.length) return render();
        controller = new AbortController();
        try {
            const found = await api.get(
                "suggest",
                { q: text, market: market(), limit: SUGGEST.limit, language: window.I18N.lang },
                { signal: controller.signal }
            );
            // Typing went on meanwhile: a newer request will answer.
            if (input.value.trim() !== text) return;
            cards = found;
            shownFor = text;
            active = -1;
            if (document.activeElement === input) render();
        } catch {
            // Suggestions are a shortcut; the catalogue search still works without them.
        }
    }

    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(suggest, SUGGEST.delayMs);
    });
    input.addEventListener("focus", () => {
        if (input.value.trim() === shownFor && cards.length) render();
    });
    input.addEventListener("blur", () => {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
    });
    input.addEventListener("keydown", (event) => {
        if (list.hidden) return;
        const moves = { ArrowDown: 1, ArrowUp: -1 };
        if (event.key in moves) {
            event.preventDefault();
            // -1 is the text being typed: one step past either end goes back to it.
            const next = active + moves[event.key];
            active = next < -1 ? cards.length - 1 : next >= cards.length ? -1 : next;
            render();
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(active);
        } else if (event.key === "Escape") {
            // Close the list only; the text and the results below stay.
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    });
    // Keep the focus in the box while choosing with the mouse.
    list.addEventListener("mousedown", (event) => event.preventDefault());
    list.addEventListener("click", (event) => {
        const option = event.target.closest("[data-suggest]");
        if (option) pick(Number(option.dataset.suggest));
    });
    return { close };
}
