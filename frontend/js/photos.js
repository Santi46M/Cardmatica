// Catalogue photos sent by sellers (backend/app/api/photos.py).
// A photo shows the printing itself (set, rarity, edition): it enters as
// pending and appears only after a moderator approves it.
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";
import { currentUser } from "./auth.js";
import { currentProfile } from "./profile.js";
import { request } from "./session-api.js";

const h = escapeHtml;
const TYPES = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;

const sells = () => currentUser() && ["seller", "both"].includes(currentProfile()?.role);

// The button under the card picture, only for signed-in sellers.
export function photoUploadHtml(printing) {
    if (!printing || !sells()) return "";
    return html`
        <div class="cd-photo">
            <button class="ghost s" type="button" data-photo-upload="${h(printing.id)}">📷 ${t("Subir foto de esta impresión")}</button>
            <input type="file" accept="${TYPES}" hidden data-photo-file="${h(printing.id)}">
            <small class="catalog-status" data-photo-status aria-live="polite"></small>
        </div>`;
}

async function send(input) {
    const file = input.files?.[0];
    const status = input.parentElement.querySelector("[data-photo-status]");
    input.value = "";
    if (!file) return;
    if (!TYPES.split(",").includes(file.type)) {
        status.textContent = t("Elige una foto PNG, JPEG o WebP.");
        return;
    }
    if (file.size > MAX_BYTES) {
        status.textContent = t("La foto debe pesar menos de 8 MB.");
        return;
    }
    status.textContent = t("Enviando…");
    try {
        const result = await request(`/api/v1/account/photos/${input.dataset.photoFile}`, {
            method: "POST",
            file
        });
        status.textContent = result.created
            ? t("Foto enviada: un moderador la revisará antes de mostrarla.")
            : t("Ya habías enviado esta foto.");
    } catch (error) {
        status.textContent = error.message;
    }
}

export function installPhotoUpload() {
    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-photo-upload]");
        if (!button) return;
        button.parentElement.querySelector("[data-photo-file]")?.click();
    });
    document.addEventListener("change", (event) => {
        if (event.target.matches?.("[data-photo-file]")) send(event.target);
    });
}

// ---- Moderation, inside the administration panel -------------------------------

const MODERATION = "/api/v1/admin/images";

function pendingRow(photo) {
    const printing = [photo.code, photo.rarity, photo.edition, photo.language].filter(Boolean).join(" · ");
    const by = photo.uploaded_by ? t("Enviada por {name}", { name: photo.uploaded_by }) : t("Foto del equipo");
    return html`
        <li class="mod-photo">
            <a href="${MODERATION}/${h(photo.id)}/file" target="_blank" rel="noopener">
                <img src="${MODERATION}/${h(photo.id)}/file?thumbnail=true" alt="${h(photo.card_name)}" width="60" height="88" loading="lazy">
            </a>
            <span>
                <b>${h(photo.card_name)}</b>
                <small>${h(printing)}</small>
                <small>${h(by)} · ${h(new Date(photo.created_at).toLocaleDateString())}</small>
            </span>
            <span class="mod-actions">
                <input data-photo-note maxlength="500" placeholder="${t("Motivo, si la rechazas")}" aria-label="${t("Motivo del rechazo")}">
                <button class="btn s" data-photo-review="approved" data-photo-id="${h(photo.id)}">${t("Aprobar")}</button>
                <button class="ghost s" data-photo-review="rejected" data-photo-id="${h(photo.id)}">${t("Rechazar")}</button>
            </span>
        </li>`;
}

export async function loadModeration() {
    const slot = document.getElementById("admin-photos");
    if (!slot) return;
    try {
        const items = await request(`${MODERATION}/pending`);
        slot.innerHTML = items.length
            ? `<ul class="mod-photos">${items.map(pendingRow).join("")}</ul>`
            : `<p class="catalog-status">${t("No hay fotos esperando revisión.")}</p>`;
    } catch (error) {
        slot.innerHTML = `<p class="warn">${h(error.message)}</p>`;
    }
}

// The section of the panel; the permission is asked for once and remembered
// while the panel is open, since it is usually the same upload terms.
export function moderationHtml() {
    return html`
        <section class="gl pnl">
            <b>${t("Fotos de vendedores por revisar")}</b>
            <label>
                ${t("Permiso que cubre las fotos aprobadas")}
                <input id="admin-photo-permission" maxlength="2000" placeholder="${t("p. ej. Términos de subida de fotos v1")}">
            </label>
            <div id="admin-photos"></div>
            <small>${t("Una foto aprobada se muestra después de los escaneos propios y de Yugipedia.")}</small>
        </section>`;
}

export function installModeration() {
    document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-photo-review]");
        if (!button) return;
        const decision = button.dataset.photoReview;
        const permission = document.getElementById("admin-photo-permission")?.value.trim();
        if (decision === "approved" && !permission) {
            window.toast?.(t("Indica qué permiso cubre la foto antes de aprobarla."));
            return;
        }
        // The reason is shown to whoever sent the photo.
        const note = button.closest(".mod-photo")?.querySelector("[data-photo-note]")?.value.trim() || null;
        try {
            await request(`${MODERATION}/${button.dataset.photoId}/review`, {
                method: "POST",
                body: { decision, authorization_reference: permission || null, note }
            });
            window.toast?.(t(decision === "approved" ? "Foto aprobada" : "Foto rechazada"));
            loadModeration();
        } catch (error) {
            window.toast?.(error.message);
        }
    });
}
