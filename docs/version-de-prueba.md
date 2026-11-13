# Versión de prueba en internet (gratis)

Dos caminos, los dos gratis:

- **Vercel + Supabase** (`vercel.json`): sin Codespace. Vercel construye y publica la
  web; Supabase guarda la base de datos. Al construir, `scripts/vercel-build.sh`
  actualiza la base, carga las banlists, crea las cuentas de prueba y, mientras el
  catálogo esté vacío, trae las primeras 1000 cartas.
- **Render + Neon** (`render.yaml` y el `Dockerfile`): más abajo, paso a paso, cargando
  el catálogo desde el Codespace.

## Vercel + Supabase

1. **Supabase**: un proyecto nuevo (región US East). En **Connect**, la cadena del
   *Transaction pooler* (puerto 6543). La web no prepara consultas, como pide ese modo.
2. **Vercel**: un proyecto desde el repositorio, sin tocar los ajustes de construcción
   (los lee de `vercel.json`), con estas variables (Settings → Environment Variables,
   las contraseñas marcadas como *Sensitive*):

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La cadena de Supabase, tal cual. |
| `TEST_SITE` | `true` |
| `TEST_SITE_USER` y `TEST_SITE_PASSWORD` | Usuario y contraseña que el navegador pide para entrar. |
| `TEST_ACCOUNTS` | Las cuentas de prueba, en una lista: `[{"email": "...", "password": "...", "name": "...", "role": "admin"}, ...]` (`role`: `admin`, `moderator` o `user`; opcionales `type`: `buyer`, `seller` o `both`, y `store`, el nombre de la tienda). |
| `CACHE_DIRECTORY` y `IMAGE_DIRECTORY` | `/tmp/cache` y `/tmp/images` (lo único escribible en Vercel). |

Cambiar una contraseña en Vercel y volver a desplegar la cambia en la cuenta, y cierra
sus sesiones. Vercel avisa `VERCEL=1`, así que la web no guarda conexiones abiertas: las
administra el *pooler* de Supabase.

Lo que vale para los dos caminos:

- **Se duerme.** Sin visitas se apaga; la siguiente tarda unos segundos (Vercel) o
  alrededor de un minuto (Render) en abrir. Después anda normal.
- **Sin imágenes de cartas ni de productos.** Como todo despliegue público
  (`DEPLOYMENT_MODE=production`): las ilustraciones y fotos provisionales sin licencia
  solo se ven en la vista local privada.
- **Cada página dice que es una versión de prueba** y los buscadores no la indexan.
  Con `TEST_SITE_PASSWORD`, además, el navegador pide una contraseña antes de mostrar nada.
- **Los correos no salen**: se escriben en el registro del servicio (Logs), con su enlace. Un administrador puede marcar un correo como confirmado desde el panel.
- **La tienda sigue siendo de demostración**: vendedores, precios y valoraciones ficticios
  y marcados como tales.

## Render + Neon

### 1. La base de datos en Neon

1. Entrar a <https://neon.com> con la cuenta de GitHub.
2. **New project**: nombre `cardmatica`, región **AWS US East (N. Virginia)**, Postgres 17.
3. En **Connect**, copiar la *connection string*. Empieza con `postgresql://` y termina
   con `?sslmode=require`. Es una contraseña: no pegarla en chats ni en el repositorio.

### 2. El catálogo y las cuentas de prueba, desde el Codespace

En la terminal del Codespace, con el repositorio al día:

```bash
git pull
docker compose up -d --build api
# Pegar la cadena de Neon cuando la pida (no se ve al pegarla ni queda en el historial).
read -s -p "Cadena de Neon: " NEON; echo
alias neon='docker compose run --rm --no-deps -e DATABASE_URL="$NEON" api'
neon alembic upgrade head
neon cardmatica import-banlist
neon cardmatica sync ygoprodeck initial --max-cards 1000 --max-printings 2
neon cardmatica card-texts pt --max-cards 1000
neon cardmatica test-accounts
```

El último comando muestra cuatro cuentas, **una sola vez**: administrador, moderador,
vendedor y comprador, cada una con su contraseña. Guardarlas en un lugar seguro.
Volver a ejecutarlo les da contraseñas nuevas (y cierra sus sesiones).

El plan gratis de Neon tiene 1 GB: alcanza de sobra para esas 1000 cartas. Para el
catálogo completo de Yu-Gi-Oh!, quitar `--max-cards 1000` (tarda bastante más).

### 3. La web en Render

1. Entrar a <https://render.com> con la cuenta de GitHub y darle acceso al repositorio
   **Santi46M/Cardmatica**.
2. **New → Blueprint**, elegir el repositorio. Render lee `render.yaml` y pide dos valores:
   - `DATABASE_URL`: la cadena de Neon, tal cual.
   - `TEST_SITE_PASSWORD`: una contraseña para entrar a la prueba, o vacío para que
     cualquiera con el enlace pueda verla.
3. **Apply**. La primera vez tarda unos minutos en construir. Al terminar, la dirección
   aparece arriba (algo como `https://cardmatica-prueba.onrender.com`).

Cada vez que algo se une a `main`, Render la vuelve a desplegar sola. Al arrancar
actualiza la base de datos (migraciones) y las banlists.

## Probar los permisos

Iniciar sesión con cada cuenta de prueba (menú de la cuenta → **Iniciar sesión**):

| Cuenta | Qué ve y qué puede hacer |
| --- | --- |
| Administrador | Menú → **Panel de administración**: números del sitio, cuentas, roles, bloquear y desbloquear, confirmar correos, cerrar sesiones, borrar cuentas, registro de acciones, sincronizaciones y noticias. |
| Moderador | El mismo panel sin roles, sin borrar cuentas, sin registro ni sincronizaciones. Bloquea y confirma correos, salvo los de otras cuentas del equipo. |
| Vendedor | Una cuenta común cuyo perfil es de vendedor, con la tienda "Tienda de prueba". |
| Comprador | Una cuenta común. |

Nadie puede bloquear, borrar ni quitarse el rol a sí mismo, y cada acción del equipo
queda en el registro con quién la hizo y cuándo.

Para dar un rol a otra cuenta creada desde la web: en el panel, como administrador, o con
`neon cardmatica set-role correo@ejemplo.com moderator`.

## Mantenimiento

- **Noticias del inicio**: `neon cardmatica fetch-news` las trae de sus fuentes.
- **Pausar o borrar la prueba**: en Render, **Settings → Suspend** o **Delete**; en Neon,
  borrar el proyecto. Nada queda corriendo ni cobra.
