// Administration panel, for the staff: moderators and administrators.
// Reads /api/v1/admin (backend/app/api/admin.py) with the person's session.
//
// A moderator sees the overview, the accounts and the home page's news; blocks
// and unblocks accounts and confirms emails, except those of the staff. An
// administrator, besides, gives roles, signs accounts out, deletes them, sees
// the catalogue's syncs and the record of what the staff did. The server
// checks all of this again: the panel only leaves out what would be refused.
import { escapeHtml, html } from "./html.js";
import { lang, locale, t } from "./lang.js";
import { request } from "./session-api.js";
import { currentUser } from "./auth.js";

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
const ACCOUNT_TYPES = { buyer: "Comprador", seller: "Vendedor", both: "Comprador y vendedor" };
const ACTIONS = {
    role: "Cambió el rol",
    block: "Bloqueó la cuenta",
    unblock: "Desbloqueó la cuenta",
    verify_email: "Confirmó el correo",
    sign_out: "Cerró sus sesiones",
    delete: "Borró la cuenta",
    news_add: "Publicó una noticia",
    news_delete: "Quitó una noticia"
};
const STAFF_ROLES = ["moderator", "admin"];
const OVERVIEW = [
    ["cards", "Cartas"],
    ["printings", "Impresiones"],
    ["users", "Cuentas"],
    ["sellers", "Vendedores"],
    ["blocked", "Bloqueadas"],
    ["active_sessions", "Sesiones abiertas"],
    ["wantlists", "Listas de deseados"],
    ["sales", "Ventas registradas"],
    ["pending_jobs", "Sincronizaciones en cola"]
];

// The accounts' search and filters, kept while the panel is open.
const filters = { q: "", role: "", kind: "", blocked: "" };

const isAdmin = () => currentUser()?.role === "admin";

const when = (value) => (value ? new Date(value).toLocaleString(locale) : "—");

const selectedIf = (yes) => (yes ? " selected" : "");

const options = (labels, current) =>
    Object.entries(labels)
        .map(([value, label]) => `<option value="${value}"${selectedIf(value === current)}>${t(label)}</option>`)
        .join("");

function statusHtml(user) {
    const parts = [];
    if (user.blocked) parts.push(`<span class="warn-text">${t("Bloqueada")}</span>`);
    else if (user.locked) parts.push(`<span class="warn-text">${t("Bloqueo temporal")}</span>`);
    else parts.push(t("Activa"));
    if (!user.email_verified) parts.push(`<small>${t("correo sin confirmar")}</small>`);
    return parts.join(" ");
}

// What this person may do to that account, as buttons; the server checks again.
function actionsHtml(user) {
    const me = currentUser();
    if (user.id === me?.id) return `<small>${t("Tu cuenta")}</small>`;
    if (!isAdmin() && STAFF_ROLES.includes(user.role)) return `<small>${t("Del equipo")}</small>`;
    const id = h(user.id);
    const buttons = [
        user.blocked
            ? `<button class="ghost s" data-admin-block="${id}" data-blocked="false">${t("Desbloquear")}</button>`
            : `<button class="ghost s" data-admin-block="${id}" data-blocked="true">${t("Bloquear")}</button>`
    ];
    if (!user.email_verified) buttons.push(`<button class="ghost s" data-admin-verify="${id}">${t("Confirmar correo")}</button>`);
    if (isAdmin()) {
        if (user.sessions) buttons.push(`<button class="ghost s" data-admin-sign-out="${id}">${t("Cerrar sesiones")}</button>`);
        buttons.push(`<button class="ghost s danger" data-admin-delete="${id}">${t("Borrar")}</button>`);
    }
    return `<div class="admin-actions">${buttons.join("")}</div>`;
}

function userRow(user) {
    const store = user.store_name ? ` · ${h(user.store_name)}` : "";
    const role = isAdmin()
        ? html`<select data-admin-role="${h(user.id)}" aria-label="${h(t("Rol de {name}", { name: user.display_name }))}">${options(ROLE_LABELS, user.role)}</select>`
        : h(t(ROLE_LABELS[user.role] || user.role));
    return html`
        <tr>
            <td><b>${h(user.display_name)}</b><small>${h(user.email)}</small></td>
            <td>${h(t(ACCOUNT_TYPES[user.account_type] || ""))}${store}</td>
            <td>${h(new Date(user.created_at).toLocaleDateString(locale))}</td>
            <td>${statusHtml(user)}</td>
            <td>${role}</td>
            <td>${actionsHtml(user)}</td>
        </tr>`;
}

function usersHtml(data) {
    const rows = data.items.map(userRow).join("") || `<tr><td colspan="6" class="empty">${t("Ninguna cuenta coincide.")}</td></tr>`;
    const count = t(data.total === 1 ? "{count} cuenta" : "{count} cuentas", { count: data.total });
    return html`
        <table>
            <thead>
                <tr><th>${t("Cuenta")}</th><th>${t("Tipo")}</th><th>${t("Alta")}</th><th>${t("Estado")}</th><th>${t("Rol")}</th><th>${t("Acciones")}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <small class="catalog-status">${count}</small>`;
}

function filtersHtml() {
    const any = (label) => `<option value="">${t(label)}</option>`;
    return html`
        <div class="admin-filters">
            <input id="admin-search" type="search" placeholder="${t("Buscar por correo, nombre o tienda")}" aria-label="${t("Buscar cuentas")}" value="${h(filters.q)}">
            <select data-admin-filter="role" aria-label="${t("Rol")}">${any("Todos los roles")}${options(ROLE_LABELS, filters.role)}</select>
            <select data-admin-filter="kind" aria-label="${t("Tipo")}">${any("Compradores y vendedores")}${options({ buyer: "Compradores", seller: "Vendedores" }, filters.kind)}</select>
            <select data-admin-filter="blocked" aria-label="${t("Estado")}">${any("Cualquier estado")}${options({ false: "Activas", true: "Bloqueadas" }, filters.blocked)}</select>
        </div>`;
}

function recordHtml(rows) {
    if (!rows.length) return `<p class="catalog-status">${t("Todavía no hay acciones registradas.")}</p>`;
    const items = rows
        .map(
            (row) => html`
                <tr>
                    <td>${h(when(row.at))}</td>
                    <td>${h(row.actor)}</td>
                    <td>${h(t(ACTIONS[row.action] || row.action))}</td>
                    <td>${h(row.target || "—")}</td>
                    <td>${h(row.detail || "")}</td>
                </tr>`
        )
        .join("");
    return html`
        <table>
            <thead>
                <tr><th>${t("Fecha")}</th><th>${t("Quién")}</th><th>${t("Acción")}</th><th>${t("Cuenta")}</th><th>${t("Detalle")}</th></tr>
            </thead>
            <tbody>${items}</tbody>
        </table>`;
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

async function loadInto(id, path, draw) {
    const slot = document.getElementById(id);
    if (!slot) return;
    try {
        slot.innerHTML = draw(await request(path));
    } catch (error) {
        slot.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

function loadUsers() {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""));
    return loadInto("admin-users", `${ADMIN}/users?${query}`, usersHtml);
}

const loadNews = () => loadInto("admin-news", `${ADMIN}/news`, newsListHtml);

const loadRecord = () => loadInto("admin-record", `${ADMIN}/actions?limit=50`, recordHtml);

export async function renderAdmin(container) {
    container.innerHTML = `<h3>${t("Administración")}</h3><p class="catalog-status">${t("Cargando…")}</p>`;
    const admin = isAdmin();
    try {
        const [overview, jobs] = await Promise.all([
            request(`${ADMIN}/overview`),
            admin ? request(`${ADMIN}/sync-jobs?limit=10`) : null
        ]);
        const stats = OVERVIEW.map(
            ([key, label]) => `<div class="gl pnl"><small>${t(label)}</small><b>${overview[key]}</b></div>`
        ).join("");
        const role = t(ROLE_LABELS[currentUser()?.role] || "");
        const adminOnly = admin
            ? html`
                <section class="gl pnl">
                    <b>${t("Registro de acciones del equipo")}</b>
                    <div class="wrap" id="admin-record"></div>
                    <small>${t("Quién hizo qué y cuándo: se guarda aunque la cuenta ya no exista.")}</small>
                </section>
                <section class="gl pnl">
                    <b>${t("Últimas sincronizaciones")}</b>
                    <div class="wrap">${jobsHtml(jobs)}</div>
                    <small>${t("Se encolan con <code>cardmatica sync</code> y las procesa el worker.")}</small>
                </section>`
            : "";
        container.innerHTML = html`
            <h3>${t("Administración")} <small class="catalog-status">${h(role)}</small></h3>
            <div class="admin-stats">${stats}</div>
            <section class="gl pnl">
                <b>${t("Lo más visto · últimos 7 días")}</b>
                ${topHtml(overview.top_pages)}
                <small>${t("Recuentos anónimos por día, sin cookies ni datos personales.")}</small>
            </section>
            <section class="gl pnl">
                <b>${t("Cuentas")}</b>
                ${filtersHtml()}
                <div class="wrap" id="admin-users"></div>
                <small>${t(admin ? "Bloquear cierra todas las sesiones de la cuenta. Cada acción queda en el registro." : "Puedes bloquear cuentas y confirmar correos, salvo los del equipo. Cada acción queda en el registro.")}</small>
            </section>
            ${adminOnly}
            <section class="gl pnl">
                <b>${t("Noticias del inicio")}</b>
                ${newsForm()}
                <div id="admin-news"></div>
                <small>${t("Las de Yu-Gi-Oh! siempre llevan su fuente. Las de los feeds llegan solas, cada una en su idioma.")}</small>
            </section>`;
        loadUsers();
        loadNews();
        if (admin) loadRecord();
    } catch (error) {
        container.innerHTML = `<h3>${t("Administración")}</h3><p class="warn">${h(error.message)}</p>`;
    }
}

// An action on an account, then the table (and the record) again.
async function act(path, options, done) {
    try {
        await request(`${ADMIN}${path}`, options);
        window.toast?.(t(done));
    } catch (error) {
        window.toast?.(error.message);
    }
    loadUsers();
    if (isAdmin()) loadRecord();
}

// Deleting asks for a second click on the same button within a few seconds.
const CONFIRM_MS = 4000;

function confirmed(button) {
    if (button.dataset.armed) return true;
    button.dataset.armed = "1";
    const label = button.textContent;
    button.textContent = t("¿Seguro? Toca otra vez");
    setTimeout(() => {
        delete button.dataset.armed;
        button.textContent = label;
    }, CONFIRM_MS);
    return false;
}

export function installAdmin() {
    let timer;
    document.addEventListener("input", (event) => {
        if (event.target.id !== "admin-search") return;
        filters.q = event.target.value.trim();
        clearTimeout(timer);
        timer = setTimeout(loadUsers, 250);
    });
    document.addEventListener("change", async (event) => {
        const filter = event.target.dataset.adminFilter;
        if (filter) {
            filters[filter] = event.target.value;
            return loadUsers();
        }
        const id = event.target.dataset.adminRole;
        if (!id) return;
        act(`/users/${id}/role`, { method: "POST", body: { role: event.target.value } }, "Rol actualizado");
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
        const button = event.target.closest("[data-admin-block], [data-admin-verify], [data-admin-sign-out], [data-admin-delete], [data-admin-news-delete]");
        if (!button) return;
        const { adminBlock, adminVerify, adminSignOut, adminDelete, adminNewsDelete } = button.dataset;
        if (adminBlock) {
            const blocked = button.dataset.blocked === "true";
            act(`/users/${adminBlock}/block`, { method: "POST", body: { blocked } }, blocked ? "Cuenta bloqueada" : "Cuenta desbloqueada");
        } else if (adminVerify) {
            act(`/users/${adminVerify}/verify-email`, { method: "POST" }, "Correo confirmado");
        } else if (adminSignOut) {
            act(`/users/${adminSignOut}/sign-out`, { method: "POST" }, "Sesiones cerradas");
        } else if (adminDelete) {
            if (confirmed(button)) act(`/users/${adminDelete}`, { method: "DELETE" }, "Cuenta borrada");
        } else if (adminNewsDelete) {
            try {
                await request(`${ADMIN}/news/${adminNewsDelete}`, { method: "DELETE" });
                loadNews();
            } catch (error) {
                window.toast?.(error.message);
            }
        }
    });
}
