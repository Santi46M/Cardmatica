# Investigación de fuentes y límites de producción

Revisado: 2026-10-21. Volver a revisar antes de habilitar una fuente o publicar imágenes.

## YGOPRODeck — fuente principal activa

La [guía oficial de API v7](https://api.ygoprodeck.com/api-guide/) permite el consumo
público y solicita almacenamiento local. El [operador de la base](https://mail.ygoprodeck.com/forum/viewtopic/40808/%3C/s%3E%3CURL%20url%3D)
confirmó su disponibilidad y aclaró que no concede derechos de Konami sobre datos
o imágenes. La autorización técnica de la API no equivale a una licencia comercial
del material subyacente. Los términos generales del sitio tampoco acreditan ese permiso.

Se verificaron consultas reales a cardinfo.php y cardsets.php; ambos respondieron
HTTP 200. robots.txt del host de API respondió 404 (sin reglas publicadas en ese
recurso). El cliente comprueba también robots del servidor de imágenes y se detiene
si aparece una denegación. No se omiten bloqueos ni se utilizan rutas privadas.

El servicio limita conjuntamente API, robots, reintentos y descargas a 1 solicitud/s
y persiste respuestas y presupuestos en caché compartida. Las ilustraciones se
descargan una vez, se transforman a PNG y se sirven localmente, con miniaturas.
El navegador no consulta directamente a ninguna fuente externa.

Las imágenes de card_images representan ilustraciones generales y alternativas.
No incluyen una asociación verificable a rareza, edición o código. Se almacenan
en card_artworks; card_images continúa reservado a escaneos por impresión.
Ninguna de las 24 ilustraciones de la muestra fue aprobada para explotación comercial:
autor y licencia quedan sin completar cuando el proveedor no los declara.
Solo se muestran como prueba local con DEPLOYMENT_MODE=local y
ALLOW_LOCAL_IMAGE_PREVIEW=true, etiquetas visibles y puerto publicado en loopback.
Producción exige evidencia de permiso por imagen; revocarlo bloquea su entrega.
También queda pendiente verificar los derechos aplicables a textos para el uso comercial previsto.

YGOPRODeck es un proveedor externo, no Konami. Se identifican sus nombres,
estadísticas, textos y arquetipos como datos del proveedor. Los datos oficiales
históricos válidos ya almacenados conservan su precedencia; Yugipedia no puede
reemplazar información seleccionada de YGOPRODeck ni convertirla en reglas oficiales.
No se importan precios ni existencias comerciales.

## Scryfall — Magic: The Gathering

Revisado: 2026-10-27. La [documentación de la API](https://scryfall.com/docs/api)
es pública, pide 50–100 ms entre solicitudes y encabezados `User-Agent` y `Accept`.
El cliente usa 0,1 s y `Accept: application/json`. Al ser una API documentada para
este uso, no se consulta robots.txt del host de API (`robots=False`); sí se respetan
el intervalo, los reintentos con espera y la caché compartida. Las condiciones de
Scryfall piden no cobrar por acceder a sus datos, no recortar ni marcar sus imágenes
y acreditar al artista; el material sigue siendo de Wizards of the Coast (política
de contenido de fans). No se importan precios de Scryfall. Las imágenes de
cards.scryfall.io quedan sin aprobar hasta tener evidencia de permiso por imagen.

## TCGdex — Pokémon

Revisado: 2026-10-27. [TCGdex](https://tcgdex.dev) es una base abierta y comunitaria
con API REST pública. El cliente espera 0,5 s entre solicitudes, recorre los sets del
más nuevo al más antiguo y omite TCG Pocket. Los códigos se toman del objeto en
inglés y los nombres y textos del idioma pedido. Las imágenes de assets.tcgdex.net
son de The Pokémon Company y quedan sin aprobar, igual que las demás. No se importan
precios.

## Konami

La web oficial enlaza consultas HTML card_search.action, card_list.action y
forbidden_limited.action. No se encontró documentación de una API pública oficial.
El conector activo fue sustituido por YGOPRODeck. Los parsers anteriores se
conservan únicamente para compatibilidad histórica y pruebas de importaciones
autorizadas; no hay un cliente de sincronización de Konami ejecutable.

https://www.db.yugioh-card.com/yugiohdb/
https://legal.konami.com/games/neuron/terms/tou/en/
https://www.konami.com/siteinfo/en/

Los términos de Neuron, apartados 3 y 4, limitan la licencia a uso personal no
comercial, requieren permiso escrito para explotación comercial y prohíben crear
una base descargando sistemáticamente los materiales. Por ello la recolección
automática no forma parte del conector activo. La referencia a una
autorización escrita válida sigue siendo necesaria para importar material oficial. Una
variable de entorno no concede derechos: el operador debe obtenerlos realmente.
La importación de snapshots oficiales también exige referencia de autorización.
Alternativa: solicitar a Konami licencia/exportación autorizada e importar el
contrato CardRecord. No se ejecutó una extracción masiva ni se cargaron cartas
oficiales copiadas sin ese permiso.

## Yugipedia

https://yugipedia.com/wiki/Yugipedia:API
https://yugipedia.com/api.php
https://yugipedia.com/robots.txt
https://yugipedia.com/wiki/Template:CardTable2
https://www.mediawiki.org/wiki/API:Imageinfo
https://www.mediawiki.org/wiki/API:RecentChanges

La política documenta UA descriptivo con contacto, máximo una petición por segundo,
caché recomendada de 30 días y actualizaciones mediante recentchanges. La cuota
del cliente abarca robots, API, reintentos y descargas de imágenes, incluso entre
procesos que comparten el directorio de caché. No se reintentan CAPTCHA/403.

robots.txt respondió HTTP 200 desde este entorno y prohíbe expresamente agentes
como ChatGPT-User, GPTBot y OAI-SearchBot. No se realizaron consultas de cartas
para eludir esa restricción. El cliente de la aplicación queda deshabilitado hasta
que el operador revise las políticas aplicables y configure su servicio y contacto.
El acceso real a páginas de cartas y la compatibilidad con todo su marcado no han
sido certificados aquí. Los tests usan fixtures sintéticas y nunca constituyen una
ingesta real ni datos de producción.

archseries mezcla arquetipos y series. Solo se clasifica un grupo tras consultar
su página y comprobar categorías inequívocas de arquetipo o serie. Las relaciones
de soporte se almacenan separadas de la pertenencia.

## Imágenes

La licencia de texto del wiki no acredita derechos comerciales de escaneos o arte
de Konami. imageinfo/extmetadata registra autor, licencia y URL, pero ningún
archivo se aprueba automáticamente por estar accesible. Cada aprobación requiere
evidencia de permiso, y su revocación impide servir el archivo aunque siga en disco.
No se hace hotlink de imágenes no aprobadas. El fallback nunca usa otra impresión.
Galerías ambiguas, edición/arte desconocidos o metadatos insuficientes se registran
para revisión. Se descargaron ilustraciones generales de YGOPRODeck para la
prueba local; no se descargaron ni aprobaron escaneos de Yugipedia.

### Otras fuentes de escaneos por rareza

Revisado: 2026-10-26. Ninguna alternativa ofrece hoy escaneos por impresión con
condiciones claras para un sitio comercial:

- **Cardmarket API**: no acepta solicitudes de acceso nuevas y prohíbe compartir
  credenciales con terceros (https://help.cardmarket.com/en/cardmarket-api).
- **TCGplayer API**: el alta de desarrolladores está cerrada al público; el acceso queda
  para cuentas existentes y socios aprobados (https://docs.tcgplayer.com/docs/getting-started).
- **YGOPRODeck**: solo ilustraciones generales por arte, no por rareza.
- **Konami**: sin API pública; sus términos exigen permiso escrito para uso comercial.
- **Yugipedia**: la única con escaneos por impresión, publicados bajo uso justo; su
  licencia CC BY-SA cubre el texto, no el arte de Konami.

Vías posibles: pedir permiso por escrito a Yugipedia para usar sus escaneos con atribución,
o una licencia de Konami. Hasta entonces cada escaneo necesita su referencia de permiso.

### Fotos de vendedores

Las fotos que suba un vendedor van con su publicación (la copia en venta), no con el
catálogo. Al implementarlas: decodificarlas y volver a codificarlas (como `_save`),
limitar tamaño y formato, y definir en los términos de subida la licencia que el vendedor
concede sobre su foto. El arte de la carta sigue siendo de Konami.

## Vista provisional de imágenes en desarrollo

`LOCAL_PREVIEW_HOST_SUFFIXES` permite tratar un dominio privado de desarrollo (por ejemplo
`.app.github.dev` de un Codespace con el puerto privado) igual que localhost para la vista local
de prueba. Solo funciona con DEPLOYMENT_MODE=local y ALLOW_LOCAL_IMAGE_PREVIEW=true, no concede
derechos y la interfaz marca cada ilustración así servida con un aviso de imagen provisional.
`cardmatica preview-images` descarga las ilustraciones generales de las cartas del catálogo con
el mismo límite de una solicitud por segundo. No habilitarlo en un despliegue público.

`cardmatica product-images` hace lo mismo con las fotos de los productos de la demo: lee la foto
principal que declara cada página oficial de `backend/app/data/product_pages.json` (etiqueta
`og:image`, o la imagen del cuadro de Yugipedia), respeta robots.txt, pide una página cada 5
segundos (`PRODUCT_REQUEST_INTERVAL`) y solo acepta fotos del mismo sitio o de un CDN listado.
Guarda una copia WebP de 480 px como máximo. Las fotos son de Konami y de cada marca y no tienen
licencia: la API solo las sirve en la vista local (`/api/v1/product-images`, sin caché) y la
tienda las marca con el aviso rojo. Para publicarlas hace falta permiso de cada titular o
material de prensa con licencia de uso.

## Banlists

Revisado: 2026-10-23. Las listas incluidas contienen únicamente nombres de cartas y su
estado (prohibida, limitada, semi-limitada), con fecha de vigencia, URL de origen y fecha
de consulta. No incluyen textos, imágenes ni otros materiales de las cartas.

- TCG, vigente desde el 19 de octubre de 2026: leída una vez, de forma manual, en
  https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action?request_locale=en
  ("Status Updated 10/19/2026": 156 prohibidas, 92 limitadas, 7 semi-limitadas).
- OCG, vigente desde el 1 de octubre de 2026: transcripción comunitaria de la regulación
  oficial en https://yugipedia.com/wiki/October_2026_Lists_(OCG). Aplica a japonés,
  Asian-English y chino simplificado; Corea publica una lista propia.

No es una extracción sistemática ni un conector automático: no se agregó ningún cliente que
consulte esas páginas. Queda pendiente que el operador confirme si la reproducción de estos
estados requiere la misma referencia de autorización que las importaciones oficiales
descritas arriba, y ajuste o retire los archivos según esa revisión.

## Precios

Los precios del historial provienen solo de ventas completadas en Cardmática. No se
importan precios de terceros ni de guías de precios.


## Noticias

Consultado el 24 y 25 de octubre de 2026. Las noticias de Yu-Gi-Oh! del inicio salen de
feeds RSS/Atom públicos, hechos para que otros programas los lean, cada uno en su idioma:

- Portugués: Yu-Gi-Oh! Nexus
  (`https://www.yugiohnexus.com.br/feeds/posts/default?redirect=false`), blog brasileño de
  listas y spoilers de sets. `redirect=false` pide el feed propio de Blogger en lugar de
  mandar a FeedBurner.
- Inglés: YGOrganization (`https://ygorganization.com/feed/`) y YGOPRODeck
  (`https://ygoprodeck.com/feed_rss.xml`).
- Español: ninguna por ahora (ver abajo).

Revisado el 25 de octubre de 2026 desde un Codespace: Konami no publica feeds. Responden
404 tanto los generales (`/eu/es/feed/`, `/lat-am/feed/`, `/lat-am/pt/feed/`) como los de
categoría (`/eu/es/category/noticias/feed/`, `/eu/category/news/feed/`), y el blog
`yugiohblog.konami.com` ya no responde. Falta una fuente en español con feed; no se
traducen artículos de otras fuentes. El feed de YGOPRODeck trae XML inválido en algún
artículo: si el XML no se puede leer ni reparado, cada artículo se lee por separado y se
descarta solo el roto. Si una fuente falla, `cardmatica fetch-news` dice el motivo y las
demás siguen.

Nada se traduce: se guardan título, enlace, fecha y un extracto de hasta 220 caracteres
sin HTML, tal como los escribió la fuente, con su nombre y su idioma; el artículo
completo se lee en su sitio. No se copian imágenes ni textos enteros. Se pide robots.txt
antes de cada feed y se espera `NEWS_REQUEST_INTERVAL` (5 s) entre consultas; un feed con
DOCTYPE no se procesa. Las novedades del sitio son las pull requests unidas del
repositorio público `NEWS_SITE_REPO`, por la API REST de GitHub sin token (60 consultas
por hora; se usa una cada 3 h), y están en español. Esa API es para programas: su
robots.txt habla del sitio web, por eso es la única consulta sin él.
`NEWS_ENABLED=false` corta todas.
