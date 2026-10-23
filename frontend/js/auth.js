// Accounts in the browser: sign in, register, sign out, password and sessions.
import { escapeHtml } from "./html.js";
import { request } from "./session-api.js";

const h = escapeHtml;
const BASE = "/api/v1/auth";

let user = null;
// "login" or "register": which form the Acceso panel shows first.
let mode = "login";

export const currentUser = () => user;

const call = (path, options) => request(`${BASE}${path}`, options);

function changed() {
    document.dispatchEvent(new CustomEvent("cm:account", { detail: user }));
}

// Asks the server who is signed in; called once when the page loads.
export async function loadAccount() {
    try {
        user = await call("/me");
    } catch {
        user = null;
    }
    changed();
}

function setAuthMode(value) {
    if (value === "login" || value === "register") mode = value;
}

// ---- "Acceso": sign in or create an account ---------------------------------

export function renderAuth(container) {
    if (user) {
        container.innerHTML = `<h3>Mi cuenta</h3><div class="gl pnl"><p>Sesión iniciada como <b>${h(
            user.display_name
        )}</b> (${h(user.email)}).</p><p><button class="btn s" data-go="Perfil">Ir a mi perfil</button> <button class="ghost" data-auth-logout>Cerrar sesión</button></p></div>`;
        return;
    }
    const login = mode === "login";
    container.innerHTML = `<div class="auth"><div class="auth-tabs" role="tablist"><button role="tab" aria-selected="${login}" data-auth-mode="login">Iniciar sesión</button><button role="tab" aria-selected="${!login}" data-auth-mode="register">Crear cuenta</button></div>${
        login ? loginForm() : registerForm()
    }<p class="warn" role="alert" data-auth-error hidden></p></div>`;
}

function loginForm() {
    return `<form class="gl pnl fm-stack" id="auth-login" novalidate><label>Correo<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label><label>Contraseña<input id="auth-password" type="password" autocomplete="current-password" required maxlength="200"></label><label class="check"><input id="auth-remember" type="checkbox"> Mantener la sesión iniciada en este equipo</label><button class="btn" type="submit">Iniciar sesión</button><small>¿Olvidaste tu contraseña? La recuperación por correo llega con el envío de correos (todavía no disponible).</small></form>`;
}

function registerForm() {
    return `<form class="gl pnl fm-stack" id="auth-register" novalidate><label>Nombre visible<input id="auth-name" autocomplete="nickname" required minlength="2" maxlength="60"></label><label>Correo<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label><label>Contraseña<input id="auth-password" type="password" autocomplete="new-password" required minlength="10" maxlength="200" aria-describedby="auth-password-help"></label><small id="auth-password-help">Al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.</small><label class="check"><input id="auth-terms" type="checkbox" required> Acepto los términos y condiciones y la política de privacidad</label><button class="btn" type="submit">Crear cuenta</button></form>`;
}

// ---- "Seguridad": password and open sessions ---------------------------------

export async function renderSecurity(container) {
    if (!user) {
        container.innerHTML = `<h3>Seguridad e inicio de sesión</h3><div class="gl pnl"><p>Inicia sesión para ver tus sesiones y cambiar la contraseña.</p><p><button class="btn s" data-go="Acceso" data-auth-mode="login">Iniciar sesión</button></p></div>`;
        return;
    }
    container.innerHTML = `<h3>Seguridad e inicio de sesión</h3><form class="gl pnl fm-stack" id="auth-password-form" novalidate><b>Cambiar contraseña</b><label>Contraseña actual<input id="auth-current" type="password" autocomplete="current-password" required></label><label>Contraseña nueva<input id="auth-new" type="password" autocomplete="new-password" required minlength="10"></label><button class="btn s" type="submit">Cambiar contraseña</button><small>Al cambiarla se cierran las sesiones abiertas en otros equipos.</small><p class="warn" role="alert" data-auth-error hidden></p></form><section class="gl pnl" id="auth-sessions"><b>Sesiones abiertas</b><p class="catalog-status">Cargando…</p></section>`;
    try {
        const sessions = await call("/sessions");
        const slot = container.querySelector("#auth-sessions");
        if (!slot) return;
        slot.innerHTML = `<b>Sesiones abiertas</b><ul class="auth-session-list">${sessions
            .map(
                (item) =>
                    `<li><span>${h(browserName(item.user_agent))}${
                        item.current ? " <small>(esta)</small>" : ""
                    }</span><small>Última actividad: ${h(
                        new Date(item.last_seen_at).toLocaleString("es")
                    )}</small></li>`
            )
            .join("")}</ul>${
            sessions.length > 1
                ? '<button class="ghost" data-auth-end-others>Cerrar las demás sesiones</button>'
                : ""
        }`;
    } catch (error) {
        container.querySelector("#auth-sessions").innerHTML = `<b>Sesiones abiertas</b><p class="warn">${h(
            error.message
        )}</p>`;
    }
}

function browserName(agent) {
    if (!agent) return "Navegador desconocido";
    const name = /Edg\//.test(agent)
        ? "Edge"
        : /Firefox\//.test(agent)
          ? "Firefox"
          : /Chrome\//.test(agent)
            ? "Chrome"
            : /Safari\//.test(agent)
              ? "Safari"
              : "Navegador";
    const system = /Android/.test(agent)
        ? "Android"
        : /iPhone|iPad/.test(agent)
          ? "iOS"
          : /Windows/.test(agent)
            ? "Windows"
            : /Mac OS/.test(agent)
              ? "macOS"
              : /Linux/.test(agent)
                ? "Linux"
                : "";
    return system ? `${name} en ${system}` : name;
}

// ---- Events ------------------------------------------------------------------

// Errors show inside the panel of the form that failed.
function showError(message, form) {
    const slot = form?.closest(".auth, #secv")?.querySelector("[data-auth-error]");
    if (!slot) return window.toast?.(message);
    slot.textContent = message;
    slot.hidden = false;
}

const value = (id) => document.getElementById(id)?.value.trim() ?? "";

export function installAuth({ panel, go }) {
    document.addEventListener("submit", async (event) => {
        const form = event.target;
        if (!["auth-login", "auth-register", "auth-password-form"].includes(form.id)) return;
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        try {
            if (form.id === "auth-login") {
                user = await call("/login", {
                    method: "POST",
                    body: {
                        email: value("auth-email"),
                        password: document.getElementById("auth-password").value,
                        remember: document.getElementById("auth-remember").checked
                    }
                });
                window.toast?.(`Hola, ${user.display_name}`);
                changed();
                go("Inicio");
            } else if (form.id === "auth-register") {
                if (!document.getElementById("auth-terms").checked)
                    return showError("Debes aceptar los términos y condiciones.", form);
                user = await call("/register", {
                    method: "POST",
                    body: {
                        display_name: value("auth-name"),
                        email: value("auth-email"),
                        password: document.getElementById("auth-password").value,
                        accept_terms: true
                    }
                });
                window.toast?.("Cuenta creada");
                changed();
                go("Perfil");
            } else {
                await call("/password", {
                    method: "POST",
                    body: {
                        current_password: document.getElementById("auth-current").value,
                        new_password: document.getElementById("auth-new").value
                    }
                });
                window.toast?.("Contraseña cambiada");
                renderSecurity(panel("Seguridad"));
            }
        } catch (error) {
            showError(error.message, form);
        } finally {
            button.disabled = false;
        }
    });
    // Capture phase: the mode is set before the store's router opens the panel
    // for a button that also carries data-go (the account menu entries).
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target.closest("[data-auth-mode]");
            if (!target) return;
            setAuthMode(target.dataset.authMode);
            // The tabs inside the Acceso panel switch the form in place.
            const container = panel("Acceso");
            if (container && !target.dataset.go) renderAuth(container);
        },
        true
    );
    document.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-auth-logout], [data-auth-end-others]");
        if (!target) return;
        try {
            if (target.hasAttribute("data-auth-logout")) {
                await call("/logout", { method: "POST" });
                user = null;
                window.toast?.("Sesión cerrada");
                changed();
                go("Inicio");
            } else {
                const result = await call("/sessions/end-others", { method: "POST" });
                window.toast?.(
                    result.ended === 1 ? "Se cerró 1 sesión" : `Se cerraron ${result.ended} sesiones`
                );
                renderSecurity(panel("Seguridad"));
            }
        } catch (error) {
            window.toast?.(error.message);
        }
    });
}
