// Administration panel: everything for admins, photo review for moderators.
// Reads /api/v1/admin (backend/app/api/admin.py) with the admin's session.
import { escapeHtml, html } from "./html.js";
import { lang, locale, t } from "./lang.js";
import { request } from "./session-api.js";
import { currentUser } from "./auth.js";
import { installModeration, loadModeration, moderationHtml } from "./photos.js";

const h = escapeHtml;
const ADMIN = "/api/v1/admin";
const ROLE_LABELS = { user: "Usuario", moderator: "Moderador", admin: "Administrador" };
const JOB_STATUS = {
    pending: "En cola",
    running: "En curso",
    paused: "Pausado",
    completed: "Completado",
    completed_with_errors: "Completado con errores",
    failed: "Fallido"
};
const OVERVIEW = [
    ["cards", "Cartas"],
    ["printings", "Impresiones"],
    ["users", "Cuentas"],
    ["active_sessions", "Sesiones abiertas"],
    ["wantlists", "Listas de deseados"],
    ["sales", "Ventas registradas"],
    ["pending_jobs", "Sincronizaciones en cola"]
];

let search = "";

const when = (value) => (value ? new Date(value).toLocaleString(locale) : "—");

const selectedIf = (yes) => (yes ? " selected" : "");

function userRow(user) {
    const status = user.locked ? `<span class="warn-text">${t("Bloqueada")}</span>` : t("Activa");
    const roles = Object.entries(ROLE_LABELS)
        .map(([value, label]) => `<option value="${value}"${selectedIf(value === user.role)}>${t(label)}</option>`)
        .join("");
    const roleLabel = h(t("Rol de {name}", { name: user.display_name }));
    return html`
        <tr>
            <td><b>${h(user.display_name)}</b><small>${h(user.email)}</small></td>
            <td>${h(new Date(user.created_at).toLocaleDateString(locale))}</td>
            <td>${status}</td>
            <td><select data-admin-role="${h(user.id)}" aria-label="${roleLabel}">${roles}</select></td>
        </tr>`;
}

function usersHtml(data) {
    const rows = data.items.map(userRow).join("") || `<tr><td colspan="4" class="empty">${t("Ninguna cuenta coincide.")}</td></tr>`;
    const count = t(data.total === 1 ? "{count} cuenta" : "{count} cuentas", { count: data.total });
    return html`
        <table>
            <thead>
                <tr><th>${t("Cuenta")}</th><th>${t("Alta")}</th><th>${t("Estado")}</th><th>${t("Rol")}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <small class="catalog-status">${count}</small>`;
}

function jobsHtml(jobs) {
    if (!jobs.length) return `<p class="catalog-status">${t("Todavía no hubo sincronizaciones.")}</p>`;
    const rows = jobs
        .map(
            (job) => html`
                <tr>
                    <td>${h(job.source)}</td>
                    <td>${h(job.mode)}</td>
                    <td>${h(JOB_STATUS[job.status] ? t(JOB_STATUS[job.status]) : job.status)}</td>
                    <td class="num">${job.processed}</td>
                    <td class="num">${job.failures}</td>
                    <td>${h(when(job.finished_at))}</td>
                </tr>`
        )
        .join("");
    return html`
        <table>
            <thead>
                <tr>
                    <th>${t("Fuente")}</th>
                    <th>${t("Modo")}</th>
                    <th>${t("Estado")}</th>
                    <th class="num">${t("Procesadas")}</th>
                    <th class="num">${t("Fallos")}</th>
                    <th>${t("Fin")}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// "tab:Todas" → "Todas las cartas"; events keep a readable name.
const KEY_LABELS = {
    carta: "Fichas de carta abiertas",
    busqueda: "Búsquedas",
    "cuenta:registro": "Cuentas creadas",
    "wantlist:agregar": "Cartas añadidas a listas de deseados"
};

function keyLabel(key) {
    if (key.startsWith("tab:")) {
        const tab = key.slice(4);
        return t("Pestaña {name}", { name: t(window.TAB_LABELS[tab] || tab) });
    }
    return KEY_LABELS[key] ? t(KEY_LABELS[key]) : key;
}

function topHtml(rows) {
    if (!rows.length) return `<p class="catalog-status">${t("Todavía no hay visitas registradas.")}</p>`;
    const items = rows.map((row) => `<li><span>${h(keyLabel(row.key))}</span><b>${row.count}</b></li>`).join("");
    return `<ul class="admin-top">${items}</ul>`;
}

// ---- News of the home page (backend/app/api/news.py) ---------------------------

const NEWS_SECTIONS = { site: "Cardmática", yugioh: "Yu-Gi-Oh!" };

function newsListHtml(items) {
    if (!items.length) return `<p class="catalog-status">${t("Todavía no hay noticias.")}</p>`;
    const rows = items
        .map((item) => {
            const source = item.source_name ? ` · ${h(item.source_name)}` : "";
            const about = `${h(NEWS_SECTIONS[item.section])} · ${h(item.language.toUpperCase())} · ${h(item.published_on)}${source}`;
            return html`
                <li lang="${h(item.language)}">
                    <span><b>${h(item.title)}</b><small>${about}</small></span>
                    <button class="ghost" data-admin-news-delete="${h(item.id)}">${t("Quitar")}</button>
                </li>`;
        })
        .join("");
    return `<ul class="admin-news">${rows}</ul>`;
}

// A news item is written in one language, which the form asks for: it is
// shown only to visitors who read that language, and never translated.
function newsForm() {
    const languages = window.I18N.languages
        .map(([code, name]) => `<option value="${code}"${selectedIf(code === lang)}>${name}</option>`)
        .join("");
    return html`
        <form id="admin-news-form" class="fm-stack">
            <label>
                ${t("Sección")}
                <select name="section">
                    <option value="site">${t("Novedades de Cardmática")}</option>
                    <option value="yugioh">${t("Noticias de Yu-Gi-Oh! (con fuente)")}</option>
                </select>
            </label>
            <label>${t("Idioma de la noticia")}<select name="language">${languages}</select></label>
            <label>${t("Título")}<input name="title" required minlength="3" maxlength="140"></label>
            <label>${t("Resumen")}<textarea name="summary" required minlength="3" maxlength="400" rows="2"></textarea></label>
            <label>${t("Enlace a la fuente")}<input name="url" type="url" maxlength="500" placeholder="https://"></label>
            <label>${t("Nombre de la fuente")}<input name="source_name" maxlength="120" placeholder="Konami, YGOrganization…"></label>
            <label>${t("Fecha")}<input name="published_on" type="date" required></label>
            <button class="btn s" type="submit">${t("Publicar")}</button>
        </form>`;
}

async function loadNews() {
    const slot = document.getElementById("admin-news");
    if (!slot) return;
    try {
        slot.innerHTML = newsListHtml(await request(`${ADMIN}/news`));
    } catch (error) {
        slot.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

async function loadUsers() {
    const slot = document.getElementById("admin-users");
    if (!slot) return;
    try {
        slot.innerHTML = usersHtml(await request(`${ADMIN}/users?q=${encodeURIComponent(search)}`));
    } catch (error) {
        slot.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

export async function renderAdmin(container) {
    container.innerHTML = `<h3>${t("Administración")}</h3><p class="catalog-status">${t("Cargando…")}</p>`;
    // A moderator only reviews photos; the rest of the panel is for admins.
    if (currentUser()?.role === "moderator") {
        container.innerHTML = `<h3>${t("Moderación")}</h3>${moderationHtml()}`;
        loadModeration();
        return;
    }
    try {
        const [overview, jobs] = await Promise.all([
            request(`${ADMIN}/overview`),
            request(`${ADMIN}/sync-jobs?limit=10`)
        ]);
        const stats = OVERVIEW.map(
            ([key, label]) => `<div class="gl pnl"><small>${t(label)}</small><b>${overview[key]}</b></div>`
        ).join("");
        container.innerHTML = html`
            <h3>${t("Administración")}</h3>
            <div class="admin-stats">${stats}</div>
            <section class="gl pnl">
                <b>${t("Lo más visto · últimos 7 días")}</b>
                ${topHtml(overview.top_pages)}
                <small>${t("Recuentos anónimos por día, sin cookies ni datos personales.")}</small>
            </section>
            ${moderationHtml()}
            <section class="gl pnl">
                <b>${t("Cuentas")}</b>
                <input id="admin-search" type="search" placeholder="${t("Buscar por correo o nombre")}" aria-label="${t("Buscar cuentas")}" value="${h(search)}">
                <div class="wrap" id="admin-users"></div>
            </section>
            <section class="gl pnl">
                <b>${t("Últimas sincronizaciones")}</b>
                <div class="wrap">${jobsHtml(jobs)}</div>
                <small>${t("Se encolan con <code>cardmatica sync</code> y las procesa el worker.")}</small>
            </section>
            <section class="gl pnl">
                <b>${t("Noticias del inicio")}</b>
                ${newsForm()}
                <div id="admin-news"></div>
                <small>${t("Las de Yu-Gi-Oh! siempre llevan su fuente. Las de los feeds llegan solas, cada una en su idioma.")}</small>
            </section>`;
        loadUsers();
        loadNews();
        loadModeration();
    } catch (error) {
        container.innerHTML = `<h3>${t("Administración")}</h3><p class="warn">${h(error.message)}</p>`;
    }
}

export function installAdmin() {
    installModeration();
    let timer;
    document.addEventListener("input", (event) => {
        if (event.target.id !== "admin-search") return;
        search = event.target.value.trim();
        clearTimeout(timer);
        timer = setTimeout(loadUsers, 250);
    });
    document.addEventListener("change", async (event) => {
        const id = event.target.dataset.adminRole;
        if (!id) return;
        try {
            await request(`${ADMIN}/users/${id}/role`, {
                method: "POST",
                body: { role: event.target.value }
            });
            window.toast?.(t("Rol actualizado"));
        } catch (error) {
            window.toast?.(error.message);
            loadUsers();
        }
    });
    document.addEventListener("submit", async (event) => {
        if (event.target.id !== "admin-news-form") return;
        event.preventDefault();
        const form = event.target;
        const fields = Object.fromEntries(new FormData(form));
        // Empty optional fields are not sent.
        const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
        try {
            await request(`${ADMIN}/news`, { method: "POST", body });
            form.reset();
            window.toast?.(t("Noticia publicada"));
            loadNews();
        } catch (error) {
            window.toast?.(error.message);
        }
    });
    document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-admin-news-delete]");
        if (!button) return;
        try {
            await request(`${ADMIN}/news/${button.dataset.adminNewsDelete}`, { method: "DELETE" });
            loadNews();
        } catch (error) {
            window.toast?.(error.message);
        }
    });
}
