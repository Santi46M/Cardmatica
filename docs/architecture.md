# Inspección y decisiones

Inspección realizada el 20 de octubre de 2026, antes de modificar la aplicación.
El repositorio contenía únicamente index.html, styles.css y script.js, además de
metadatos de IntelliJ y Git. No había backend, dependencias, tests ni base de datos.

El JavaScript original construye CARDS, ITEMS, PR y V en memoria mediante datos
de demostración y un generador pseudoaleatorio. Los IDs son índices de arrays;
no son identificadores oficiales. El carrito referencia ITEMS y sus cantidades.
TCG/OCG filtra cartas duplicadas de ejemplo; las monedas se guardan en localStorage.
Las fichas, precios e historiales originales son ilustrativos. Hay declaraciones
duplicadas de init, inv, add y showCart y una extensión final de list/init.

Actualización (23 de octubre de 2026): script.js se reescribió como
frontend/demo/data.js (datos de la demo en tablas con nombre) y
frontend/demo/store.js (lógica legible, sin duplicados ni código
inalcanzable). Los nombres globales pasaron a ser descriptivos: LISTINGS,
SELLERS, PRODUCTS, market, currency, formatPrice, showTab y refreshList. Con
la misma semilla la demo genera exactamente los mismos datos que antes.

Se conservan los controles, diseño de vidrio, modal, navegación, carrito y flujos
comerciales anteriores. Un adaptador explícito conecta las vistas del catálogo
con la API; los UUID del catálogo jamás se interpretan como índices de ITEMS.
Las ofertas anteriores continúan identificadas como demostración: no existe aún
un backend comercial y no se presentan como ofertas de cartas importadas.

PostgreSQL + SQLAlchemy 2 + Alembic evita una migración posterior desde almacenamiento
local y permite integridad, búsquedas e historial con concurrencia. FastAPI sirve
la API y archivos frontend permitidos desde el mismo origen. El mantenimiento es
un CLI/worker independiente; las rutas públicas solo consultan PostgreSQL.

El modelo separa identidad, nombres, impresiones, imágenes, textos, erratas,
arquetipos/series, relaciones, banlists, observaciones por campo y trabajos.
La sincronización usa transacciones por carta, checkpoints y leases persistentes.
No se añade Redis ni una cola externa; PostgreSQL actúa como cola de trabajos.

La correspondencia prioriza CID y referencias previamente validadas. Un passcode
requiere además nombre localizado exacto y tipo coincidente. La similitud difusa
no fusiona cartas. Las discrepancias quedan en data_conflicts. La identidad
de impresión incluye código, idioma, rareza, edición y arte. Las dimensiones
desconocidas permanecen explícitas y no justifican asignar imágenes.

El 21 de octubre se sustituyó el cliente activo de Konami por YGOPRODeck v7 sin
crear otro backend. Las migraciones 003 y 004 incorporan ygoprodeck_id único,
disponibilidad regional, ilustraciones generales y fuente de nombres/textos.
La identidad del proveedor permite importar cartas sin CID; el CID, cuando viene
informado, es independiente. Un desacuerdo entre ambos produce conflicto, no una fusión.
La jerarquía es Konami histórico autorizado (100), YGOPRODeck (80), Yugipedia (20).
El texto vigente del proveedor conserva is_official=false y fuente explícita.
Sus revisiones crean versiones históricas sin inferir una errata.

card_artworks no tiene FK a una impresión. Las dimensiones de edición y arte
que YGOPRODeck no documenta quedan unknown en las impresiones. La fecha de un
set se guarda en sets.release_date y no se copia a todas sus impresiones.
La disponibilidad OCG informada en misc_info no crea impresiones OCG ficticias:
la búsqueda devuelve la carta y la ficha explica si no hay impresiones para ese mercado.
Las tarjetas pueden mostrar ilustración general con etiqueta; printing.images
permanece reservado al escaneo específico y autorizado.

El worker conserva sus checkpoints, lotes, reintentos y transacciones por carta.
La paginación de YGOPRODeck utiliza num/offset y reutiliza la respuesta del lote.
El incremental revalida páginas e identifica cambios por hash; no existe un feed
documentado de cartas modificadas ni se usan fechas de lanzamiento como sustituto.
