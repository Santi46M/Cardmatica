# Cumplimiento: estado del sitio

Revisión del 25 de octubre de 2026. Todo el texto legal es un **borrador** pendiente de
revisión por un abogado de cada país; en el sitio lo marca un lápiz (✎, clase `.prov`).
Las páginas existen en español, portugués e inglés.

| Punto | Estado | Dónde |
|---|---|---|
| Política de privacidad | Hecho (borrador): responsable, datos y para qué, menores, cookies, terceros, plazos, derechos y autoridades de UY, AR y BR | `/privacidad` |
| Términos de servicio | Hecho (borrador): cuenta de 18+, contenido, precios y cargos, valoraciones, compraventa | `/terminos` |
| Política de reembolsos | Hecho (borrador): arrepentimiento por país, productos con problemas, reembolsos | `/reembolsos` |
| Botón de arrepentimiento (AR, Res. 424/2020) | Enlace en el pie de todas las páginas, a `/reembolsos#arrepentimiento`. El formulario sin registro y el código en 24 h llegan con los pedidos reales | `frontend/pages/footer.html` |
| Política de cookies | Hecho (borrador): las 3 cookies, su fin y duración, y cada dato del almacenamiento del navegador | `/cookies` |
| Aviso de cookies | Hecho: informativo, sin casillas premarcadas ni nada que aceptar, porque solo hay cookies necesarias (ANPD, guía de cookies). Si algún día hay cookies no necesarias, hará falta pedir consentimiento con «Rechazar» tan fácil como «Aceptar» | `frontend/cookie-notice.js` |
| Consentimientos de formularios | Registro: dos casillas sin marcar (18+ y términos, con enlaces a términos y privacidad); el servidor exige las dos. «Mantener la sesión» empieza sin marcar | `frontend/js/auth.js`, `backend/app/api/auth.py` |
| Datos innecesarios | El perfil pide solo nombre y país; dirección y teléfono son opcionales; los métodos de pago solo a vendedores y no se guardan para compradores. Las estadísticas son recuentos anónimos | `backend/app/schemas/accounts.py` |
| SDK de terceros | Ninguno en el navegador: sin scripts, fuentes, estadísticas ni publicidad externas; la CSP solo permite el propio sitio. El servidor consulta YGOPRODeck, los feeds de noticias y la API de GitHub, y envía correo por el SMTP configurado | `backend/app/core/security.py` |
| Patrones engañosos | Revisado: vaciar carrito y borrar cuenta piden confirmación, los avisos se cierran, nada viene premarcado, no hay cuentas regresivas falsas ni presión de compra | — |
| Cargos ocultos | El total muestra el envío de cada vendedor y dice que no se suma otro cargo; los importes en otras monedas se marcan como aproximados; los términos prometen publicar toda tarifa antes de abrir ventas | carrito y `/terminos` |
| Reseñas falsas | Las valoraciones de la tienda demo se marcan «ficticia» en la tabla, el asistente de compra y los términos; las normas prohíben reseñas falsas | `index.html`, `/normas` |
| Afirmaciones sin respaldo | Corregido «contraseña cifrada» → «guardada como hash». No hay promesas de precio, seguridad o garantías sin respaldo | `/privacidad` |
| Texto alternativo | Toda imagen tiene `alt`; los íconos con significado tienen `role="img"` y nombre; auditoría propia sin errores | `backend/tests/test_browser.py` |
| Contraste | Auditoría en modo oscuro y claro, en los tres idiomas: sin textos por debajo de 4,5:1 (3:1 en texto grande) | ver «Cómo se revisó» |
| Navegación por teclado | Tab recorre cabecera, pestañas y contenido en orden y el foco siempre se ve; ventanas con Esc y foco atrapado; filas y menú con Enter y flechas; cada vista tiene un `<h1>` | `frontend/demo/store.js`, `account-menu.js` |
| Datos del negocio | Página `/aviso-legal` con responsable, identificación fiscal, dirección, país y correo desde la configuración (`BUSINESS_*`). **Pendiente: los datos reales** (se ve «Pendiente de completar» ✎) | `.env.example` |
| Edad y datos de menores | Solo mayores de 18 (casilla obligatoria, fecha guardada); no se recogen datos de menores (LGPD art. 14 pediría consentimiento de los padres) | migración 014 |
| Darse de baja de correos | Solo hay correos de la cuenta (confirmar correo, recuperar contraseña), no publicidad: no hay lista de la que darse de baja. El pie de cada correo lo dice y enlaza para descargar o borrar los datos. Si un día hay boletines, necesitarán consentimiento y un enlace de baja en cada envío | `backend/app/services/accounts.py` |
| Licencias de fuentes e imágenes | Tipografías del sistema (no se descargan); logo, íconos, banderas e imagen social propios; ilustraciones de cartas nunca públicas sin licencia; marcas de productos de sus dueños. Créditos en el aviso legal | `/aviso-legal` |
| Pedido de borrado de datos | «Seguridad e inicio de sesión» → «Borrar mi cuenta» (contraseña + casilla) borra cuenta, perfil, preferencias, listas y sesiones; «Descargar mis datos» da un JSON con todo | `/api/v1/account/delete`, `/api/v1/account/export` |

## Pendiente antes de abrir ventas reales

- Revisión legal de todos los textos en cada país y completar plazos de Paraguay y
  Bolivia. Uruguay: la Ley 20.531 (octubre de 2026) cita el art. 16 de la Ley 17.250;
  confirmar si cambió el plazo de 5 días hábiles.
- Datos reales del responsable (`BUSINESS_*`) y registro de la base de datos ante la
  URCDP si el responsable está en Uruguay.
- Formulario del botón de arrepentimiento (sin registro, código en 24 h) y libro de
  quejas o canal de reclamos, junto con los pedidos.
- Pedir consentimiento por separado si se agregan boletines, estadísticas con cookies o
  servicios de terceros en el navegador.

## Fuentes consultadas

- Uruguay, Ley 17.250, art. 16: <https://impo.com.uy/bases/leyes/17250-2000/16>
- Argentina, botón de arrepentimiento (Res. 424/2020):
  <https://www.marval.com/publicacion/nueva-normativa-sobre-e-commerce-permite-a-los-consumidores-cambiar-de-opinion-13815>,
  <https://allende.com/administrativo/los-proveedores-de-bienes-y-servicios-en-linea-deberan-incorporar-el-boton-de-arrepentimiento-en-sus-sitios-o-aplicaciones-web-10-09-2020/>
- Brasil, direito de arrependimento (CDC art. 49, Decreto 7.962/2013):
  <https://mpce.mp.br/decon/duvidas/direito-de-arrependimento/>
- Brasil, ANPD y cookies: <https://www.felsberg.com.br/cookies-e-protecao-de-dados-pessoais-orientacoes-da-anpd/>
- Brasil, LGPD art. 14 (niños y adolescentes):
  <https://serpro.gov.br/lgpd/noticias/criancas-adolescentes-lgpd-lei-geral-protecao-de-dados-pessoais>
- Uruguay, deberes de información de la Ley 18.331 (modificaciones de 2023):
  <https://uy.andersen.com/documents/Modificacion_Ley_18331.pdf>

## Cómo se revisó

Pruebas automáticas (`backend/tests`): consentimientos y edad al registrarse, perfil
mínimo, exportar y borrar la cuenta, pie de los correos, páginas legales en los tres
idiomas con el pie común, y una prueba de navegador que borra una cuenta. Además, una
auditoría con el navegador recorre inicio, catálogo, productos, acceso y páginas legales
en modo oscuro y claro y en es/pt/en, buscando imágenes sin `alt`, controles y campos
sin nombre, ids repetidos, `<h1>` y contraste, y comprueba el orden del foco con Tab.
