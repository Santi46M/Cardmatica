export const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])
    );

const h = escapeHtml;
const kinds = { Monster: "Monstruo", Spell: "Magia", Trap: "Trampa", Skill: "Habilidad" };
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
    return url.origin === location.origin && /^\/api\/v1\/images\/[0-9a-f-]+$/.test(url.pathname)
        ? url.href
        : null;
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
    return `<img class="catalog-image ${large ? "large" : ""}" src="${h(url)}" alt="${h(
        name
    )}" loading="lazy" decoding="async" width="${large ? 240 : 48}" height="${large ? 350 : 70}">`;
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

export function catalogRows(data) {
    if (!data.items.length)
        return '<tr><td colspan="5" class="empty">No hay cartas almacenadas que coincidan con estos filtros.</td></tr>';
    return data.items
        .map(
            (card) =>
                `<tr class="catalog-row" tabindex="0" data-catalog-card="${h(
                    card.id
                )}"><td><div class="nm">${imageHtml(
                    card.image,
                    `${card.name} — imagen de una impresión`
                )}<div><b>${h(card.name)}</b><small>${h(card.attribute || "")}${
                    card.name_is_official ? "" : " · Nombre de fuente comunitaria"
                }</small></div></div></td><td>${chip(
                    kinds[card.card_type] || card.card_type || "Sin clasificar"
                )}${card.subtypes.map(chip).join("")}</td><td class="hide">${
                    card.printing_count
                } impresiones</td><td class="num">${card.markets
                    .map(chip)
                    .join("")}</td><td><button class="lk" data-catalog-card="${h(
                    card.id
                )}">Ver ficha</button></td></tr>`
        )
        .join("");
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

export function detailHtml(card, printings, selectedId) {
    const printing = printings.items.find((item) => item.id === selectedId) || printings.items[0];
    const image = printing?.images.find((item) => item.url);
    const texts = card.texts.filter((text) => text.is_official && text.is_current);
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
                !["www.db.yugioh-card.com", "yugipedia.com"].includes(url.hostname)
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
    return `<div class="top"><div><h2>${h(card.name)}</h2><small>${
        card.konami_id ? `CID ${card.konami_id}` : "Identidad pendiente de revisión"
    }</small></div><button class="ghost" data-close="md">Cerrar</button></div><div class="hero"><div>${imageHtml(
        image,
        `${card.name} · ${printing?.code || ""}`,
        true
    )}${
        image
            ? `<small>${h(image.author || "Autor no indicado")} · ${h(
                  image.license || "Permiso documentado"
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
    }${
        text
            ? section(
                  `Texto oficial vigente · ${text.language}`,
                  `<p class="card-text">${h(text.text)}</p>${
                      text.pendulum_text
                          ? `<h4>Efecto Péndulo</h4><p class="card-text">${h(
                                text.pendulum_text
                            )}</p>`
                          : ""
                  }`
              )
            : '<p class="catalog-status">Texto oficial vigente todavía no disponible.</p>'
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
    )}${section(
        "Listas oficiales por formato y vigencia",
        card.banlist
            .map(
                (entry) =>
                    `<p>${h(entry.format)} · ${h(entry.effective_date)} · ${h(entry.status)}</p>`
            )
            .join("")
    )}${section(
        "Procedencia",
        sourceLinks ? `<ul>${sourceLinks}</ul>` : ""
    )}<p class="catalog-status">No hay publicaciones comerciales vinculadas a esta impresión.</p>`;
}
