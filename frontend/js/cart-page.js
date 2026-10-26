// Full-page cart for the demo store (frontend/demo/store.js, whose cart,
// LISTINGS and helpers are globals). The popup and this page share cartTotals().
import { escapeHtml, html } from "./html.js";
import { t } from "./lang.js";

const h = escapeHtml;
const price = (euros) => window.formatPrice(euros);
const plural = (count, one, many) => t(count === 1 ? one : many, { count });
const articles = (count) => plural(count, "{count} artículo", "{count} artículos");
const sellers = (count) => plural(count, "{count} vendedor", "{count} vendedores");
const NO_HIDDEN_FEES =
    "El total ya incluye el envío de cada vendedor; no se suma ningún otro cargo. Los importes en otras monedas son conversiones aproximadas.";

let receipt = null;

// One line of a seller's box: the item, its price, a − / + stepper and its total.
function lineHtml(key) {
    const item = window.LISTINGS[key];
    const line = window.cartLine(key);
    const quantity = window.cart[key];
    const stepLabel = h(t("Cantidad de {name}", { name: line.name }));
    return html`
        <tr>
            <td><b>${h(line.name)}</b> ${line.tag}<small>${h(line.meta)}</small></td>
            <td class="num hide">${price(item.price)}</td>
            <td class="num">
                <div class="stepper" role="group" aria-label="${stepLabel}">
                    <button class="ghost" data-cart-step="-1" data-key="${h(key)}" aria-label="${t("Quitar una unidad")}"${quantity <= 1 ? " disabled" : ""}>−</button>
                    <output>${quantity}</output>
                    <button class="ghost" data-cart-step="1" data-key="${h(key)}" aria-label="${t("Añadir una unidad")}"${quantity >= item.quantity ? " disabled" : ""}>+</button>
                </div>
                <small>${plural(item.quantity, "{count} disponible", "{count} disponibles")}</small>
            </td>
            <td class="num price">${price(item.price * quantity)}</td>
            <td class="num"><button class="ghost" data-cart-remove="${h(key)}">${t("Quitar")}</button></td>
        </tr>`;
}

// Each seller ships separately: their items, shipping and what is left for free shipping.
function sellerHtml(group) {
    const seller = group.seller;
    const missing = window.SHIPPING.freeFrom - group.sub;
    const shipping =
        missing > 0
            ? h(t("Te faltan {amount} con este vendedor para el envío gratis.", { amount: price(missing) }))
            : t("Envío gratis con este vendedor.");
    return html`
        <section class="gl pnl cart-seller">
            <div class="cart-seller-head">
                <div>
                    ${window.flag(seller.country)}<button class="lk" data-v="${seller.id}">${h(seller.name)}</button>
                    <small>${h(t(seller.country))} · ★ ${seller.rating} · ${articles(group.units)}</small>
                </div>
                <div class="num"><small>${t("Envío")}</small><b>${group.ship ? price(group.ship) : t("Gratis")}</b></div>
            </div>
            <div class="wrap">
                <table>
                    <thead>
                        <tr>
                            <th>${t("Artículo")}</th>
                            <th class="num hide col-price">${t("Precio")}</th>
                            <th class="num col-qty">${t("Cantidad")}</th>
                            <th class="num col-total">${t("Total")}</th>
                            <th class="col-action"><span class="sr-only">${t("Acciones")}</span></th>
                        </tr>
                    </thead>
                    <tbody>${group.keys.map(lineHtml).join("")}</tbody>
                </table>
            </div>
            <p class="cart-seller-foot">${shipping}<b>${price(group.sub + group.ship)}</b></p>
        </section>`;
}

function receiptHtml() {
    const summary = t("{items} de {sellers} por {total}.", {
        items: articles(receipt.units),
        sellers: sellers(receipt.sellers),
        total: price(receipt.total)
    });
    return html`
        <h3>${t("Pedido recibido")}</h3>
        <div class="gl pnl">
            <p>${h(summary)}</p>
            <small>${t("Comercio de demostración: no se cobró nada. El stock de cada vendedor se actualizó.")}</small>
            <p><button class="btn" data-go="Todas">${t("Seguir comprando")}</button></p>
        </div>`;
}

export function renderCart(container) {
    if (receipt) {
        container.innerHTML = receiptHtml();
        receipt = null;
        return;
    }
    const totals = window.cartTotals();
    if (!totals.sellers.length) {
        const empty = t("Tu carrito está vacío. Abre una carta, un producto o el inventario de un vendedor y añade lo que prefieras.");
        container.innerHTML = html`
            <h3>${t("Tu carrito")}</h3>
            <div class="gl pnl">
                <p class="empty">${empty}</p>
                <p><button class="btn" data-go="Productos">${t("Ver productos")}</button></p>
            </div>`;
        return;
    }
    const units = totals.sellers.reduce((sum, group) => sum + group.units, 0);
    const demo = t("Comercio de demostración: ofertas, precios y stock ilustrativos. Cada vendedor envía por separado.");
    const clear = t(window.cartClearArmed ? "Confirmar: vaciar carrito" : "Vaciar carrito");
    container.innerHTML = html`
        <div class="cart-page">
            <div class="cart-main">
                <h3>${t("Tu carrito")} · ${articles(units)}</h3>
                <p class="catalog-status">${demo}</p>
                ${totals.sellers.map(sellerHtml).join("")}
            </div>
            <aside class="gl pnl cart-summary" aria-label="${t("Resumen del pedido")}">
                <b>${t("Resumen")}</b>
                <div class="tot sm"><span>${t("Artículos")}</span><span>${price(totals.sub)}</span></div>
                <div class="tot sm">
                    <span>${t("Envío ({sellers})", { sellers: sellers(totals.sellers.length) })}</span>
                    <span>${totals.ship ? price(totals.ship) : t("Gratis")}</span>
                </div>
                <div class="tot"><span>${t("Total")}</span><span>${price(totals.total)}</span></div>
                <small>${t(NO_HIDDEN_FEES)}</small>
                <button class="btn" data-cart-buy>${t("Finalizar compra")}</button>
                <button class="ghost" data-go="Todas">${t("Seguir comprando")}</button>
                <button class="ghost" data-cart-clear>${clear}</button>
            </aside>
        </div>`;
}

export function installCart({ panel, open }) {
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target.closest(
                "[data-cart-expand], [data-cart-step], [data-cart-remove], [data-cart-buy], [data-cart-clear]"
            );
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (target.hasAttribute("data-cart-expand")) {
                document.getElementById("cart").classList.remove("on");
                return open();
            }
            const cart = window.cart;
            if (!target.hasAttribute("data-cart-clear")) window.cartClearArmed = false;
            if (target.dataset.cartStep) {
                const key = target.dataset.key;
                const next = cart[key] + Number(target.dataset.cartStep);
                if (next >= 1 && next <= window.LISTINGS[key].quantity) cart[key] = next;
            } else if (target.dataset.cartRemove) {
                delete cart[target.dataset.cartRemove];
            } else if (target.hasAttribute("data-cart-clear")) {
                if (!window.cartClearArmed) window.cartClearArmed = true;
                else {
                    for (const key of Object.keys(cart)) delete cart[key];
                    window.cartClearArmed = false;
                }
            } else if (target.hasAttribute("data-cart-buy")) {
                const totals = window.cartTotals();
                receipt = {
                    total: totals.total,
                    sellers: totals.sellers.length,
                    units: totals.sellers.reduce((sum, group) => sum + group.units, 0)
                };
                for (const key of Object.keys(cart)) {
                    window.LISTINGS[key].quantity -= cart[key];
                    delete cart[key];
                }
            }
            window.updateCartCount();
            renderCart(panel());
        },
        true
    );
}
