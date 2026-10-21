# Cardmática

Catálogo persistido de Yu-Gi-Oh! con FastAPI, PostgreSQL, SQLAlchemy 2 y Alembic,
integrado a la interfaz HTML/CSS/JavaScript existente. El mantenimiento de fuentes
se ejecuta por CLI o worker; ninguna visita al catálogo dispara scraping.

## Estado y límites reales

La API, persistencia, normalización, procedencia, reconciliación, trabajos y vistas
están implementados. Las pruebas usan fixtures sintéticas y HTTP simulado. Las
funcionalidades comerciales originales se conservan y están identificadas como
demostración. No existe todavía un backend de vendedores, precios ni pedidos.
Los UUID del catálogo no se mezclan con los índices del carrito original.

**No se ha cargado un catálogo oficial ni descargado imágenes de cartas.** Los
términos de Konami prohíben crear una base mediante descarga sistemática y requieren
permiso escrito para uso comercial. Yugipedia restringe agentes de IA en robots.txt.
Las dos fuentes están deshabilitadas inicialmente. Configurar un booleano no otorga
derechos ni autoriza eludir restricciones. Consulte [la investigación de fuentes](docs/source-policies.md).

Los parsers se validaron con fixtures; no se certificó el HTML actual completo de
Konami ni todas las convenciones históricas de Yugipedia. Un cambio de marcado se
registra como error o limitación, sin rellenar campos con datos inventados. La
validación con cartas reales representativas queda pendiente de acceso y permisos.

## Organización

```text
index.html, styles.css, script.js  Interfaz y comercio original
frontend/js/                    Cliente API, vistas y adaptador del catálogo
backend/app/core/               Configuración y logging JSON
backend/app/models/             Catálogo, procedencia y mantenimiento
backend/app/repositories/       SQL paginado y upserts
backend/app/services/           Reconciliación, precedencia, consultas e imágenes
backend/app/integrations/       HTTP respetuoso, Konami y Yugipedia
backend/app/ingestion/          Normalización, checkpoints y worker
backend/app/api/                API pública y administración autenticada
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
2. Configurar USER_AGENT con nombre del servicio y contacto real.
3. Para Konami, obtener permiso escrito que cubra extracción, almacenamiento y
   reutilización comercial; registrar KONAMI_AUTHORIZATION_REFERENCE y habilitar
   KONAMI_ENABLED solo dentro del alcance concedido.
4. Para Yugipedia, confirmar que el acceso del servicio está permitido y habilitar
   YUGIPEDIA_ENABLED. La cuota mínima es una petición por segundo, incluyendo
   robots, API, reintentos e imágenes. Procesos independientes deben compartir
   CACHE_DIRECTORY para compartir el presupuesto HTTP.

El cliente valida orígenes, robots, UA, timeout, tamaño de respuesta, reintentos y
redirecciones. Un CAPTCHA, 401, 403 o denegación de robots suspende el trabajo.
La caché usa 30 días por defecto y revalidación ETag/Last-Modified. MediaWiki usa
recentchanges para incrementales y embeddedin para enumerar CardTable2.
Konami no tiene una API pública documentada: el incremental recorre y revalida
páginas públicas autorizadas; no se promete un feed de modificaciones inexistente.

## Sincronizar y reanudar

Los siguientes comandos requieren primero los permisos y configuración anteriores.
Reemplazar los identificadores de ejemplo simbólicos por un CID o título válido.

```bash
cardmatica sync konami card --identifier CID_OFICIAL --language es
cardmatica sync yugipedia card --identifier "TITULO_EXACTO_DE_LA_CARTA"
cardmatica sync yugipedia initial --max-cards 3
cardmatica sync yugipedia incremental --since 2026-10-01T00:00:00+00:00 --max-cards 20
cardmatica sync konami incremental --language en --max-cards 20
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

Antes de ampliar el límite, revisar un conjunto real que incluya múltiples rarezas,
ilustraciones, idiomas, arquetipos y erratas. Verificar las fichas y conflictos
contra los documentos originales. Esta revisión real **no se realizó** porque no
se dispone aquí de los permisos requeridos para la extracción y reutilización.

Para una banlist, revisar explícitamente su formato y fecha de vigencia:

```bash
cardmatica sync konami banlist --banlist-format TCG --effective-date AAAA-MM-DD --language en --max-cards 3
```

No se usa la fecha de consulta como fecha efectiva. Las listas OCG requieren un
idioma OCG. El estado se guarda por carta, formato y vigencia; se conserva la
citación del documento de la lista por campo.

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

`images` descubre la galería a partir de enlaces reales de la página, consulta
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

Solo las imágenes aprobadas se descargan y generan miniaturas PNG de 120×180.
La API comprueba el permiso en cada solicitud y no publica el directorio de medios
directamente. Revocar derechos impide servir el archivo incluso si permanece en
disco. El frontend no hace hotlink de imágenes sin permiso y muestra un fallback
de la impresión seleccionada. La atribución conserva URL, autor y licencia.

## API y seguridad

Endpoints principales:

- `GET /api/v1/cards`: q, market, card_type, subtype, rarity, set_id,
  archetype_id, product_type, language, sort, page, page_size.
- `GET /api/v1/cards/{uuid}`; `/printings`; `/errata`.
- `GET /api/v1/printings/{uuid}`, `/archetypes`, `/archetypes/{uuid}/cards`, `/sets`.
- `GET /api/v1/images/{uuid}?thumbnail=true`.
- `POST /api/v1/admin/sync-jobs`, `GET /api/v1/admin/sync-jobs/{uuid}`,
  `POST /api/v1/admin/sync-jobs/{uuid}/resume`, `/errors` y `/admin/conflicts`.
- `GET /health/live` y `/health/ready`.

Administración exige `Authorization: Bearer ADMIN_TOKEN` de al menos 32 caracteres.
Sin token configurado, queda deshabilitada. La API solo encola; no ejecuta scraping
en background de una petición. Mantener el token fuera del frontend y del navegador
de clientes. El despliegue público debe usar HTTPS y rotación del token operativo.

La búsqueda se realiza en PostgreSQL, con índices de igualdad y pg_trgm para
subcadenas, orden estable y límite máximo de 100 elementos por página. Las ofertas
y precios no se deducen del catálogo externo; por ello el catálogo ordena por nombre
o actualización, mientras el comercio original conserva su orden por precio.

## Pruebas

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
Las peticiones de Konami/Yugipedia siempre se simulan en tests. Para combinar
ejecuciones elevadas y de sandbox en Windows, elegir un `--basetemp` nuevo dentro
de `.cache` y crear primero ese directorio padre, evitando mezclar propietarios de
los temporales de pytest.
