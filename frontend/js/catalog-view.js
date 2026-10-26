// HTML of the real catalogue: list rows, tiles, previews, the home page and
// the card window. Every value from the API goes through h() (escapeHtml).
import { badgeHtml, banlistSectionHtml, statusFor } from "./banlist.js";
import { formatDate, money } from "./format.js";
import { typeLine } from "./card-types.js";
import { escapeHtml, html } from "./html.js";
import { lang, locale, t } from "./lang.js";
import { scopeLink } from "./collections.js";
import { editionName, languageName, printingOptionsHtml } from "./printings.js";
import { rarityBadge } from "./rarities.js";
import { photoUploadHtml } from "./photos.js";

const h = escapeHtml;
const chip = (value) => `<span class="chip">${h(value)}</span>`;

function section(title, content) {
    if (!content) return "";
    return html`
        <section class="catalog-section">
            <h3>${h(t(title))}</h3>
            ${content}
        </section>`;
}

// One row of the facts list beside the chart; empty values are left out.
const factRow = (label, value) => (value ? `<div><dt>${h(t(label))}</dt><dd>${value}</dd></div>` : "");

const BANLIST_LABELS = {
    forbidden: "Prohibida",
    limited: "Limitada",
    semi_limited: "Semi-limitada",
    unlimited: "Permitida"
};
const banlistLabel = (status) => t(BANLIST_LABELS[status.status] || "Sin estado verificado");

// Tabs of the info panel. (Demo cards draw only "Info": they cannot go to a list.)
const cardTabs = () => html`
    <div class="cd-tabs" role="tablist">
        <button role="tab" aria-selected="true" data-cd-tab="info">ⓘ ${t("Info")}</button>
        <button role="tab" aria-selected="false" data-cd-tab="wants">♥ ${t("Deseados")}</button>
    </div>`;

const saleDate = (sale) => h(formatDate(sale.observed_at));
const salePrice = (sale) => h(money(sale.price, sale.currency));

// Prices beside the chart, from Cardmática's own sales.
export function pricesHtml(summary) {
    if (summary === undefined) return factRow("Última venta", t("Cargando…"));
    if (!summary) return "";
    const value = (euros) => (euros === null ? "—" : h(window.formatPrice(euros)));
    const last = summary.last ? `${salePrice(summary.last)} <small>${saleDate(summary.last)}</small>` : "—";
    return factRow("Última venta", last) + summary.averages.map(([label, euros]) => factRow(label, value(euros))).join("");
}

function creditLink(value, label) {
    if (!value) return "";
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `<a href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(label)}</a>`;
}

// Only our own image addresses are ever put in an <img>.
export function assetUrl(value) {
    if (!value) return null;
    const url = new URL(value, location.origin);
    const ours = url.origin === location.origin && /^\/api\/v1\/(images|artworks)\/[0-9a-f-]+$/.test(url.pathname);
    return ours ? url.href : null;
}

// Artwork shown only by the private preview has no commercial licence: mark it
// so nobody mistakes it for an image that can ship.
const PROVISIONAL = () =>
    t("Imagen provisional: ilustración sin licencia comercial, visible solo en la vista de prueba privada. No publicar.");

function provisional(image) {
    return image?.usage_scope === "local_preview_only";
}

function withWarning(imageTag, image) {
    if (!provisional(image)) return imageTag;
    return html`
        <span class="img-wrap">
            ${imageTag}
            <span class="img-warn" tabindex="0" role="img" aria-label="${h(PROVISIONAL())}" data-tip="${h(PROVISIONAL())}">!</span>
        </span>`;
}

function imageHtml(image, name, large = false) {
    const url = assetUrl(large ? image?.url : image?.thumbnail_url || image?.url);
    const size = large ? "large" : "";
    if (!url) {
        const message = large
            ? "Imagen de esta impresión no disponible con asociación y derechos verificados"
            : "Sin imagen";
        return html`
            <div class="catalog-image-fallback ${size}" role="img" aria-label="${t("Sin imagen verificada")}">
                ${t(message)}
            </div>`;
    }
    const [width, height] = large ? [240, 350] : [48, 70];
    return withWarning(
        `<img class="catalog-image ${size}" src="${h(url)}" alt="${h(name)}" loading="lazy" decoding="async" width="${width}" height="${height}">`,
        image
    );
}

// The printing's own picture or, without one, the card's general illustration
// with the chosen printing's rarity drawn over it, so the badge says what the
// picture cannot.
function pictureHtml(image, name, printing) {
    const picture = imageHtml(image, name, true);
    if (image?.association !== "card_artwork" || !printing?.rarity || printing.rarity === "Unknown") return picture;
    return `<span class="img-wrap">${picture}<span class="rarity-stamp">${rarityBadge(printing)}</span></span>`;
}

export function pager(data, kind = "catalog") {
    const last = Math.max(1, Math.ceil(data.total / data.page_size));
    const count = t(kind === "printing" ? "{count} impresiones" : "{count} cartas", { count: data.total });
    return html`
        <div class="catalog-pager" aria-label="${t("Paginación")}">
            <button class="ghost" data-${kind}-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>${t("Anterior")}</button>
            <span>
                ${t("Página {page} de {pages}", { page: data.page, pages: last })}
                <span class="pager-total"> · ${count}</span>
            </span>
            <button class="ghost" data-${kind}-page="${data.page + 1}" ${data.page >= last ? "disabled" : ""}>${t("Siguiente")}</button>
        </div>`;
}

// Type, subtypes and attribute matter less than price to a buyer who knows the
// card, so they share one muted line under the name instead of a column of chips.
const cardMeta = typeLine;

function saleCell(sale) {
    if (!sale) return `<td class="num"><span class="muted">${t("Sin ventas")}</span></td>`;
    return `<td class="num"><b class="price">${salePrice(sale)}</b><small>${saleDate(sale)}</small></td>`;
}

const NO_CARDS = "No hay cartas almacenadas que coincidan con estos filtros.";

function catalogRow(card) {
    const meta = cardMeta(card);
    const kind = card.image?.association === "card_artwork" ? "ilustración general" : "imagen de impresión";
    return html`
        <tr class="catalog-row" tabindex="0" data-catalog-card="${h(card.id)}" aria-label="${h(`${card.name}, ${meta}`)}">
            <td>
                <div class="nm" data-preview="${h(card.id)}">
                    ${imageHtml(card.image, `${card.name} — ${t(kind)}`)}
                    <div class="nm-text">
                        <b>${badgeHtml(card.market_banlist)}${h(card.name)}</b>
                        <small class="meta" title="${h(meta)}">${h(meta)}</small>
                    </div>
                </div>
            </td>
            <td class="num hide">${card.printing_count}</td>
            ${saleCell(card.last_sale)}
        </tr>`;
}

export function catalogRows(data) {
    if (!data.items.length) return `<tr><td colspan="3" class="empty">${t(NO_CARDS)}</td></tr>`;
    return data.items.map(catalogRow).join("");
}

function gridImage(card) {
    const url = assetUrl(card.image?.url || card.image?.thumbnail_url);
    if (!url)
        return `<div class="catalog-image-fallback grid" role="img" aria-label="${t("Sin imagen verificada")}">${t("Sin imagen")}</div>`;
    return withWarning(
        `<img class="catalog-image grid" src="${h(url)}" alt="${h(card.name)}" loading="lazy" decoding="async" width="168" height="245">`,
        card.image
    );
}

function tilePrice(sale) {
    if (!sale) return `<span class="muted">${t("Sin ventas")}</span>`;
    return `<b class="price">${salePrice(sale)}</b><small>${saleDate(sale)}</small>`;
}

// An image-first tile, for collectors: the catalogue's grid and the home page's
// sections. Same data and click target as a table row; line says why it is there.
export function tileHtml(card, line = cardMeta(card)) {
    return html`
        <button class="card-tile gl" data-catalog-card="${h(card.id)}" data-preview="${h(card.id)}">
            ${gridImage(card)}
            <span class="card-tile-body">
                <b>${badgeHtml(card.market_banlist)}${h(card.name)}</b>
                <small class="meta" title="${h(line)}">${h(line)}</small>
                <span class="card-tile-price">${tilePrice(card.last_sale)}</span>
            </span>
        </button>`;
}

export function catalogGrid(data) {
    if (!data.items.length) return `<p class="empty">${t(NO_CARDS)}</p>`;
    return data.items.map((card) => tileHtml(card)).join("");
}

// Placeholders shaped like the content, so the layout does not jump while loading.
export function skeletonRows(count = 8) {
    return Array.from(
        { length: count },
        (_, index) => html`
            <tr class="sk-row" aria-hidden="true">
                <td>
                    <div class="nm">
                        <span class="sk sk-thumb"></span>
                        <div class="nm-text">
                            <span class="sk sk-line" style="width:${46 + ((index * 17) % 30)}%"></span>
                            <span class="sk sk-line sk-small"></span>
                        </div>
                    </div>
                </td>
                <td class="num hide"><span class="sk sk-num"></span></td>
                <td class="num"><span class="sk sk-num"></span></td>
            </tr>`
    ).join("");
}

export function skeletonTiles(count = 12) {
    const tile = html`
        <div class="card-tile gl sk-tile" aria-hidden="true">
            <span class="sk sk-art"></span>
            <span class="sk sk-line"></span>
            <span class="sk sk-line sk-small"></span>
        </div>`;
    return tile.repeat(count);
}

// The small window shown when hovering a card name.
export function previewHtml(card) {
    const image = assetUrl(card.image?.url || card.image?.thumbnail_url);
    const picture = image
        ? `<img src="${h(image)}" alt="${h(card.name)}" width="200" height="292">`
        : `<div class="catalog-image-fallback preview-fallback">${t("Sin imagen verificada")}</div>`;
    const warning =
        image && provisional(card.image)
            ? `<small class="warn-text"><span class="img-warn inline" aria-hidden="true">!</span> ${t("Imagen provisional, sin licencia")}</small>`
            : "";
    const printings = t(card.printing_count === 1 ? "{count} impresión" : "{count} impresiones", {
        count: card.printing_count
    });
    const sale = card.last_sale;
    const price = sale
        ? html`
            <div class="preview-price">
                <small>${t("Última venta")}</small>
                <b>${salePrice(sale)}</b>
                <small>${saleDate(sale)} · ${h(sale.code)}</small>
            </div>`
        : `<small class="muted">${t("Sin ventas registradas")}</small>`;
    return html`
        ${picture}
        <div class="preview-body">
            <b>${badgeHtml(card.market_banlist)}${h(card.name)}</b>
            ${warning}
            <small>${h(cardMeta(card))}</small>
            <small>${printings}</small>
            ${price}
        </div>`;
}

// The top of the home page: its one <h1> and the calls to action, visible
// without scrolling; the sections under it arrive on their own (catalog.js).
export function homeHtml({ signedIn = false } = {}) {
    const second = signedIn
        ? `<button class="ghost" data-go="Deseados">${t("Mi lista de deseados")}</button>`
        : `<button class="ghost" data-go="Acceso" data-auth-mode="register">${t("Crear cuenta gratis")}</button>`;
    return html`
        <section class="hero2 gl">
            <h1>${t("Cartas de <b>Yu-Gi-Oh!</b> para el Mercosur")}</h1>
            <p>${t("Busca cualquier carta TCG u OCG, compara sus impresiones y rarezas, revisa la banlist y arma tus listas de deseados con avisos de precio.")}</p>
            <p class="hero-actions">
                <button class="btn" data-go="Todas">${t("Explorar cartas")}</button>
                ${second}
            </p>
        </section>
        <div id="home-trending"></div>
        <div id="home-for-you"></div>
        <div id="home-banlist"></div>
        <div id="home-news"></div>`;
}

// ---- The card window ----------------------------------------------------------

const SOURCE_HOSTS = ["www.db.yugioh-card.com", "yugipedia.com", "db.ygoprodeck.com"];

function sourceLinksHtml(card) {
    return card.sources
        .map((source) => {
            const url = new URL(source.url);
            if (url.protocol !== "https:" || !SOURCE_HOSTS.includes(url.hostname)) return "";
            const checked = new Date(source.fetched_at).toLocaleDateString(locale);
            const link = `<a href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(source.source)}</a>`;
            return `<li>${link} · ${h(source.validation_status)} · ${h(checked)}</li>`;
        })
        .join("");
}

function textDetails(label, text) {
    if (!text) return "";
    return `<details><summary>${t(label)}</summary><p class="card-text">${h(text.text)}</p></details>`;
}

function errataHtml(card) {
    return card.errata
        .map(
            (entry) => html`
                <article class="catalog-erratum">
                    <b>${h(entry.language)}${entry.effective_date ? ` · ${h(entry.effective_date)}` : ""}</b>
                    <small>${h(entry.classification)}</small>
                    <p>${h(entry.explanation)}</p>
                    ${textDetails("Texto anterior documentado", entry.old_text)}
                    ${textDetails("Texto posterior documentado", entry.new_text)}
                </article>`
        )
        .join("");
}

function textHistoryHtml(card) {
    return card.texts
        .filter((entry) => !entry.is_current)
        .map((entry) => {
            const kind = entry.is_official ? "Versión oficial anterior" : "Versión documentada por la comunidad";
            const since = entry.valid_from ? ` · ${h(entry.valid_from)}` : "";
            return html`
                <details>
                    <summary>${h(entry.language)} · ${t(kind)}${since}</summary>
                    <p class="card-text">${h(entry.text)}</p>
                </details>`;
        })
        .join("");
}

// Language names go in lowercase inside a Spanish or Portuguese sentence, not in English.
const inSentence = (name) => (lang === "en" ? name : name.toLowerCase());

// The visitor's language if the card has it; else English, else the printing's.
function currentText(card, printing) {
    const texts = card.texts.filter((text) => text.is_current);
    return (
        texts.find((item) => item.language === lang) ||
        texts.find((item) => item.language === "en") ||
        texts.find((item) => item.language === printing?.language) ||
        texts[0]
    );
}

function cardTextHtml(text) {
    if (!text) return `<p class="catalog-status">${t("Texto vigente todavía no disponible.")}</p>`;
    const kind = text.is_official ? t("Texto oficial vigente") : t("Texto de catálogo");
    const title = `${kind} · ${languageName(text.language)}`;
    // Never translated here: when the card has no text in the page's language yet, say so.
    const missing =
        text.language === lang
            ? ""
            : `<p class="catalog-status">${t("Esta carta todavía no tiene su texto en {language}; se muestra en {shown}.", {
                  language: inSentence(languageName(lang)),
                  shown: inSentence(languageName(text.language))
              })}</p>`;
    const pendulum = text.pendulum_text
        ? `<h4>${t("Efecto Péndulo")}</h4><p class="card-text">${h(text.pendulum_text)}</p>`
        : "";
    return section(title, `${missing}<p class="card-text" lang="${h(text.language)}">${h(text.text)}</p>${pendulum}`);
}

// Who made the picture, under what terms, and where it comes from.
// Who sent a printing's photo, when it is not a Yugipedia scan.
const PHOTO_ORIGIN = {
    seller: "Foto aportada por un vendedor y revisada por Cardmática.",
    staff: "Foto de Cardmática."
};

function creditHtml(image) {
    if (!image) return "";
    const origin = PHOTO_ORIGIN[image.source];
    const general =
        image.association === "card_artwork"
            ? `${t("Ilustración general: no verifica la rareza, edición o set seleccionado.")}<br>`
            : origin
              ? `${t(origin)}<br>`
              : "";
    const terms =
        image.usage_scope === "local_preview_only"
            ? t("Vista local de prueba; derechos comerciales sin verificar")
            : image.license || t("Permiso documentado");
    const licence = image.license_url ? ` · ${creditLink(image.license_url, t("Licencia"))}` : "";
    return html`
        <figcaption>
            ${general}${h(image.author || t("Autor no indicado"))} · ${h(terms)} · ${creditLink(image.source_url, t("Origen"))}${licence}
        </figcaption>`;
}

function factsHtml(card, printings, printing, market) {
    if (!printing) return `<p class="empty">${t("No hay impresiones documentadas para este mercado.")}</p>`;
    // Several printings: a list to pick one, with pages when they do not fit.
    const pages = printings.total > printings.page_size ? pager(printings, "printing") : "";
    const choice =
        printings.items.length > 1
            ? `<select id="catalog-printing" aria-label="${t("Impresión")}">${printingOptionsHtml(printings.items, printing.id)}</select>${pages}`
            : "";
    const banlist = statusFor(card, market);
    return [
        factRow("Rareza", rarityBadge(printing)),
        factRow("Número", h(printing.code)),
        factRow("Impreso en", scopeLink("set", printing.set_id, printing.set_name)),
        choice ? factRow("Impresión", choice) : "",
        factRow("Idioma", h(languageName(printing.language))),
        factRow("Edición", h(editionName(printing.edition))),
        factRow("Lanzamiento", printing.release_date ? h(formatDate(printing.release_date)) : ""),
        factRow("Banlist", banlist ? `${badgeHtml(banlist)} ${h(banlistLabel(banlist))}` : "")
    ].join("");
}

// The type line (card-types.js), then the numbers printed on the card.
function statsLine(card) {
    const defense = card.defense != null ? ` / DEF ${card.defense}` : "";
    return [
        typeLine(card),
        card.pendulum_scale != null ? t("Escala {scale}", { scale: card.pendulum_scale }) : "",
        card.atk != null ? `ATK ${card.atk}${defense}` : ""
    ]
        .filter(Boolean)
        .map(h)
        .join(" · ");
}

// Archetypes, series and related cards, each a small section when there are any.
function classificationHtml(card) {
    const groups = (items, relation, kind) =>
        items
            .filter((item) => item.relation === relation)
            .map((item) => (kind ? `<span class="chip">${scopeLink(kind, item.id, item.name)}</span>` : chip(item.name)))
            .join("");
    const complementary = [...card.archetypes, ...card.series]
        .filter((item) => ["related", "anti_supports"].includes(item.relation))
        .map((item) => chip(`${item.name} · ${item.relation}`))
        .join("");
    const related = card.relations
        .map(
            (relation) =>
                `<p>${h(relation.relation)} · <button class="lk" data-catalog-card="${h(relation.card_id)}">${t("Ver carta relacionada")}</button></p>`
        )
        .join("");
    return [
        section("Arquetipos · clasificación comunitaria", groups(card.archetypes, "member", "archetype")),
        section("Series · clasificación comunitaria", groups(card.series, "member")),
        section("Soporte a arquetipos · clasificación comunitaria", groups(card.archetypes, "supports", "archetype")),
        section("Relaciones complementarias", complementary),
        section("Relaciones entre cartas", related)
    ].join("");
}

export function detailHtml(card, printings, selectedId, { market = "TCG" } = {}) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const image = printing?.images.find((item) => item.url) || card.artworks?.find((item) => item.url);
    const banlist = statusFor(card, market);
    const ids = [card.passcode ? t("Código {code}", { code: card.passcode }) : "", card.konami_id ? `CID ${card.konami_id}` : ""]
        .filter(Boolean)
        .join(" · ");
    const subtitle = printing ? `${h(printing.set_name)} · ${t("Cartas sueltas")}` : t("Cartas sueltas");
    const imageName = `${card.name} · ${image?.association === "card_artwork" ? t("ilustración general") : printing?.code || ""}`;
    const stats = statsLine(card);
    const sources = sourceLinksHtml(card);
    return html`
        <div class="card-detail">
            <div class="cd-head">
                <div>
                    <h2>${badgeHtml(banlist)}${h(card.name)}</h2>
                    <p class="cd-sub">${subtitle}${ids ? `<br><small>${h(ids)}</small>` : ""}</p>
                </div>
                <div class="top-actions"><button class="ghost" data-close="md">${t("Cerrar")}</button></div>
            </div>
            <div class="cd-top">
                <figure class="cd-image gl">${pictureHtml(image, imageName, printing)}${creditHtml(image)}${photoUploadHtml(printing)}</figure>
                <div class="cd-info gl">
                    ${cardTabs()}
                    <div class="cd-panel" data-cd-panel="info">
                        <div class="cd-cols">
                            <div>
                                <dl class="cd-facts">${factsHtml(card, printings, printing, market)}</dl>
                                <dl class="cd-facts" id="cd-prices"></dl>
                            </div>
                            <div class="cd-chart">
                                <div id="price-history" class="chart" aria-live="polite"></div>
                                <button class="btn s cd-want" data-wl-open aria-controls="wl-picker">♥ ${t("Añadir a la lista de deseados")}</button>
                            </div>
                        </div>
                        <div class="cd-text">
                            ${stats ? `<p class="cd-stats">${stats}</p>` : ""}
                            ${cardTextHtml(currentText(card, printing))}
                        </div>
                    </div>
                    <div class="cd-panel" data-cd-panel="wants" hidden></div>
                    <div id="wl-picker"></div>
                </div>
            </div>
            <section class="cd-offers">
                <div class="gl wrap">
                    <table class="cd-table">
                        <thead>
                            <tr>
                                <th>${t("Vendedor")}</th>
                                <th>${t("Información del producto")}</th>
                                <th class="num">${t("Oferta")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="3" class="empty">${t("Todavía no hay ofertas de esta impresión en Cardmática.")}</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>
            ${classificationHtml(card)}
            ${section("Erratas documentadas", errataHtml(card))}
            ${section("Versiones históricas y textos comunitarios", textHistoryHtml(card))}
            ${banlistSectionHtml(card, market)}
            ${sources ? `<details class="cd-sources"><summary>${t("Procedencia")}</summary><ul>${sources}</ul></details>` : ""}
        </div>`;
}
