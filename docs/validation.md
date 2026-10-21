# Validación de la implementación

Fecha: 2026-10-20.

## Comprobaciones ejecutadas

- **44 tests aprobados** en una ejecución conjunta con PostgreSQL real y Chrome.
  Las pruebas crean esquemas temporales aislados y no insertan fixtures en el
  catálogo de producción. Cubren normalización, identidad, precedencia oficial,
  idempotencia, rollback, historial, grupos, imágenes y derechos, HTTP simulado,
  paginación, filtros, autenticación, checkpoints, reintentos y navegador.
- Chrome verificó la selección de impresión, el fallback de imagen, moneda,
  persistencia TCG/OCG y añadir/quitar/finalizar compras en el carrito original.
- Ruff: sin errores. JavaScript original: comprobación de sintaxis con Node.
- Dos migraciones aplicadas en PostgreSQL 17; Alembic check sin diferencias
  pendientes entre el esquema y los modelos.
- Imagen Docker construida con Python 3.13 y restricciones de versiones;
  proceso de aplicación ejecutándose con UID 10001.
- API dentro de Docker: HTTP 200 para readiness, catálogo, página principal,
  módulo frontend y OpenAPI. El catálogo de producción contiene cero cartas.
- La ejecución de pytest emite un aviso de deprecación de Starlette TestClient
  sobre su adaptador httpx; no produjo fallos en estas pruebas.

Comando de la prueba conjunta desde PowerShell:

```powershell
$env:CARDMATICA_TEST_POSTGRES='1'
$env:CARDMATICA_BROWSER_TESTS='1'
.\.venv\Scripts\python.exe -m pytest backend/tests -q -p no:cacheprovider --basetemp=.cache/pytest-postgres-20261020-1
```

Para otra ejecución, usar un directorio temporal propio nuevo o reutilizar el de
pytest solo después de verificar que pertenece a este workspace. El padre `.cache`
debe existir. Los esquemas PostgreSQL `test_*` se eliminan al terminar cada fixture.

## Pendientes reales antes de una ingesta de producción

1. Obtener permiso escrito de Konami para los usos previstos y registrar su alcance.
2. Confirmar el acceso permitido al servicio de Yugipedia del operador, sin eludir
   las restricciones de robots que afectan a agentes de IA.
3. Validar los parsers con un conjunto pequeño y autorizado de cartas reales que
   cubra idiomas, rarezas, ilustraciones, erratas, arquetipos y banlists. Los tests
   de marcado son fixtures sintéticas, no evidencia de compatibilidad total con
   todas las páginas actuales de las fuentes.
4. Revisar asociaciones de imágenes ambiguas y obtener permisos comerciales por
   imagen antes de aprobar o servir escaneos reales. No se descargó ninguna imagen
   de carta desde las fuentes durante esta implementación.

Las funcionalidades comerciales anteriores continúan siendo demostrativas y
están etiquetadas como tales. Las cartas importadas no reciben automáticamente
sus ofertas, precios, stock ni historiales de venta.
