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

## Vista provisional de imágenes en desarrollo

`LOCAL_PREVIEW_HOST_SUFFIXES` permite tratar un dominio privado de desarrollo (por ejemplo
`.app.github.dev` de un Codespace con el puerto privado) igual que localhost para la vista local
de prueba. Solo funciona con DEPLOYMENT_MODE=local y ALLOW_LOCAL_IMAGE_PREVIEW=true, no concede
derechos y la interfaz marca cada ilustración así servida con un aviso de imagen provisional.
`cardmatica preview-images` descarga las ilustraciones generales de las cartas del catálogo con
el mismo límite de una solicitud por segundo. No habilitarlo en un despliegue público.

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

