import { badgeHtml, banlistSectionHtml, statusFor } from "./banlist.js";
import { formatDate, money } from "./format.js";
import { typeLine } from "./card-types.js";
import { escapeHtml } from "./html.js";
import { lang, locale, t } from "./lang.js";
import { scopeLink } from "./collections.js";
import { editionName, languageName, printingOptionsHtml } from "./printings.js";
import { rarityBadge } from "./rarities.js";


const h = escapeHtml;
const chip = (value) => `<span class="chip">${h(value)}</span>`;
const section = (title, content) =>
    content ? `<section class="catalog-section"><h3>${h(t(title))}</h3>${content}</section>` : "";

// One row of the facts list beside the chart; empty values are left out.
const factRow = (label, html) => (html ? `<div><dt>${h(t(label))}</dt><dd>${html}</dd></div>` : "");

const BANLIST_LABELS = {
    forbidden: "Prohibida",
    limited: "Limitada",
    semi_limited: "Semi-limitada",
    unlimited: "Permitida"
};
const banlistLabel = (status) => t(BANLIST_LABELS[status.status] || "Sin estado verificado");


// Tabs of the info panel. (Demo cards draw only "Info": they cannot go to a list.)
const cardTabs = () =>
    `<div class="cd-tabs" role="tablist"><button role="tab" aria-selected="true" data-cd-tab="info">ⓘ ${t(
        "Info"
    )}</button><button role="tab" aria-selected="false" data-cd-tab="wants">♥ ${t("Deseados")}</button></div>`;

// Prices beside the chart, from Cardmática's own sales.
export function pricesHtml(summary) {
    if (summary === undefined) return factRow("Última venta", t("Cargando…"));
    if (!summary) return "";
    const value = (euros) => (euros === null ? "—" : h(window.formatPrice(euros)));
    return `${factRow(
        "Última venta",
        summary.last
            ? `${h(money(summary.last.price, summary.last.currency))} <small>${h(formatDate(summary.last.observed_at))}</small>`
            : "—"
    )}${summary.averages.map(([label, euros]) => factRow(label, value(euros))).join("")}`;
}

function creditLink(value, label) {
    if (!value) return "";
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `<a href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(label)}</a>`;
}

export function assetUrl(value) {
    if (!value) return null;
    const url = new URL(value, location.origin);
    return url.origin === location.origin &&
        /^\/api\/v1\/(images|artworks)\/[0-9a-f-]+$/.test(url.pathname)
        ? url.href
        : null;
}

// Artwork shown only by the private preview has no commercial licence: mark it
// so nobody mistakes it for an image that can ship.
const PROVISIONAL = () =>
    t("Imagen provisional: ilustración sin licencia comercial, visible solo en la vista de prueba privada. No publicar.");

function provisional(image) {
    return image?.usage_scope === "local_preview_only";
}

function withWarning(html, image) {
    if (!provisional(image)) return html;
    return `<span class="img-wrap">${html}<span class="img-warn" tabindex="0" role="img" aria-label="${h(
        PROVISIONAL()
    )}" data-tip="${h(PROVISIONAL())}">!</span></span>`;
}

function imageHtml(image, name, large = false) {
    const url = assetUrl(large ? image?.url : image?.thumbnail_url || image?.url);
    if (!url)
        return `<div class="catalog-image-fallback ${
            large ? "large" : ""
        }" role="img" aria-label="${t("Sin imagen verificada")}">${t(
            large ? "Imagen de esta impresión no disponible con asociación y derechos verificados" : "Sin imagen"
        )}</div>`;
    return withWarning(
        `<img class="catalog-image ${large ? "large" : ""}" src="${h(url)}" alt="${h(
            name
        )}" loading="lazy" decoding="async" width="${large ? 240 : 48}" height="${
            large ? 350 : 70
        }">`,
        image
    );
}

export function pager(data, kind = "catalog") {
    const last = Math.max(1, Math.ceil(data.total / data.page_size));
    return `<div class="catalog-pager" aria-label="${t("Paginación")}"><button class="ghost" data-${kind}-page="${
        data.page - 1
    }" ${data.page <= 1 ? "disabled" : ""}>${t("Anterior")}</button><span>${t("Página {page} de {pages}", {
        page: data.page,
        pages: last
    })}<span class="pager-total"> · ${t(kind === "printing" ? "{count} impresiones" : "{count} cartas", {
        count: data.total
    })}</span></span><button class="ghost" data-${kind}-page="${data.page + 1}" ${
        data.page >= last ? "disabled" : ""
    }>${t("Siguiente")}</button></div>`;
}

// Type, subtypes and attribute matter less than price to a buyer who knows the
// card, so they share one muted line under the name instead of a column of chips.
const cardMeta = typeLine;

function saleCell(sale) {
    if (!sale) return `<td class="num"><span class="muted">${t("Sin ventas")}</span></td>`;
    return `<td class="num"><b class="price">${h(money(sale.price, sale.currency))}</b><small>${h(
        formatDate(sale.observed_at)
    )}</small></td>`;
}

export function catalogRows(data) {
    if (!data.items.length)
        return `<tr><td colspan="3" class="empty">${t("No hay cartas almacenadas que coincidan con estos filtros.")}</td></tr>`;
    return data.items
        .map((card) => {
            const meta = cardMeta(card);
            return `<tr class="catalog-row" tabindex="0" data-catalog-card="${h(
                card.id
            )}" aria-label="${h(`${card.name}, ${meta}`)}"><td><div class="nm">${imageHtml(
                card.image,
                `${card.name} — ${t(
                    card.image?.association === "card_artwork" ? "ilustración general" : "imagen de impresión"
                )}`
            )}<div class="nm-text"><b data-preview="${h(card.id)}">${badgeHtml(
                card.market_banlist
            )}${h(card.name)}</b><small class="meta" title="${h(meta)}">${h(meta)}</small></div></div></td><td class="num hide">${
                card.printing_count
            }</td>${saleCell(card.last_sale)}</tr>`;
        })
        .join("");
}

function gridImage(card) {
    const url = assetUrl(card.image?.url || card.image?.thumbnail_url);
    return url
        ? withWarning(
              `<img class="catalog-image grid" src="${h(url)}" alt="${h(card.name)}" loading="lazy" decoding="async" width="168" height="245">`,
              card.image
          )
        : `<div class="catalog-image-fallback grid" role="img" aria-label="${t("Sin imagen verificada")}">${t(
              "Sin imagen"
          )}</div>`;
}

// Image-first tiles for collectors; same data and click target as the table rows.
export function catalogGrid(data) {
    if (!data.items.length)
        return `<p class="empty">${t("No hay cartas almacenadas que coincidan con estos filtros.")}</p>`;
    return data.items
        .map(
            (card) =>
                `<button class="card-tile gl" data-catalog-card="${h(card.id)}">${gridImage(
                    card
                )}<span class="card-tile-body"><b>${badgeHtml(card.market_banlist)}${h(
                    card.name
                )}</b><small class="meta">${h(cardMeta(card))}</small><span class="card-tile-price">${
                    card.last_sale
                        ? `<b class="price">${h(money(card.last_sale.price, card.last_sale.currency))}</b><small>${h(
                              formatDate(card.last_sale.observed_at)
                          )}</small>`
                        : `<span class="muted">${t("Sin ventas")}</span>`
                }</span></span></button>`
        )
        .join("");
}

// Placeholders shaped like the content, so the layout does not jump while loading.
export function skeletonRows(count = 8) {
    return Array.from(
        { length: count },
        (_, index) =>
            `<tr class="sk-row" aria-hidden="true"><td><div class="nm"><span class="sk sk-thumb"></span><div class="nm-text"><span class="sk sk-line" style="width:${
                46 + ((index * 17) % 30)
            }%"></span><span class="sk sk-line sk-small"></span></div></div></td><td class="num hide"><span class="sk sk-num"></span></td><td class="num"><span class="sk sk-num"></span></td></tr>`
    ).join("");
}

export function skeletonTiles(count = 12) {
    return Array.from(
        { length: count },
        () =>
            '<div class="card-tile gl sk-tile" aria-hidden="true"><span class="sk sk-art"></span><span class="sk sk-line"></span><span class="sk sk-line sk-small"></span></div>'
    ).join("");
}

export function previewHtml(card) {
    const image = assetUrl(card.image?.url || card.image?.thumbnail_url);
    return `${
        image
            ? `<img src="${h(image)}" alt="${h(card.name)}" width="200" height="292">`
            : `<div class="catalog-image-fallback preview-fallback">${t("Sin imagen verificada")}</div>`
    }<div class="preview-body"><b>${badgeHtml(card.market_banlist)}${h(card.name)}</b>${
        image && provisional(card.image)
            ? `<small class="warn-text"><span class="img-warn inline" aria-hidden="true">!</span> ${t(
                  "Imagen provisional, sin licencia"
              )}</small>`
            : ""
    }<small>${h(
        cardMeta(card)
    )}</small><small>${t(card.printing_count === 1 ? "{count} impresión" : "{count} impresiones", {
        count: card.printing_count
    })}</small>${
        card.last_sale
            ? `<div class="preview-price"><small>${t("Última venta")}</small><b>${h(
                  money(card.last_sale.price, card.last_sale.currency)
              )}</b><small>${h(formatDate(card.last_sale.observed_at))} · ${h(
                  card.last_sale.code
              )}</small></div>`
            : `<small class="muted">${t("Sin ventas registradas")}</small>`
    }</div>`;
}

// A home tile: image, name and one line of detail.
export function tileHtml(card, line) {
    return `<button class="tile gl" data-catalog-card="${h(card.id)}">${imageHtml(card.image, card.name)}<span><b>${h(
        card.name
    )}</b><small>${h(line)}</small></span></button>`;
}

export function homeHtml(data, { signedIn = false } = {}) {
    // The page's one <h1> and its calls to action, visible without scrolling.
    return `<section class="hero2 gl"><h1>${t("Cartas de <b>Yu-Gi-Oh!</b> para el Mercosur")}</h1><p>${t(
        "Busca cualquier carta TCG u OCG, compara sus impresiones y rarezas, revisa la banlist y arma tus listas de deseados con avisos de precio."
    )}</p><p class="hero-actions"><button class="btn" data-go="Todas">${t("Explorar cartas")}</button>${
        signedIn
            ? `<button class="ghost" data-go="Deseados">${t("Mi lista de deseados")}</button>`
            : `<button class="ghost" data-go="Acceso" data-auth-mode="register">${t("Crear cuenta gratis")}</button>`
    }</p></section><div id="home-trending"></div><h2 class="sec-title">${t("Cartas del catálogo")}</h2>${
        data.items.length
            ? `<div class="grid">${data.items
                  .map((card) =>
                      tileHtml(
                          card,
                          `${t("{count} impresiones", { count: card.printing_count })} · ${card.markets.join(" / ")}`
                      )
                  )
                  .join("")}</div>`
            : `<div class="empty gl">${t("Todavía no hay cartas importadas para este mercado.")}</div>`
    }`;
}

export function detailHtml(card, printings, selectedId, { market = "TCG" } = {}) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const image =
        printing?.images.find((item) => item.url) || card.artworks?.find((item) => item.url);
    const texts = card.texts.filter((text) => text.is_current);
    // The visitor's language if the card has it, else the printing's.
    const text =
        texts.find((item) => item.language === lang) ||
        texts.find((item) => item.language === printing?.language) ||
        texts[0];
    const groups = (items, relation, kind) =>
        items
            .filter((item) => item.relation === relation)
            .map((item) =>
                kind ? `<span class="chip">${scopeLink(kind, item.id, item.name)}</span>` : chip(item.name)
            )
            .join("");
    const sourceLinks = card.sources
        .map((source) => {
            const url = new URL(source.url);
            if (
                url.protocol !== "https:" ||
                !["www.db.yugioh-card.com", "yugipedia.com", "db.ygoprodeck.com"].includes(
                    url.hostname
                )
            )
                return "";
            return `<li><a href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(
                source.source
            )}</a> · ${h(source.validation_status)} · ${h(
                new Date(source.fetched_at).toLocaleDateString(locale)
            )}</li>`;
        })
        .join("");
    const errata = card.errata
        .map(
            (entry) =>
                `<article class="catalog-erratum"><b>${h(entry.language)}${
                    entry.effective_date ? ` · ${h(entry.effective_date)}` : ""
                }</b><small>${h(entry.classification)}</small><p>${h(entry.explanation)}</p>${
                    entry.old_text
                        ? `<details><summary>${t("Texto anterior documentado")}</summary><p class="card-text">${h(
                              entry.old_text.text
                          )}</p></details>`
                        : ""
                }${
                    entry.new_text
                        ? `<details><summary>${t("Texto posterior documentado")}</summary><p class="card-text">${h(
                              entry.new_text.text
                          )}</p></details>`
                        : ""
                }</article>`
        )
        .join("");
    const history = card.texts
        .filter((entry) => !entry.is_current)
        .map(
            (entry) =>
                `<details><summary>${h(entry.language)} · ${t(
                    entry.is_official ? "Versión oficial anterior" : "Versión documentada por la comunidad"
                )}${
                    entry.valid_from ? ` · ${h(entry.valid_from)}` : ""
                }</summary><p class="card-text">${h(entry.text)}</p></details>`
        )
        .join("");
    const textHtml = text
            ? section(
                  `${
                      text.is_official
                          ? t("Texto oficial vigente")
                          : t("Texto de catálogo")
                  } · ${text.language}`,
                  `<p class="card-text">${h(text.text)}</p>${
                      text.pendulum_text
                          ? `<h4>${t("Efecto Péndulo")}</h4><p class="card-text">${h(
                                text.pendulum_text
                            )}</p>`
                          : ""
                  }`
              )
            : `<p class="catalog-status">${t("Texto vigente todavía no disponible.")}</p>`;
    const ids = [
        card.passcode ? t("Código {code}", { code: card.passcode }) : "",
        card.konami_id ? `CID ${card.konami_id}` : ""
    ]
        .filter(Boolean)
        .join(" · ");
    const credit = image
        ? `<figcaption>${
              image.association === "card_artwork"
                  ? `${t("Ilustración general: no verifica la rareza, edición o set seleccionado.")}<br>`
                  : ""
          }${h(image.author || t("Autor no indicado"))} · ${h(
              image.usage_scope === "local_preview_only"
                  ? t("Vista local de prueba; derechos comerciales sin verificar")
                  : image.license || t("Permiso documentado")
          )} · ${creditLink(image.source_url, t("Origen"))}${
              image.license_url ? ` · ${creditLink(image.license_url, t("Licencia"))}` : ""
          }</figcaption>`
        : "";
    const printingChoice =
        printings.items.length > 1
            ? `<select id="catalog-printing" aria-label="${t("Impresión")}">${printingOptionsHtml(
                  printings.items,
                  printing.id
              )}</select>${printings.total > printings.page_size ? pager(printings, "printing") : ""}`
            : "";
    const banlist = statusFor(card, market);
    const facts = printing
        ? `${factRow("Rareza", rarityBadge(printing))}${factRow("Número", h(printing.code))}${factRow(
              "Impreso en",
              scopeLink("set", printing.set_id, printing.set_name)
          )}${printingChoice ? factRow("Impresión", printingChoice) : ""}${factRow(
              "Idioma",
              h(languageName(printing.language))
          )}${factRow("Edición", h(editionName(printing.edition)))}${factRow(
              "Lanzamiento",
              printing.release_date ? h(formatDate(printing.release_date)) : ""
          )}${factRow("Banlist", banlist ? `${badgeHtml(banlist)} ${h(banlistLabel(banlist))}` : "")}`
        : `<p class="empty">${t("No hay impresiones documentadas para este mercado.")}</p>`;
    // The type line (card-types.js), then the numbers printed on the card.
    const stats = [
        typeLine(card),
        card.pendulum_scale != null ? t("Escala {scale}", { scale: card.pendulum_scale }) : "",
        card.atk != null
            ? `ATK ${card.atk}${card.defense != null ? ` / DEF ${card.defense}` : ""}`
            : ""
    ]
        .filter(Boolean)
        .map(h)
        .join(" · ");
    return `<div class="card-detail"><div class="cd-head"><div><h2>${badgeHtml(banlist)}${h(card.name)}</h2><p class="cd-sub">${
        printing ? `${h(printing.set_name)} · ${t("Cartas sueltas")}` : t("Cartas sueltas")
    }${ids ? `<br><small>${h(ids)}</small>` : ""}</p></div><div class="top-actions"><button class="ghost" data-close="md">${t(
        "Cerrar"
    )}</button></div></div><div class="cd-top"><figure class="cd-image gl">${imageHtml(
        image,
        `${card.name} · ${image?.association === "card_artwork" ? t("ilustración general") : printing?.code || ""}`,
        true
    )}${credit}</figure><div class="cd-info gl">${cardTabs()}<div class="cd-panel" data-cd-panel="info"><div class="cd-cols"><div><dl class="cd-facts">${facts}</dl><dl class="cd-facts" id="cd-prices"></dl></div><div class="cd-chart"><div id="price-history" class="chart" aria-live="polite"></div><button class="btn s cd-want" data-wl-open aria-controls="wl-picker">♥ ${t("Añadir a la lista de deseados")}</button></div></div><div class="cd-text">${
        stats ? `<p class="cd-stats">${stats}</p>` : ""
    }${textHtml}</div></div><div class="cd-panel" data-cd-panel="wants" hidden></div><div id="wl-picker"></div></div></div><section class="cd-offers"><div class="gl wrap"><table class="cd-table"><thead><tr><th>${t("Vendedor")}</th><th>${t("Información del producto")}</th><th class="num">${t(
        "Oferta"
    )}</th></tr></thead><tbody><tr><td colspan="3" class="empty">${t(
        "Todavía no hay ofertas de esta impresión en Cardmática."
    )}</td></tr></tbody></table></div></section>${section(
        "Arquetipos · clasificación comunitaria",
        groups(card.archetypes, "member", "archetype")
    )}${section("Series · clasificación comunitaria", groups(card.series, "member"))}${section(
        "Soporte a arquetipos · clasificación comunitaria",
        groups(card.archetypes, "supports", "archetype")
    )}${section(
        "Relaciones complementarias",
        [...card.archetypes, ...card.series]
            .filter((item) => ["related", "anti_supports"].includes(item.relation))
            .map((item) => chip(`${item.name} · ${item.relation}`))
            .join("")
    )}${section(
        "Relaciones entre cartas",
        card.relations
            .map(
                (relation) =>
                    `<p>${h(relation.relation)} · <button class="lk" data-catalog-card="${h(
                        relation.card_id
                    )}">${t("Ver carta relacionada")}</button></p>`
            )
            .join("")
    )}${section("Erratas documentadas", errata)}${section(
        "Versiones históricas y textos comunitarios",
        history
    )}${banlistSectionHtml(card, market)}${
        sourceLinks
            ? `<details class="cd-sources"><summary>${t("Procedencia")}</summary><ul>${sourceLinks}</ul></details>`
            : ""
    }</div>`;
}
