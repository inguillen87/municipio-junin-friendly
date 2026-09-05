# MuniControl - identidad Puerta común

## Dirección

Dos arcos abiertos forman una M y dejan una puerta central. Representa un punto de acceso común para equipos municipales; no es un sello gubernamental ni una certificación de documentos. Mantiene el nombre MuniControl y la experiencia Friendly.

La exploración visual se realizó con la herramienta integrada de generación de imágenes. El arte final de producto es vectorial, definido y revisado en el repositorio: colores planos, tipografía convertida a contornos, sin resplandores ni fuentes remotas. El boceto raster no es el archivo maestro ni se incorpora al sitio.

Brief utilizado: identidad original para MuniControl, SaaS municipal para contadores y administrativos; monograma de dos arcos abiertos que formen M; azul petróleo #153A4B, verde #167468 y blanco cálido #F6F5F0; palabra exacta MuniControl; silueta simple, alto contraste y versiones horizontal/monocroma/avatar; sin escudos, banderas, robots, brillos, gradientes ni métricas ficticias.

## Paquete

- `assets/brand/logo-horizontal.svg`: logo completo para fondo claro, contornos autónomos.
- `assets/brand/logo-horizontal-inverse.svg`: blanco y acento turquesa para fondo oscuro.
- `assets/brand/municontrol-mark.svg`: símbolo solo, fondo transparente.
- `assets/brand/avatar.svg`: fondo petróleo y área segura para recorte circular.
- `assets/pwa/icon.svg`: favicon y fuente de iconos instalables.
- `scripts/export-brand-assets.mjs`: exporta PNG transparentes de 2580x540, avatar1080, símbolo1080, favicon32/48 y PNG180/192/512/maskable512.

Entrega en `output/brand/`, excluida de despliegues como todos los outputs locales. Los maestros públicos son sólo los SVG propios y los íconos de plataforma, nunca firmas ni datos de recibos.

## Uso

- Mantener proporciones. No estirar, girar, agregar sombras ni recomponer la palabra.
- Para WhatsApp/redes usar el avatar1080; está centrado para círculo sin perder los arcos.
- Para encabezados de plataforma usar el logo completo, mínimo140px de ancho. En espacios pequeños usar sólo el símbolo, mínimo24px.
- Blanco sobre petróleo; petróleo sobre blanco/blanco cálido. El verde de acción #167468 mantiene su función actual; la marca no redefine colores de alerta, aprobación o error.
- Tipografía de interfaz: mantener la sans serif del sistema/Inter existente; números tabulares en tablas y totales, sin descargar fuentes por este cambio.
- El municipio conserva su identificación propia. En recibos, el emisor municipal y MuniControl se presentan separados.
- El logo de plataforma no implica firma ni certificación. Los PDF de control mantienen sus límites explícitos.

## Alcance del incremento

Lema: **Gestión municipal, más simple.** Tarjeta social pública1200x630 con Open Graph y Twitter Card emitidas en el HTML de las27 páginas publicadas; no depende de JavaScript ni de sesión. La imagen nunca contiene identidad personal, firma o recibo. Se preservan las directivas robots y canonical de cada página. Las redes pueden conservar vistas previas anteriores en sus propias cachés.

Los iconos PWA se publican con un directorio derivado del hash de todos los iconos SVG/PNG. HTML, CSS, manifest y precache apuntan a esa versión, para evitar la caché immutable que usaba el ícono anterior. El modo instalado y el control offline existente no se amplían a datos nominales.

El build normaliza una sola referencia a favicon, apple-touch-icon, manifest y color de interfaz en las 27 páginas, incluyendo las que no tenían todos esos elementos. El CSS común y los dos logos horizontales públicos se incluyen en el precache y su hash de versión para conservar la identidad sin conexión; no se almacenan recibos ni APIs.

## Verificación local

- Suite completa: 1629 pruebas aprobadas, sin fallos ni omitidas.
- Seis capturas de acceso, shell público y recibos a 390 y 1280 px; sin desbordamiento horizontal y con la variante clara sobre fondos oscuros. Acceso y shell público se revisan visualmente, no constituyen una validación funcional de todos sus flujos.
- PWA en Chrome real: worker activado, 28 recursos públicos y cuatro íconos versionados; inicio, CSS y dos logos recuperados después de cortar el servidor local. Cero APIs servidas y ninguna ruta privada en el caché. No equivale a instalarla físicamente en Android o iPhone.
- Recibos: JavaScript real con sesión y persona de prueba inventadas; buscar persona, elegir liquidación y descargar PDF de control con marca vectorial. Todas las peticiones interceptadas localmente, ninguna API de producción llamada.
- Revisión visual del PDF de control descargado y de la reemisión privada del bono de Noelia. La firma gráfica sólo se usa en esta última entrega autorizada; no se publica como recurso público.
- Paquete de marca separado: PNG para WhatsApp, fondos claros/oscuros y transparencias; SVG maestros y favicon. El ZIP contiene sólo estos recursos, sin recibos ni firmas.

Marca común en acceso y encabezados laterales, iconos PWA renovados, nombres de iconos versionados en el build para no conservar caché antigua, logo vectorial en cada PDF del módulo de recibos. No se cambian importes, roles, pagos ni bases de datos.

Recibo de Noelia: reemisión privada del bono de agosto2026 aportado, con todos los cinco conceptos y montos conciliados; nueva foto de firma/sello original y nuevo logo. Firma gráfica sin certificación digital. Originales conservados. No equivale a haber completado la emisión automática de todos los recibos nominales de la base.
