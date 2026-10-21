# Investigación de fuentes y límites de producción

Revisado: 2026-10-20. Volver a revisar antes de habilitar una fuente.

## Konami

La web oficial enlaza consultas HTML card_search.action, card_list.action y
forbidden_limited.action. No se encontró documentación de una API pública oficial.
El conector utiliza formularios y vínculos públicos observados, no endpoints API
inventados ni rutas autenticadas.

https://www.db.yugioh-card.com/yugiohdb/
https://legal.konami.com/games/neuron/terms/tou/en/
https://www.konami.com/siteinfo/en/

Los términos de Neuron, apartados 3 y 4, limitan la licencia a uso personal no
comercial, requieren permiso escrito para explotación comercial y prohíben crear
una base descargando sistemáticamente los materiales. Por ello la recolección
automática está deshabilitada por defecto. KONAMI_ENABLED y una referencia a
autorización escrita válida son requisitos independientes de robots.txt. Una
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
para revisión. No se descargó ninguna imagen de carta durante esta implementación.
