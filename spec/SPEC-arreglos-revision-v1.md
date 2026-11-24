# Spec: Arreglos de la revisión de seguridad — V1

Estado: aprobado por Mateo (24/11/2026)
Origen: revisión del 23/11/2026 (Fases 1–4). Los números (#1, S1…) son los del informe.

## Objetivo

Dejar Cardmática en condiciones de recibir una **beta cerrada sin dinero**
(gente invitada, detrás de la contraseña del sitio), cerrando los riesgos
urgentes y los arreglos chicos que salieron de la revisión. No agrega
funciones nuevas: pedidos, pagos y edición de las cartas van en specs
propios.

Dos tandas:

- **Tanda A, solo configuración** (Vercel, sin código): A1–A3.
- **Tanda B, código chico con tests**: B1–B6, un PR por arreglo.

## Tanda A — configuración

**A1. Las vistas previas dejan de usar la base de datos real (#1, S1).**
- En Vercel, `DATABASE_URL` y `TEST_ACCOUNTS` pasan a valer solo en
  *Production*. Ya no valen en *Preview*.
- Va junto con B1, que hace que las ramas dejen de publicarse. Sin B1, las
  vistas previas fallarían (sin base de datos) y GitHub mostraría una cruz
  roja en cada PR.
- Orden: primero B1 (merge), después A1.

**A2. Cambiar las contraseñas de las cuentas de prueba (#3, S3).**
- Se reemplaza `TEST_ACCOUNTS` en Vercel. En la siguiente publicación el
  sitio cambia las contraseñas y **cierra las sesiones abiertas** de esas
  cuentas (lo hace `test_accounts.ensure`; verificado).
- Ninguna contraseña nueva pasa por el chat ni por archivos (regla vigente).
  Ver la pregunta abierta 1 para decidir quién la escribe.

**A3. Fijar la dirección del sitio (#12, S10).**
- `PUBLIC_BASE_URL=https://cardmatica-prueba.vercel.app` en *Production*.
  Los enlaces de los correos dejan de armarse con la dirección que manda
  el navegador.

## Tanda B — código

**B1. Solo `main` se publica (complemento de A1).**
- `vercel.json`: `"git": {"deploymentEnabled": {"*": false, "main": true}}`.
  Según la documentación de Vercel, si una rama coincide con varias reglas
  y una dice `true`, se publica; `main` se publica y el resto no.
- Archivos: `vercel.json`.

**B2. Los correos no salen a los registros con sus enlaces (#2, S2).**
- Con `EMAIL_BACKEND=console` y `DEPLOYMENT_MODE` distinto de `local`, el
  registro dice solo «correo para m•••@dominio — asunto — no enviado (sin
  servicio de correo)». **Nunca el cuerpo ni el enlace.**
- Con `DEPLOYMENT_MODE=local` (tu computadora) sigue mostrando el correo
  entero, como hoy, para poder probar.
- Archivos: `backend/app/services/mail.py` y su test.

**B3. Límite de intentos que funcione en Vercel (#4, S4).**
- El contador pasa de la memoria del servidor a la base de datos: una tabla
  nueva, `rate_limits` (clave, minuto, cantidad), con suma atómica (una
  sola instrucción, segura con pedidos simultáneos).
- Se usa en los mismos lugares que hoy (ingreso, registro y estadísticas)
  y con los mismos límites.
- Privacidad: la clave incluye la dirección IP. Las filas se borran a la
  hora (se limpian al escribir) y no aparecen en exportaciones ni en el
  panel.
- Archivos: modelo, migración `024`, `accounts.py` (limiter),
  `analytics.py`, tests en SQLite y Postgres.

**B4. Dependencias vigiladas y actualizadas (#5, S5).**
- `soupsieve` 3.0.3 → 4.0.0 (compatible: `beautifulsoup4` pide ≥ 1.6.1).
- `opentelemetry-api` 1.45.1 → 1.45.2. **Corrección del informe:** no se
  puede quitar, la exige FastAPI.
- Las dos en `requirements.txt` (lo que instala Vercel) y en
  `backend/requirements.lock` (lo que usa el CI).
- Dependabot vigila también la raíz (`directory: /`).
- El CI corre `pip-audit -r requirements.txt` y falla si aparece una
  vulnerabilidad. Para ignorar una, hace falta escribir el motivo en el
  workflow.
- Archivos: `requirements.txt`, `backend/requirements.lock`,
  `.github/dependabot.yml`, `.github/workflows/tests.yml`.

**B5. Dejar de guardar dirección y teléfono (#6, S6).**
- Se quitan del perfil (formulario, API, exportación y textos en es/pt/en).
- La migración `025` **borra las columnas y lo guardado** (hoy son cuentas
  de prueba). Volverán cuando haya pedidos, pedidas solo al comprar.
- Archivos: modelo, schema, `account_data.py`, frontend del perfil, i18n,
  migración y tests.

**B6. Fotos de ofertas (#8, #14; S7, S11).**
- Al quitar o reemplazar una foto, o al borrar una cuenta, se borra el
  archivo **solo si ninguna otra oferta lo usa**.
- Una foto «bomba» devuelve el mismo mensaje claro que una foto inválida
  (400, como hoy cualquier foto ilegible), no un error 500.
- Archivos: `services/listings.py` y tests.

## Comandos

```
# Tests (desde backend/)
python -m pytest -q
CARDMATICA_TEST_POSTGRES=1 DATABASE_URL=postgresql+psycopg://… python -m pytest -q
CARDMATICA_BROWSER_TESTS=1 python -m pytest -q
# Lint
ruff check backend && ruff format --check backend
# Migraciones
alembic upgrade head && alembic check
# Vulnerabilidades
pip-audit -r requirements.txt
```

## Estructura y estilo

Se respeta lo que ya hay: rutas en `backend/app/api`, lógica en
`backend/app/services`, migraciones numeradas en `backend/alembic/versions`,
tests en `backend/tests`. Código corto, comentarios que explican el porqué
y nada de opciones que nadie pidió (criterio ponytail).

## Pruebas

- Cada arreglo de la Tanda B lleva su test, que primero falla y después pasa.
- B3 y B5 (base de datos) también se prueban en Postgres.
- Antes de cada merge: suite completa verde en el CI.
- Después de publicar: comprobar en Vercel que la publicación terminó
  (READY) y, para A1/B1, que una rama nueva **no** genera vista previa.

## Límites

- **Siempre:** tests antes del merge, validación en el servidor, un PR por
  arreglo, y nada de claves en el código, el chat ni archivos.
- **Preguntar antes:** cualquier cambio de esquema distinto de los de este
  spec, librerías nuevas aparte de `pip-audit` en el CI, y tocar otras
  variables de Vercel.
- **Nunca:** debilitar una validación para simplificar, borrar datos
  reales fuera de B5, ni publicar contraseñas.

## Criterios de éxito

1. Una rama nueva subida a GitHub no genera publicación en Vercel, y
   *Preview* no tiene `DATABASE_URL` ni `TEST_ACCOUNTS`.
2. Las contraseñas anteriores de las cuentas de prueba ya no sirven, y sus
   sesiones viejas quedaron cerradas.
3. Pedir «olvidé mi contraseña» en Vercel no deja el enlace en los
   registros (test de B2, más una revisión de los registros después de
   publicar).
4. Pasado el límite de intentos en una IP, el siguiente intento da 429 aunque
   llegue a otro servidor (test de B3 con dos sesiones de base distintas).
5. `pip-audit` sin hallazgos y verde en el CI.
6. El perfil ya no tiene dirección ni teléfono, y la base tampoco.
7. Dos ofertas con la misma foto: quitar una no rompe la otra. Una foto
   bomba da 400.
8. Toda la suite pasa en SQLite y Postgres.

## Fuera de alcance (para después)

- Correo real por SMTP (#9): necesita que crees la cuenta del servicio.
- Pedidos y pagos con Mercado Pago (#10): spec propio.
- Edición 1st/Unlimited en las ofertas (#7): spec propio.
- Escape automático del HTML (#11), cotizaciones reales (#13), RLS y la
  extensión (#16), limpieza ponytail (#17), mensajes neutros (#15).
- Una base de datos aparte para vistas previas (por ejemplo, ramas de
  Supabase).

## Decisiones (antes «Preguntas abiertas»)

1. **A2:** Mateo escribe las contraseñas nuevas en Vercel, con el formato y
   los pasos que le paso sin contraseñas. Se mantienen **dos** cuentas de
   administrador de prueba.
2. **B5:** se borran la dirección y el teléfono guardados; son cuentas de
   prueba.
3. **B3:** se sigue el estándar HTTP: **429 Too Many Requests** con la
   cabecera `Retry-After` (segundos hasta poder reintentar), y el mensaje
   actual («demasiados intentos…»).
