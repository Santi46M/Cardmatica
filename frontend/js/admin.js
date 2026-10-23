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
    ["wantlists", "Wantlists"],
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
        )}</div><section class="gl pnl"><b>Cuentas</b><input id="admin-search" type="search" placeholder="Buscar por correo o nombre" aria-label="Buscar cuentas" value="${h(
            search
        )}"><div class="wrap" id="admin-users"></div></section><section class="gl pnl"><b>Últimas sincronizaciones</b><div class="wrap">${jobsHtml(
            jobs
        )}</div><small>Se encolan con <code>cardmatica sync</code> y las procesa el worker.</small></section>`;
        loadUsers();
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
}
