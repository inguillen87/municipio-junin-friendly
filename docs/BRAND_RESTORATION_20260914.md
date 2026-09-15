# Recuperación de marca · 14 de septiembre de 2026

Se recupera la identidad aprobada «Puerta común» desde `96bd6cea63dd483ef041f509c225b949802a0cc0`. Los diez archivos SVG/PNG públicos coinciden byte a byte con ese commit. No se inventa una identidad nueva ni se modifica el emisor municipal.

El documento histórico `MUNICONTROL_BRAND_20260905.md` se conserva completo desde `115e6176535286ae7c556cb570dfd4969935df74`: registra publicación del 05/09, deployment `dpl_76uq4AT2cCxwaQ7QZt4nZxhBotEc`, código final `8824165773cacb79abd96cc7bc35e706b1818fbd`. Por tanto, esta entrega corrige una regresión de release. El commit de marca no era ancestro del `origin/master` revisado al comenzar; las respuestas HTTP públicas de relojes/reportes/icon.svg seguían mostrando la identidad anterior. Esa constatación no implica que todas las mejoras paralelas estén integradas.

Alcance: logotipo compartido, acceso, reportes, relojes, mapa de producto, manifiesto, favicon, iconos instalables y tarjeta social. Los iconos usan rutas derivadas del contenido para evitar respuestas antiguas conservadas como immutable. El CSS y los dos SVG horizontales entran en el precache público; las APIs y los datos nominales siguen fuera. Se normaliza el nombre visible MuniControl en el build y se mantiene la identificación de Junín.

El mapa de producto ahora carga el estilo compartido; su marca deja de desaparecer en móvil. El cambio no porta React, la arquitectura de la rama paralela ni modificaciones de acceso, roles o bases.

Validación local: 29 pruebas de identidad/PWA/metadata y contención aprobadas. Ocho capturas en Chrome (acceso, reportes, relojes y módulos a 1440/390), SVG decodificados, enlaces a iconos versionados, ausencia de monograma duplicado y desbordamiento horizontal. `scripts/verify-restored-brand-browser.mjs` usa sesiones/API inventadas y compara los recursos con el commit aprobado; las capturas no demuestran datos ni sesiones de producción. No se certifica instalación física en teléfonos ni renovación del caché de redes sociales.

Logotipo horizontal SHA-256: `7ca27608169fef1ff8f090af60a1e8df0cd020b5ce6cf944ced4787db9d0303a`.

La publicación de esta recuperación queda a cargo del integrador; estos controles locales no la dan por realizada.
