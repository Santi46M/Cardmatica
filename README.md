# Cardmática

Catálogo persistido de Yu-Gi-Oh! con FastAPI, PostgreSQL, SQLAlchemy 2 y Alembic,
integrado a la interfaz HTML/CSS/JavaScript existente. El mantenimiento de fuentes
se ejecuta por CLI o worker; ninguna visita al catálogo dispara scraping.

## Estado y límites reales

La fuente principal es **YGOPRODeck API v7**. La API, persistencia, normalización,
procedencia, reconciliación, trabajos y vistas reutilizan la arquitectura existente. Las
pruebas automatizadas usan fixtures sintéticas y HTTP simulado. Las
funcionalidades comerciales originales se conservan y están identificadas como
demostración. No existe todavía un backend de vendedores, precios ni pedidos.
Los UUID del catálogo no se mezclan con los índices del carrito original.

Se cargó una muestra real desde YGOPRODeck: **5 cartas, 164 impresiones, 103 sets,
5 arquetipos y 24 ilustraciones** (21 de octubre de 2026). No son semillas ficticias.
Las ilustraciones están separadas de los escaneos por impresión: no acreditan la
rareza ni edición seleccionada. Su visualización local de prueba no concede derechos
comerciales sobre el arte o texto de Konami. Producción no sirve ilustraciones sin
permiso documentado. Consulte [las condiciones de las fuentes](docs/source-policies.md).

Yugipedia permanece como complemento opcional y deshabilitado: sus restricciones
de acceso para agentes de IA impidieron validar aquí sus erratas y escaneos reales.
El conector activo de Konami fue retirado. Se preservan sus identificadores,
procedencia histórica y parsers de importaciones autorizadas, sin consultas automáticas.

## Organización

```text
index.html, styles.css          Página y estilos
frontend/js/catalog.js          Punto de entrada: pestañas, lista, ficha, dirección de la página
frontend/js/catalog-view.js     HTML de la lista, la cuadrícula y la ficha de carta
frontend/js/card-types.js       Tipos de carta por niveles, en español, y sus filtros
frontend/js/search-suggest.js   Sugerencias con miniatura mientras se escribe en la búsqueda
frontend/js/auth.js, account-menu.js, profile.js, wantlists.js   Cuenta y sus datos
frontend/js/admin.js            Panel de administración
frontend/js/config.js           Valores ajustables del frontend (paginación, tiempos, cachés)
frontend/pages/, assets/        Páginas legales y 404; íconos e imagen Open Graph
frontend/demo/data.js           Datos inventados de la tienda demo (vendedores, productos, monedas, envío)
frontend/demo/store.js          Tienda demo y piezas compartidas (pestañas, moneda, ventanas, carrito)
backend/app/core/               Configuración, logging JSON, cabeceras de seguridad, caché y versiones de archivos
backend/app/models/             Catálogo, procedencia, cuentas, wantlists y estadísticas
backend/app/repositories/       SQL paginado y upserts
backend/app/services/           Reconciliación, tipos de carta, cuentas, correo, precios e imágenes
backend/app/integrations/       HTTP respetuoso, YGOPRODeck y Yugipedia
backend/app/ingestion/          Normalización, checkpoints y worker
backend/app/api/                Catálogo, cuentas, administración, estadísticas y páginas HTML
backend/alembic/                Migraciones versionadas
backend/tests/                  Dominio, HTTP simulado, API y navegador
```

Las decisiones de integración están en [architecture.md](docs/architecture.md).
El resultado de las pruebas y los pendientes de producción están en
[validation.md](docs/validation.md).

## Requisitos

- Python 3.12 o superior; implementación verificada localmente con Python 3.14.
- Docker Desktop con motor Linux para PostgreSQL 17, o PostgreSQL administrado.
- Chrome para las pruebas opcionales en Windows. En Linux se puede instalar Chromium
  con `python -m playwright install chromium`.
- El rol de migraciones debe poder crear tablas e instalar `pg_trgm`. En un servicio
  administrado, solicitar al administrador que instale esa extensión previamente.

## Probar en el navegador con GitHub Codespaces

No requiere instalar nada. En GitHub: **Code → Codespaces → Create codespace** sobre la rama
deseada. El entorno (`.devcontainer/`) crea `.env`, levanta PostgreSQL y la API con Docker e
importa las banlists. Cuando el puerto 8000 aparece en la pestaña **Ports**, abrir su dirección.
El catálogo empieza vacío. Para cargar unas 1000 cartas, cada una con dos impresiones de
rarezas distintas (la original y la más reciente en otra rareza), en la terminal del Codespace:

```bash
docker compose exec api cardmatica sync ygoprodeck initial --max-cards 1000 --max-printings 2
```

Tarda unos minutos y termina con `"status": "paused"`: es lo esperado, se detuvo al llegar al
límite. Sin `--max-printings` se importan todas las impresiones de cada carta.

Para ver ilustraciones (vista provisional, sin licencia comercial), tras cargar cartas.
Respeta un ritmo de una petición por segundo (dos por carta), así que 1000 cartas tardan
alrededor de media hora; se puede cortar y retomar, solo baja las que faltan:

```bash
docker compose exec api cardmatica preview-images --max-cards 1000
```

El Codespace activa esa vista al crearse (`backend/scripts/enable_preview_images.py`, que
acepta el dominio privado `.app.github.dev`). En un Codespace creado antes, ejecutar ese script
y luego `docker compose up -d api`. Cada imagen así mostrada lleva un aviso rojo «!» que explica
que es provisional. **Mantener el puerto 8000 privado** (valor por defecto): si se hace público,
cualquiera vería ilustraciones sin licencia. Los Codespaces consumen la cuota mensual de la
cuenta de GitHub; detenerlos al terminar.

## Windows 11 — PowerShell

Ejecutar desde la raíz del repositorio. No es necesario activar el entorno virtual.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "backend[dev]"
.\.venv\Scripts\python.exe backend/scripts/init_env.py
docker compose up -d db --wait
.\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`init_env.py` crea `.env` con contraseñas y token aleatorios sin mostrarlos. No pisa
una configuración existente. El puerto de PostgreSQL es **55432**, accesible solo
en localhost. Si se cambia POSTGRES_PORT, actualizar también DATABASE_URL. `.env`
está excluido de Git. La interfaz y API se sirven en http://localhost:8000; OpenAPI
en http://localhost:8000/docs. No abrir index.html como `file://`.

Para usar una instancia PostgreSQL externa, configurar DATABASE_URL y ejecutar
las mismas migraciones. CORS_ORIGINS es una lista JSON de orígenes permitidos.
Por defecto frontend y API comparten origen, sin configuración adicional.

## Windows 11 — Git Bash

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -e 'backend[dev]'
python backend/scripts/init_env.py
docker compose up -d db --wait
python -m alembic -c backend/alembic.ini upgrade head
python -m uvicorn app.main:app --reload
```

## Ejecución íntegra con Docker

Tras crear `.env`:

```bash
docker compose up --build -d db api
docker compose --profile maintenance up --build -d worker
docker compose logs -f api worker
```

La API aplica migraciones antes de iniciar. El worker consume trabajos pendientes
de PostgreSQL. Las fuentes continúan sujetas a sus permisos y configuración.
El frontend se monta en modo lectura. La caché y las imágenes usan un volumen
separado; PostgreSQL usa su propio volumen. `docker compose down` conserva esos
volúmenes; evitar `down -v` salvo que se desee eliminar los datos.

## Configurar fuentes

1. Revisar los términos y robots vigentes con el operador de cada servicio.
2. YGOPRODECK_ENABLED=true habilita la API pública documentada. USER_AGENT debe
   identificar el servicio. Se usa una petición por segundo, por debajo del máximo
   del proveedor (20/s), y caché persistente de dos días para cartas y sets.
3. Para mostrar las imágenes de la muestra exclusivamente en localhost, configurar
   DEPLOYMENT_MODE=local y ALLOW_LOCAL_IMAGE_PREVIEW=true y ejecutar `images`.
   Los valores por defecto son production/false; no equivalen a una licencia comercial.
4. Para Yugipedia, confirmar que el acceso del servicio está permitido y habilitar
   YUGIPEDIA_ENABLED. La cuota mínima es una petición por segundo, incluyendo
   robots, API, reintentos e imágenes. Procesos independientes deben compartir
   CACHE_DIRECTORY para compartir el presupuesto HTTP.

El cliente valida orígenes, robots, UA, timeout, tamaño de respuesta, reintentos y
redirecciones. Un CAPTCHA, 401, 403 o denegación de robots suspende el trabajo.
La caché usa revalidación ETag/Last-Modified. MediaWiki conserva 30 días y usa
recentchanges para incrementales y embeddedin para enumerar CardTable2.
YGOPRODeck pagina con num/offset y reutiliza las cartas del lote; el incremental
revalida páginas y solo escribe contenido modificado. No hay un feed de cambios
por carta: las fechas de lanzamiento no se utilizan como fechas de modificación.

## Sincronizar y reanudar

Los siguientes comandos utilizan el ID propio de YGOPRODeck o un nombre exacto.
El CID de Konami es otro identificador. YGOPRODeck admite en/fr/de/it/pt; no ofrece
español ni japonés. La interfaz en español muestra el idioma real del registro.

```bash
cardmatica sync ygoprodeck card --identifier 89631139 --language en
cardmatica sync ygoprodeck initial --max-cards 3
cardmatica sync ygoprodeck incremental --max-cards 20
cardmatica sync ygoprodeck images --identifier 89631139 --max-cards 30
cardmatica sync yugipedia card --identifier "TITULO_EXACTO_DE_LA_CARTA"
cardmatica sync yugipedia initial --max-cards 3
cardmatica sync yugipedia incremental --since 2026-10-01T00:00:00+00:00 --max-cards 20
cardmatica sync yugipedia errata --identifier "TITULO_EXACTO_DE_LA_CARTA"
cardmatica sync yugipedia images --identifier "TITULO_EXACTO_DE_LA_CARTA" --max-cards 20
cardmatica resume UUID_DEL_TRABAJO --max-cards 20
cardmatica sync yugipedia retry --retry-job UUID_DEL_TRABAJO
cardmatica worker --once
```

En PowerShell sin activar el entorno: reemplazar `cardmatica` por
`.\.venv\Scripts\cardmatica.exe`. `--enqueue-only` registra el trabajo sin ejecutarlo;
`cardmatica worker` lo procesa por separado. La fecha `--since` requiere zona horaria.

El límite inicial es tres cartas para permitir revisión previa. Un trabajo que
alcanza su límite queda `paused` con cursor y lote persistidos. La reanudación
continúa ese lote. Se usa una transacción por registro, upsert y bloqueo por carta;
los trabajos de una misma fuente se excluyen con un advisory lock de PostgreSQL.
Un registro ya confirmado puede volver a inspeccionarse tras una interrupción,
sin duplicar entidades. Los errores individuales quedan pendientes para retry.

La muestra real incluye Blue-Eyes White Dragon, Dark Magician, Decode Talker,
Odd-Eyes Pendulum Dragon y Number 39: Utopia. Para repetir esa validación usando
el PostgreSQL del servicio existente y sus cachés (no utiliza fixtures):

```bash
docker compose exec -T api python scripts/validate_live_catalog.py --confirm-live-access --images
```

El modo images requiere vista local habilitada o permiso comercial por ilustración.
Cuenta una operación de metadata y una por imagen; ajustar max-cards o reanudar.
La sincronización de banlists fechadas se rechaza: YGOPRODeck no documenta la
vigencia de sus estados actuales. No se inventan listas oficiales ni erratas a
partir de diferencias de texto. Las listas históricas existentes se conservan.

## Importar una exportación autorizada

Alternativa al acceso automático: JSON Lines conforme al schema CardRecord,
disponible en `backend/app/schemas/ingestion.py`. Cada línea representa una
observación de una fuente; las cartas conservan sus identificadores y URLs de
origen. No cambiar la etiqueta `source` para convertir una fuente comunitaria en
oficial. Konami requiere la referencia de permiso también en este modo.

```bash
cardmatica import-jsonl ruta/exportacion-autorizada.jsonl --authorization-reference "REFERENCIA_DEL_PERMISO"
```

Una reimportación es idempotente. Los errores se registran por línea y producen
código de salida distinto de cero. No se incluyen semillas de producción ficticias.

Para reproducir las versiones verificadas en Windows, usar
`python -m pip install -c backend/requirements.lock -e 'backend[dev]'`.
La imagen Docker usa ese mismo archivo como restricciones de versiones de sus
dependencias de ejecución y corre como un usuario sin privilegios.

## Imágenes y revisión de derechos

El modo `images` de Yugipedia descubre la galería a partir de enlaces reales de la página, consulta
imageinfo y asocia únicamente escaneos cuya combinación de set, idioma, rareza y
edición tenga una correspondencia inequívoca. La variante conserva la identidad
del escaneo. Nombres de archivo no reconocidos, códigos ambiguos o información
insuficiente quedan en conflictos para revisión; nunca se sustituye con otra carta
o con otra rareza. El contrato de importación permite registrar asociaciones
revisadas con código, idioma, edición y variante completos.

Ninguna licencia textual del wiki autoriza automáticamente el arte de las cartas.
Las imágenes nuevas quedan `unverified`. Registrar permiso comercial verificable:

```bash
cardmatica image-rights UUID_IMAGEN approved --authorization-reference "PERMISO_QUE_CUBRE_ESTA_IMAGEN"
cardmatica sync yugipedia images --identifier "TITULO_EXACTO_DE_LA_CARTA" --max-cards 20
cardmatica image-rights UUID_IMAGEN denied
```

Los escaneos por impresión requieren permiso comercial verificable antes de
descargarse y servirse. Las ilustraciones de YGOPRODeck admiten además una vista
local de prueba explícita, sin cambiar rights_status=unverified. Para aprobar una
ilustración general se usa `image-rights UUID approved --artwork --authorization-reference ...`.
El documento debe cubrir realmente esa imagen; el comando no concede derechos.
Las imágenes se guardan localmente y generan miniaturas PNG de 120×180.
La API comprueba el permiso en cada solicitud y no publica el directorio de medios
directamente. Revocar derechos impide servir el archivo incluso si permanece en
disco. El frontend no hace hotlink de imágenes sin permiso y muestra un fallback
de la impresión seleccionada. Una ilustración general alternativa lleva una
etiqueta visible y nunca se añade a printing.images. La atribución conserva URL,
autor y licencia cuando se conocen. No se inventa autor ni licencia ausentes.
La vista local de ilustraciones solo acepta hosts localhost/127.0.0.1/::1; Docker
publica el puerto únicamente en loopback. Deshabilitarla al desplegar públicamente.

## Banlist, historial de precios, wantlists y perfil

**Banlist.** Las listas Forbidden & Limited vigentes viajan con la aplicación en
`backend/app/data/banlists/`: TCG del 19 de octubre de 2026 (base oficial de Konami)
y OCG del 1 de octubre de 2026 (transcripción de Yugipedia). Cada archivo guarda solo
nombres y estados, con su URL de origen y la fecha de consulta. El contenedor de la API
las importa al arrancar; fuera de Docker:

```powershell
.\.venv\Scripts\cardmatica.exe import-banlist
```

Las entradas se guardan por nombre en inglés, así que una carta sincronizada después
también obtiene su estado sin repetir la importación. En una lista marcada como completa,
una carta que no figura queda como permitida; en una incompleta, como «sin estado
verificado». Para una lista nueva: copiar un JSON existente, actualizar fecha, fuente y
nombres, y volver a ejecutar el comando. La importación es idempotente.

**Historial de precios.** Se construye solo con ventas completadas en Cardmática
(tabla `price_observations`); nunca con guías de precios externas. Mientras no exista el
backend de pedidos, un administrador puede registrar una venta:

```powershell
$headers = @{ Authorization = "Bearer $env:ADMIN_TOKEN" }
$body = @{ printing_id = "UUID_DE_LA_IMPRESION"; price = "450.00"; currency = "UYU"; observed_at = "2026-10-20T15:00:00-03:00"; condition = "NM" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/admin/price-observations -Headers $headers -ContentType "application/json" -Body $body
```

La ficha muestra la última venta con su fecha aunque nadie tenga la carta a la venta
o no haya ventas en el periodo elegido.

**Wantlists y perfil.** Se guardan en el navegador de cada persona (localStorage):
todavía no hay cuentas en el servidor y un perfil de vendedor no publica una tienda.
Las wantlists referencian el UUID y la impresión del catálogo, nunca índices del comercio
de demostración.

## API y seguridad

Endpoints principales:

- `GET /api/v1/cards`: q, market, card_type, subtype, rarity, set_id,
  archetype_id, product_type, language, sort, page, page_size, y los niveles de
  tipo: frame (Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link o Pendulum),
  ability (Tuner, Flip, Gemini, Spirit, Toon, Union), race, attribute, level
  (nivel, rango o link) y property (tipo de magia o trampa). Ver
  `backend/app/services/card_types.py`.
- `GET /api/v1/facets`: rarezas, orígenes y la taxonomía de tipos ordenada.
- `GET /api/v1/cards/{uuid}`; `/printings`; `/errata`; `/price-history`
  (market, printing_id, days). La ficha incluye `banlist_status` por formato.
- `GET /api/v1/banlists`: lista vigente por formato, recuentos y fuente.
- `GET /api/v1/printings/{uuid}`, `/archetypes`, `/archetypes/{uuid}/cards`, `/sets`.
- `GET /api/v1/images/{uuid}?thumbnail=true`.
- `GET /api/v1/artworks/{uuid}?thumbnail=true`: ilustración general y control de uso.
- `POST /api/v1/admin/sync-jobs`, `GET /api/v1/admin/sync-jobs/{uuid}`,
  `POST /api/v1/admin/sync-jobs/{uuid}/resume`, `/errors` y `/admin/conflicts`.
- `POST /api/v1/admin/price-observations`: registra una venta completada.
- `GET /health/live` y `/health/ready`.

Cuentas (`/api/v1/auth`): `POST /register`, `/login`, `/logout`, `/password`,
`/sessions/end-others`; `GET /me` y `/sessions`. La sesión viaja en la cookie
`cm_session` (HttpOnly, SameSite=Lax, Secure en HTTPS) y la base guarda solo el
hash del token. Los cambios exigen la cabecera `X-CSRF-Token` con el valor de la
cookie `cm_csrf` y se rechazan si llegan de otro sitio. Contraseñas con scrypt;
bloqueo temporal tras `LOGIN_MAX_FAILURES` intentos y límite por IP
(`AUTH_ATTEMPTS_PER_MINUTE`, en memoria: válido para un solo proceso). Detrás de un
proxy público, `FORWARDED_ALLOW_IPS` debe indicar su dirección para que el límite
se aplique a cada visitante y no al proxy. `cardmatica cleanup` borra sesiones
vencidas y enlaces de correo usados (conviene programarlo una vez al día). Al registrarse
se envía un enlace para confirmar el correo (`/verificar`) y desde el inicio de
sesión se puede pedir uno para restablecer la contraseña (`/restablecer`); los
enlaces son de un solo uso y vencen (`EMAIL_CONFIRMATION_HOURS`,
`PASSWORD_RESET_MINUTES`). Con `EMAIL_BACKEND=console` (valor por defecto) los
correos no salen del equipo: aparecen en `docker compose logs api`, con su enlace.
En producción, `EMAIL_BACKEND=smtp` y los datos del servidor de correo.

Datos de la cuenta (`/api/v1/account`): `GET` perfil y preferencias; `PUT /profile`,
`/preferences` (moneda, mercado, vista); `GET`/`PUT /wantlists`. Las wantlists se
envían como un documento con la forma que usa la página y se guardan como filas
(`wantlists`, `wantlist_items`); al leerlas, el nombre, código y rareza salen del
catálogo. Al iniciar sesión por primera vez, lo que el navegador tenía guardado
pasa a la cuenta.

Todas las respuestas llevan Content-Security-Policy estricta (solo recursos del
propio sitio), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y,
en producción bajo HTTPS, HSTS (`backend/app/core/security.py`). En producción,
definir `ALLOWED_HOSTS` con el dominio real.

Administración (`/api/v1/admin`): acepta la sesión de una cuenta con rol `admin`
(con CSRF, como el resto de cambios) o el token para scripts. El panel está en el
menú de cuenta de los administradores: resumen, cuentas con su rol y últimas
sincronizaciones. El primer administrador se nombra desde la terminal:

```bash
docker compose exec api cardmatica set-role tu@correo.com admin
```

Para scripts, administración también acepta `Authorization: Bearer ADMIN_TOKEN` de al menos 32 caracteres.
Sin token configurado, queda deshabilitada. La API solo encola; no ejecuta scraping
en background de una petición. Mantener el token fuera del frontend y del navegador
de clientes. El despliegue público debe usar HTTPS y rotación del token operativo.

La búsqueda se realiza en PostgreSQL, con índices de igualdad y pg_trgm para
subcadenas, orden estable y límite máximo de 100 elementos por página. Las ofertas
y precios no se deducen del catálogo externo; por ello el catálogo ordena por nombre
o actualización, mientras el comercio original conserva su orden por precio.

## Lanzamiento: buscadores, enlaces e íconos

- Cada página sale con su título, descripción, enlace canónico y etiquetas
  Open Graph (imagen `frontend/assets/og-image.png`, 1200×630), con direcciones
  absolutas basadas en `PUBLIC_BASE_URL` o en el sitio de la petición. Al moverse
  por pestañas o abrir una carta, la página actualiza título y descripción.
- `/robots.txt` y `/sitemap.xml` (inicio, páginas legales y cada carta, con su
  fecha de actualización).
- Íconos: `favicon.ico`, `favicon.svg`, `apple-touch-icon` y manifiesto con
  íconos de 192 y 512 px (`frontend/assets/`).
- Estadísticas anónimas propias (`/api/v1/analytics/event`): visitas por
  pestaña y unas pocas acciones, sumadas por día, sin cookies ni datos
  personales; respetan Do Not Track y Global Privacy Control. Se ven en el panel
  de administración. `ANALYTICS_ENABLED=false` las apaga.

## Pruebas

GitHub Actions (`.github/workflows/tests.yml`) corre en cada pull request y en
cada cambio a main: ruff, todas las pruebas con navegador sobre SQLite, y las
migraciones más las pruebas contra PostgreSQL 17.

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
$env:CARDMATICA_TEST_POSTGRES='1'
.\.venv\Scripts\python.exe -m pytest backend/tests -q
Remove-Item Env:CARDMATICA_TEST_POSTGRES
$env:CARDMATICA_BROWSER_TESTS='1'
.\.venv\Scripts\python.exe -m pytest backend/tests/test_browser.py -q
.\.venv\Scripts\python.exe -m ruff check backend --config backend/pyproject.toml
.\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini check
```

En Git Bash: `CARDMATICA_TEST_POSTGRES=1 python -m pytest backend/tests -q` y
`CARDMATICA_BROWSER_TESTS=1 python -m pytest backend/tests/test_browser.py -q`.

Las pruebas rápidas usan SQLite como adaptador de tests; producción usa PostgreSQL.
Las pruebas PostgreSQL crean y eliminan esquemas aleatorios `test_*`, sin borrar
el catálogo. Las de navegador levantan una API real local con datos exclusivamente
de prueba y verifican catálogo, selección de impresión, moneda, TCG/OCG y carrito.
Las peticiones externas siempre se simulan en pytest. La validación real separada
del frontend consulta la API local poblada, abre Chrome y guarda capturas/reporte:

```powershell
.\.venv\Scripts\python.exe backend/scripts/verify_live_frontend.py
```

Resultados en `.cache/live-frontend/`. Para combinar
ejecuciones elevadas y de sandbox en Windows, elegir un `--basetemp` nuevo dentro
de `.cache` y crear primero ese directorio padre, evitando mezclar propietarios de
los temporales de pytest.
