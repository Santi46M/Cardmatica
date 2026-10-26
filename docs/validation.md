# Validación de la implementación

**Actualización 2026-10-23.** Desde ahora la validación corre sola en GitHub
Actions con cada pull request y cada cambio a main (`.github/workflows/tests.yml`):
ruff, 132 pruebas con Chromium sobre SQLite, y las 10 migraciones aplicadas en
PostgreSQL 17 seguidas de `alembic check` y las pruebas contra PostgreSQL. Lo que
sigue es el registro de la validación manual del 21 de octubre.

Fecha: 2026-10-21. Sustitución del conector activo por YGOPRODeck, sobre la misma
base PostgreSQL y arquitectura FastAPI/SQLAlchemy existentes.

## Comprobaciones ejecutadas

- **59 tests aprobados** en una ejecución conjunta con PostgreSQL real y Chrome
  (cero fallos y cero tests omitidos).
  Las pruebas crean esquemas temporales aislados y no insertan fixtures en el
  catálogo de producción. Cubren normalización, identidad, precedencia oficial,
  idempotencia, rollback, historial, grupos, imágenes y derechos, HTTP simulado,
  paginación, filtros, autenticación, checkpoints, reintentos y navegador. Los nuevos
  casos cubren IDs de YGOPRODeck distintos del CID, importación sin CID, numeración
  alfanumérica, fecha del set separada de la impresión, precedencia primaria,
  versiones de texto sin erratas inferidas, disponibilidad OCG sin impresiones
  ficticias, actualización de arquetipos y rechazo de observaciones atrasadas.
- Chrome verificó la selección de impresión, el fallback de imagen, moneda,
  persistencia TCG/OCG y añadir/quitar/finalizar compras en el carrito original.
- Ruff: sin errores con la configuración de backend/pyproject.toml. JavaScript:
  comprobación de sintaxis con Node.
- Cuatro migraciones aplicadas en PostgreSQL 17; Alembic check sin diferencias
  pendientes entre el esquema y los modelos.
- Imágenes Docker de API y worker construidas con Python 3.13 y restricciones de versiones;
  proceso de aplicación ejecutándose con UID 10001.
- API dentro de Docker disponible en http://localhost:8000. Conserva endpoints,
  carrito, monedas y selección TCG/OCG. Los datos reales se consultan desde PostgreSQL.
- La ejecución de pytest emite un aviso de deprecación de Starlette TestClient
  sobre su adaptador httpx; no produjo fallos en estas pruebas.

Comando de la prueba conjunta desde PowerShell:

```powershell
$env:CARDMATICA_TEST_POSTGRES='1'
$env:CARDMATICA_BROWSER_TESTS='1'
.\.venv\Scripts\python.exe -m pytest backend/tests -q -p no:cacheprovider --basetemp=.cache/pytest-ygoprodeck-20261021-1 --tb=short
```

Para otra ejecución, usar un directorio temporal propio nuevo o reutilizar el de
pytest solo después de verificar que pertenece a este workspace. El padre `.cache`
debe existir. Los esquemas PostgreSQL `test_*` se eliminan al terminar cada fixture.

## Sincronización real y comprobación visual

Se consultó la API pública de YGOPRODeck y se guardaron datos auténticos, sin
fixtures ni respuestas HTTP simuladas. La muestra se repitió con la caché y sus
recuentos e IDs permanecieron estables, sin descargas redundantes.

| Carta | ID YGOPRODeck | Impresiones almacenadas |
| --- | ---: | ---: |
| Blue-Eyes White Dragon | 89631139 | 75 |
| Dark Magician | 46986414 | 56 |
| Decode Talker | 1861629 | 6 |
| Number 39: Utopia | 84013237 | 17 |
| Odd-Eyes Pendulum Dragon | 16178681 | 10 |
| **Total** | | **164** |

PostgreSQL contiene **5 cartas, 164 impresiones, 103 sets con fecha, 24 rarezas,
5 arquetipos relacionados, 5 textos vigentes del proveedor y 24 ilustraciones**.
Las ilustraciones tienen sus 24 archivos y miniaturas en el volumen catalog_data.
No hay escaneos por impresión aprobados: card_images contiene cero registros.
Las ediciones y variantes de impresión que el proveedor no documenta siguen unknown;
el recuento no distingue ediciones físicas que la API agrupa en un mismo registro.

Chrome verificó la aplicación Docker con este catálogo real, sin interceptar ni
simular sus respuestas: las cinco fichas, carga efectiva de sus imágenes,
arquetipos, sets, rarezas, textos, cambio de impresión, búsqueda por nombre,
código, set, rareza y arquetipo y persistencia TCG/OCG. Cero errores JavaScript
y cero solicitudes del navegador a YGOPRODeck o Yugipedia. Las capturas se
inspeccionaron visualmente; reporte y PNG en `.cache/live-frontend/`.
La paginación inicial se comprobó además contra una página real: 100 registros,
cursor api_offset=100, done=false, sin insertar otras cartas en la muestra.

Comandos reproducibles desde la raíz:

```powershell
docker compose exec -T api python scripts/validate_live_catalog.py --confirm-live-access --images
.\.venv\Scripts\python.exe backend/scripts/verify_live_frontend.py
docker compose exec -T api alembic check
```

Los primeros intentos detectaron una discrepancia entre código instalado y montado
en Docker. Se corrigió con PYTHONPATH=/workspace/backend y reconstrucción de los
servicios. El normalizador también se corrigió para códigos EN con numeración
alfanumérica. Los fallos intermedios quedan registrados para auditoría y sus dos
operaciones se reintentaron con éxito, conservando el catálogo sin duplicados.

## Pendientes y restricciones concretas

1. **Uso comercial del arte y texto:** no se obtuvo una licencia del titular de
   derechos. Las 24 ilustraciones continúan unverified y solo se muestran en la
   vista local explícita. Producción no las sirve sin permiso documentado.
2. **Escaneos y erratas de Yugipedia:** conector y pruebas conservados; la restricción
   de acceso para agentes de IA impide certificar aquí una ingesta real de ese
   complemento. No se presentan ilustraciones generales como escaneos de rarezas.
3. **Seis códigos históricos:** LOB-E001, SDK-E001, PCK-E001, LOB-E003, SDY-E005 y
   PCY-E004 siguen registrados como limitación para revisar su idioma. No se inventó
   esa dimensión. Las limitaciones alfanuméricas corregidas quedaron resueltas.
4. **OCG y localizaciones:** la muestra acredita disponibilidad OCG de las cartas,
   pero no contiene impresiones OCG. YGOPRODeck no ofrece traducción al español ni
   japonés en esta API. El idioma mostrado se conserva y no se fabrica una traducción.
5. **Banlists oficiales fechadas:** los estados actuales de YGOPRODeck no documentan
   fecha de vigencia; el modo banlist se rechaza explícitamente. Se preserva el
   historial previo y no se etiqueta una lista comunitaria como oficial.
6. **Carga completa:** se dejó la muestra solicitada, sin ejecutar una ingesta
   masiva. initial/incremental, checkpoints y reanudación están disponibles por CLI
   o worker independiente. La ampliación debe revisar también los casos de la fuente
   que no están representados por estas cinco cartas.

Las funcionalidades comerciales anteriores continúan siendo demostrativas y
están etiquetadas como tales. Las cartas importadas no reciben automáticamente
sus ofertas, precios, stock ni historiales de venta.
