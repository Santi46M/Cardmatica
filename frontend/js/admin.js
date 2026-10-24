// Administration panel, only for accounts with the admin role.
// Reads /api/v1/admin (backend/app/api/admin.py) with the admin's session.
import { escapeHtml } from "./html.js";
import { request } from "./session-api.js";

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

const when = (value) => (value ? new Date(value).toLocaleString("es") : "—");

function usersHtml(data) {
    const rows = data.items
        .map(
            (user) =>
                `<tr><td><b>${h(user.display_name)}</b><small>${h(user.email)}</small></td><td>${h(
                    new Date(user.created_at).toLocaleDateString("es")
                )}</td><td>${user.locked ? '<span class="warn-text">Bloqueada</span>' : "Activa"}</td><td><select data-admin-role="${h(
                    user.id
                )}" aria-label="Rol de ${h(user.display_name)}">${Object.entries(ROLE_LABELS)
                    .map(
                        ([value, label]) =>
                            `<option value="${value}"${value === user.role ? " selected" : ""}>${label}</option>`
                    )
                    .join("")}</select></td></tr>`
        )
        .join("");
    return `<table><thead><tr><th>Cuenta</th><th>Alta</th><th>Estado</th><th>Rol</th></tr></thead><tbody>${
        rows || '<tr><td colspan="4" class="empty">Ninguna cuenta coincide.</td></tr>'
    }</tbody></table><small class="catalog-status">${data.total} ${data.total === 1 ? "cuenta" : "cuentas"}</small>`;
}

function jobsHtml(jobs) {
    if (!jobs.length) return '<p class="catalog-status">Todavía no hubo sincronizaciones.</p>';
    return `<table><thead><tr><th>Fuente</th><th>Modo</th><th>Estado</th><th class="num">Procesadas</th><th class="num">Fallos</th><th>Fin</th></tr></thead><tbody>${jobs
        .map(
            (job) =>
                `<tr><td>${h(job.source)}</td><td>${h(job.mode)}</td><td>${h(
                    JOB_STATUS[job.status] || job.status
                )}</td><td class="num">${job.processed}</td><td class="num">${job.failures}</td><td>${h(
                    when(job.finished_at)
                )}</td></tr>`
        )
        .join("")}</tbody></table>`;
}

// "tab:Todas" → "Todas las cartas"; events keep a readable name.
const KEY_LABELS = {
    carta: "Fichas de carta abiertas",
    busqueda: "Búsquedas",
    "cuenta:registro": "Cuentas creadas",
    "wantlist:agregar": "Cartas añadidas a listas de deseados"
};

function topHtml(rows) {
    if (!rows.length) return '<p class="catalog-status">Todavía no hay visitas registradas.</p>';
    return `<ul class="admin-top">${rows
        .map((row) => {
            const label = row.key.startsWith("tab:")
                ? `Pestaña ${window.TAB_LABELS[row.key.slice(4)] || row.key.slice(4)}`
                : KEY_LABELS[row.key] || row.key;
            return `<li><span>${h(label)}</span><b>${row.count}</b></li>`;
        })
        .join("")}</ul>`;
}

// ---- News of the home page (backend/app/api/news.py) ---------------------------

const NEWS_SECTIONS = { site: "Cardmática", yugioh: "Yu-Gi-Oh!" };

function newsListHtml(items) {
    if (!items.length) return '<p class="catalog-status">Todavía no hay noticias.</p>';
    return `<ul class="admin-news">${items
        .map(
            (item) =>
                `<li><span><b>${h(item.title)}</b><small>${h(NEWS_SECTIONS[item.section])} · ${h(
                    item.published_on
                )}${item.source_name ? ` · ${h(item.source_name)}` : ""}</small></span><button class="ghost" data-admin-news-delete="${h(
                    item.id
                )}">Quitar</button></li>`
        )
        .join("")}</ul>`;
}

const NEWS_FORM = `<form id="admin-news-form" class="fm-stack"><label>Sección<select name="section"><option value="site">Novedades de Cardmática</option><option value="yugioh">Noticias de Yu-Gi-Oh! (con fuente)</option></select></label><label>Título<input name="title" required minlength="3" maxlength="140"></label><label>Resumen<textarea name="summary" required minlength="3" maxlength="400" rows="2"></textarea></label><label>Enlace a la fuente<input name="url" type="url" maxlength="500" placeholder="https://"></label><label>Nombre de la fuente<input name="source_name" maxlength="120" placeholder="Konami, YGOrganization…"></label><label>Fecha<input name="published_on" type="date" required></label><button class="btn s" type="submit">Publicar</button></form>`;

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
    container.innerHTML = `<h3>Administración</h3><p class="catalog-status">Cargando…</p>`;
    try {
        const [overview, jobs] = await Promise.all([
            request(`${ADMIN}/overview`),
            request(`${ADMIN}/sync-jobs?limit=10`)
        ]);
        container.innerHTML = `<h3>Administración</h3><div class="admin-stats">${OVERVIEW.map(
            ([key, label]) => `<div class="gl pnl"><small>${label}</small><b>${overview[key]}</b></div>`
        ).join(
            ""
        )}</div><section class="gl pnl"><b>Lo más visto · últimos 7 días</b>${topHtml(
            overview.top_pages
        )}<small>Recuentos anónimos por día, sin cookies ni datos personales.</small></section><section class="gl pnl"><b>Cuentas</b><input id="admin-search" type="search" placeholder="Buscar por correo o nombre" aria-label="Buscar cuentas" value="${h(
            search
        )}"><div class="wrap" id="admin-users"></div></section><section class="gl pnl"><b>Últimas sincronizaciones</b><div class="wrap">${jobsHtml(
            jobs
        )}</div><small>Se encolan con <code>cardmatica sync</code> y las procesa el worker.</small></section><section class="gl pnl"><b>Noticias del inicio</b>${NEWS_FORM}<div id="admin-news"></div><small>Las de Yu-Gi-Oh! siempre llevan su fuente.</small></section>`;
        loadUsers();
        loadNews();
    } catch (error) {
        container.innerHTML = `<h3>Administración</h3><p class="warn">${h(error.message)}</p>`;
    }
}

export function installAdmin() {
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
            window.toast?.("Rol actualizado");
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
            window.toast?.("Noticia publicada");
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
