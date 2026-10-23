// Full-page cart for the demo storefront in script.js (cart, ITEMS, V and the
// helpers there are globals). The popup and this page share cartTotals().
const h = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])
    );

let receipt = null;

function sellerHtml(group) {
    const seller = group.v;
    const missing = window.FREE_SHIPPING - group.sub;
    const rows = group.keys
        .map((key) => {
            const item = window.ITEMS[key];
            const line = window.cartLine(key);
            const quantity = window.cart[key];
            return `<tr><td><b>${h(line.name)}</b> ${line.tag}<small>${h(line.meta)}</small></td><td class="num hide">${window.eur(
                item.pr
            )}</td><td class="num"><div class="stepper" role="group" aria-label="Cantidad de ${h(
                line.name
            )}"><button class="ghost" data-cart-step="-1" data-key="${h(key)}" aria-label="Quitar una unidad"${
                quantity <= 1 ? " disabled" : ""
            }>−</button><output>${quantity}</output><button class="ghost" data-cart-step="1" data-key="${h(
                key
            )}" aria-label="Añadir una unidad"${quantity >= item.q ? " disabled" : ""}>+</button></div><small>${item.q} ${
                item.q === 1 ? "disponible" : "disponibles"
            }</small></td><td class="num price">${window.eur(
                item.pr * quantity
            )}</td><td class="num"><button class="ghost" data-cart-remove="${h(key)}">Quitar</button></td></tr>`;
        })
        .join("");
    return `<section class="gl pnl cart-seller"><div class="cart-seller-head"><div>${window.flag(
        seller.co
    )}<button class="lk" data-v="${seller.id}">${h(seller.n)}</button><small>${h(seller.co)} · ★ ${
        seller.rt
    } · ${group.units} ${group.units === 1 ? "artículo" : "artículos"}</small></div><div class="num"><small>Envío</small><b>${
        group.ship ? window.eur(group.ship) : "Gratis"
    }</b></div></div><div class="wrap"><table><thead><tr><th>Artículo</th><th class="num hide col-price">Precio</th><th class="num col-qty">Cantidad</th><th class="num col-total">Total</th><th class="col-action"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${rows}</tbody></table></div><p class="cart-seller-foot">${
        missing > 0
            ? `Te faltan ${window.eur(missing)} con este vendedor para el envío gratis.`
            : "Envío gratis con este vendedor."
    }<b>${window.eur(group.sub + group.ship)}</b></p></section>`;
}

export function renderCart(container) {
    if (receipt) {
        container.innerHTML = `<h3>Pedido recibido</h3><div class="gl pnl"><p>${receipt.units} ${
            receipt.units === 1 ? "artículo" : "artículos"
        } de ${receipt.sellers} ${receipt.sellers === 1 ? "vendedor" : "vendedores"} por ${window.eur(
            receipt.total
        )}.</p><small>Comercio de demostración: no se cobró nada. El stock de cada vendedor se actualizó.</small><p><button class="btn" data-go="Todas">Seguir comprando</button></p></div>`;
        receipt = null;
        return;
    }
    const totals = window.cartTotals();
    if (!totals.sellers.length) {
        container.innerHTML = `<h3>Tu carrito</h3><div class="gl pnl"><p class="empty">Tu carrito está vacío. Abre una carta, un producto o el inventario de un vendedor y añade lo que prefieras.</p><p><button class="btn" data-go="Productos">Ver productos</button></p></div>`;
        return;
    }
    const units = totals.sellers.reduce((sum, group) => sum + group.units, 0);
    container.innerHTML = `<div class="cart-page"><div class="cart-main"><h3>Tu carrito · ${units} ${
        units === 1 ? "artículo" : "artículos"
    }</h3><p class="catalog-status">Comercio de demostración: ofertas, precios y stock ilustrativos. Cada vendedor envía por separado.</p>${totals.sellers
        .map(sellerHtml)
        .join("")}</div><aside class="gl pnl cart-summary" aria-label="Resumen del pedido"><b>Resumen</b><div class="tot sm"><span>Artículos</span><span>${window.eur(
        totals.sub
    )}</span></div><div class="tot sm"><span>Envío (${totals.sellers.length} ${
        totals.sellers.length === 1 ? "vendedor" : "vendedores"
    })</span><span>${totals.ship ? window.eur(totals.ship) : "Gratis"}</span></div><div class="tot"><span>Total</span><span>${window.eur(
        totals.total
    )}</span></div><button class="btn" data-cart-buy>Finalizar compra</button><button class="ghost" data-go="Todas">Seguir comprando</button><button class="ghost" data-cart-clear>${
        window.cartClearArmed ? "Confirmar: vaciar carrito" : "Vaciar carrito"
    }</button></aside></div>`;
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
                if (next >= 1 && next <= window.ITEMS[key].q) cart[key] = next;
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
                    window.ITEMS[key].q -= cart[key];
                    delete cart[key];
                }
            }
            window.count();
            renderCart(panel());
        },
        true
    );
}
