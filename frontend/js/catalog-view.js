import { badgeHtml, banlistSectionHtml, statusFor } from "./banlist.js";
import { formatDate, money } from "./storage.js";

export const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])
    );

const h = escapeHtml;
const kinds = {
    Monster: "Monstruo",
    Spell: "Magia",
    Trap: "Trampa",
    Skill: "Habilidad"
};
const chip = (value) => `<span class="chip">${h(value)}</span>`;
const section = (title, content) =>
    content ? `<section class="catalog-section"><h3>${h(title)}</h3>${content}</section>` : "";
const fact = (label, value) =>
    value === null || value === undefined || value === ""
        ? ""
        : `<div><span>${h(label)}</span><b>${h(value)}</b></div>`;

function creditLink(value, label) {
    if (!value) return "";
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `<a href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(label)}</a>`;
}

function assetUrl(value) {
    if (!value) return null;
    const url = new URL(value, location.origin);
    return url.origin === location.origin &&
        /^\/api\/v1\/(images|artworks)\/[0-9a-f-]+$/.test(url.pathname)
        ? url.href
        : null;
}

// Artwork shown only by the private preview has no commercial licence: mark it
// so nobody mistakes it for an image that can ship.
const PROVISIONAL =
    "Imagen provisional: ilustración sin licencia comercial, visible solo en la vista de prueba privada. No publicar.";

function provisional(image) {
    return image?.usage_scope === "local_preview_only";
}

function withWarning(html, image) {
    if (!provisional(image)) return html;
    return `<span class="img-wrap">${html}<span class="img-warn" tabindex="0" role="img" aria-label="${h(
        PROVISIONAL
    )}" data-tip="${h(PROVISIONAL)}">!</span></span>`;
}

function imageHtml(image, name, large = false) {
    const url = assetUrl(large ? image?.url : image?.thumbnail_url || image?.url);
    if (!url)
        return `<div class="catalog-image-fallback ${
            large ? "large" : ""
        }" role="img" aria-label="Sin imagen verificada">${
            large
                ? "Imagen de esta impresión no disponible con asociación y derechos verificados"
                : "Sin imagen"
        }</div>`;
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
    return `<div class="catalog-pager" aria-label="Paginación"><button class="ghost" data-${kind}-page="${
        data.page - 1
    }" ${data.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${
        data.page
    } de ${last} · ${data.total} ${
        kind === "printing" ? "impresiones" : "cartas"
    }</span><button class="ghost" data-${kind}-page="${data.page + 1}" ${
        data.page >= last ? "disabled" : ""
    }>Siguiente</button></div>`;
}

// Spanish labels for the subtypes the API reports; races such as "Dragon" stay as given.
const SUBTYPES = {
    Effect: "Efecto",
    Fusion: "Fusión",
    Synchro: "Sincro",
    Pendulum: "Péndulo",
    "Quick-Play": "Juego rápido",
    Continuous: "Continua",
    Equip: "Equipo",
    Field: "Campo",
    Counter: "Contraefecto"
};

// Type, subtypes and attribute matter less than price to a buyer who knows the
// card, so they share one muted line under the name instead of a column of chips.
function cardMeta(card) {
    return [
        kinds[card.card_type] || card.card_type || "Sin clasificar",
        ...card.subtypes.map((value) => SUBTYPES[value] || value),
        card.attribute
    ]
        .filter(Boolean)
        .join(" · ");
}

function saleCell(sale) {
    if (!sale) return '<td class="num"><span class="muted">Sin ventas</span></td>';
    return `<td class="num"><b class="price">${h(money(sale.price, sale.currency))}</b><small>${h(
        formatDate(sale.observed_at)
    )}</small></td>`;
}

export function catalogRows(data) {
    if (!data.items.length)
        return '<tr><td colspan="3" class="empty">No hay cartas almacenadas que coincidan con estos filtros.</td></tr>';
    return data.items
        .map((card) => {
            const meta = cardMeta(card);
            const source = card.name_is_official
                ? ""
                : ` · Fuente: ${card.name_source || "comunitaria"}`;
            return `<tr class="catalog-row" tabindex="0" data-catalog-card="${h(
                card.id
            )}" aria-label="${h(`${card.name}, ${meta}`)}"><td><div class="nm">${imageHtml(
                card.image,
                `${card.name} — ${
                    card.image?.association === "card_artwork"
                        ? "ilustración general"
                        : "imagen de impresión"
                }`
            )}<div class="nm-text"><b data-preview="${h(card.id)}">${badgeHtml(
                card.market_banlist
            )}${h(card.name)}</b><small class="meta" title="${h(
                meta + source
            )}">${h(meta)}${h(source)}</small></div></div></td><td class="num hide">${
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
        : '<div class="catalog-image-fallback grid" role="img" aria-label="Sin imagen verificada">Sin imagen</div>';
}

// Image-first tiles for collectors; same data and click target as the table rows.
export function catalogGrid(data) {
    if (!data.items.length)
        return '<p class="empty">No hay cartas almacenadas que coincidan con estos filtros.</p>';
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
                        : '<span class="muted">Sin ventas</span>'
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
            ? `<img src="${h(image)}" alt="" width="200" height="292">`
            : '<div class="catalog-image-fallback preview-fallback">Sin imagen verificada</div>'
    }<div class="preview-body"><b>${badgeHtml(card.market_banlist)}${h(card.name)}</b>${
        image && provisional(card.image)
            ? '<small class="warn-text"><span class="img-warn inline" aria-hidden="true">!</span> Imagen provisional, sin licencia</small>'
            : ""
    }<small>${h(
        cardMeta(card)
    )}</small><small>${card.printing_count} ${
        card.printing_count === 1 ? "impresión" : "impresiones"
    }</small>${
        card.last_sale
            ? `<div class="preview-price"><small>Última venta</small><b>${h(
                  money(card.last_sale.price, card.last_sale.currency)
              )}</b><small>${h(formatDate(card.last_sale.observed_at))} · ${h(
                  card.last_sale.code
              )}</small></div>`
            : '<small class="muted">Sin ventas registradas</small>'
    }</div>`;
}

export function homeHtml(data) {
    return `<section class="hero2 gl"><h2>Tu catálogo de <b>Yu-Gi-Oh!</b></h2><p>Consulta cartas, impresiones y su procedencia. Las ofertas comerciales se administran de forma independiente.</p><button class="btn" data-go="Todas">Explorar cartas</button></section><h3>Cartas del catálogo</h3>${
        data.items.length
            ? `<div class="grid">${data.items
                  .map(
                      (card) =>
                          `<button class="tile gl" data-catalog-card="${h(card.id)}">${imageHtml(
                              card.image,
                              card.name
                          )}<span><b>${h(card.name)}</b><small>${
                              card.printing_count
                          } impresiones · ${h(card.markets.join(" / "))}</small></span></button>`
                  )
                  .join("")}</div>`
            : '<div class="empty gl">Todavía no hay cartas importadas para este mercado.</div>'
    }`;
}

export function detailHtml(card, printings, selectedId, { market = "TCG" } = {}) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const image =
        printing?.images.find((item) => item.url) || card.artworks?.find((item) => item.url);
    const texts = card.texts.filter((text) => text.is_current);
    const text =
        texts.find((item) => item.language === printing?.language) ||
        texts.find((item) => item.language === "es") ||
        texts[0];
    const groups = (items, relation) =>
        items
            .filter((item) => item.relation === relation)
            .map((item) => chip(item.name))
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
                new Date(source.fetched_at).toLocaleDateString("es")
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
                        ? `<details><summary>Texto anterior documentado</summary><p class="card-text">${h(
                              entry.old_text.text
                          )}</p></details>`
                        : ""
                }${
                    entry.new_text
                        ? `<details><summary>Texto posterior documentado</summary><p class="card-text">${h(
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
                `<details><summary>${h(entry.language)} · ${
                    entry.is_official
                        ? "Versión oficial anterior"
                        : "Versión documentada por la comunidad"
                }${
                    entry.valid_from ? ` · ${h(entry.valid_from)}` : ""
                }</summary><p class="card-text">${h(entry.text)}</p></details>`
        )
        .join("");
    return `<div class="top"><div><h2>${badgeHtml(statusFor(card, market))}${h(
        card.name
    )}</h2><small>${[
        card.ygoprodeck_id ? `YGOPRODeck ${card.ygoprodeck_id}` : "",
        card.konami_id ? `CID ${card.konami_id}` : ""
    ]
        .filter(Boolean)
        .join(
            " · "
        )}</small></div><div class="top-actions"><button class="btn s" data-wl-open aria-controls="wl-picker">+ Wantlist</button><button class="ghost" data-close="md">Cerrar</button></div></div><div id="wl-picker"></div><div class="hero"><div>${imageHtml(
        image,
        `${card.name} · ${
            image?.association === "card_artwork" ? "ilustración general" : printing?.code || ""
        }`,
        true
    )}${
        image
            ? `<small>${
                  image.association === "card_artwork"
                      ? "Ilustración general: no verifica la rareza, edición o set seleccionado.<br>"
                      : ""
              }${h(image.author || "Autor no indicado")} · ${h(
                  image.usage_scope === "local_preview_only"
                      ? "Vista local de prueba; derechos comerciales sin verificar"
                      : image.license || "Permiso documentado"
              )} · ${creditLink(image.source_url, "Origen")}${
                  image.license_url ? ` · ${creditLink(image.license_url, "Licencia")}` : ""
              }</small>`
            : ""
    }</div><div class="facts">${fact("Tipo", kinds[card.card_type] || card.card_type)}${fact(
        "Subtipos",
        card.subtypes.join(" / ")
    )}${fact("Atributo", card.attribute)}${fact("Nivel", card.level)}${fact(
        "Rango",
        card.rank
    )}${fact("Link", card.link_rating)}${fact("ATK", card.atk)}${fact("DEF", card.defense)}${fact(
        "Escala Péndulo",
        card.pendulum_scale
    )}${fact("Set", printing?.set_name)}${fact("Código", printing?.code)}${fact(
        "Rareza",
        printing?.rarity
    )}${fact("Idioma", printing?.language)}${fact(
        "Edición",
        printing?.edition === "unknown" ? null : printing?.edition
    )}${fact("Variante", printing?.artwork === "unknown" ? null : printing?.artwork)}${fact(
        "Lanzamiento",
        printing?.release_date
    )}</div></div>${
        printing
            ? `<label class="catalog-printing-label">Impresión <select id="catalog-printing">${printings.items
                  .map(
                      (item) =>
                          `<option value="${h(item.id)}" ${
                              item.id === printing.id ? "selected" : ""
                          }>${h(
                              [item.code, item.rarity, item.language, item.edition].join(" · ")
                          )}</option>`
                  )
                  .join("")}</select></label>${pager(printings, "printing")}`
            : '<p class="empty">No hay impresiones documentadas para este mercado.</p>'
    }<div id="price-history" class="chart" aria-live="polite"></div>${
        text
            ? section(
                  `${
                      text.is_official
                          ? "Texto oficial vigente"
                          : "Texto de catálogo · " + (text.source_slug || "fuente comunitaria")
                  } · ${text.language}`,
                  `<p class="card-text">${h(text.text)}</p>${
                      text.pendulum_text
                          ? `<h4>Efecto Péndulo</h4><p class="card-text">${h(
                                text.pendulum_text
                            )}</p>`
                          : ""
                  }`
              )
            : '<p class="catalog-status">Texto vigente todavía no disponible.</p>'
    }${section(
        "Arquetipos · clasificación comunitaria",
        groups(card.archetypes, "member")
    )}${section("Series · clasificación comunitaria", groups(card.series, "member"))}${section(
        "Soporte a arquetipos · clasificación comunitaria",
        groups(card.archetypes, "supports")
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
                    )}">Ver carta relacionada</button></p>`
            )
            .join("")
    )}${section("Erratas documentadas", errata)}${section(
        "Versiones históricas y textos comunitarios",
        history
    )}${banlistSectionHtml(card, market)}${section(
        "Procedencia",
        sourceLinks ? `<ul>${sourceLinks}</ul>` : ""
    )}<p class="catalog-status">No hay publicaciones comerciales vinculadas a esta impresión.</p>`;
}
