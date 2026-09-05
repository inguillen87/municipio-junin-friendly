# Acceso MuniControl · identidad visual aplicada

## Alcance del incremento

Rediseño del acceso, no de toda la plataforma. Encabezado blanco con la marca original, panel institucional azul y acción principal verde. Tipografía sans serif del sistema, sin descarga de fuentes ni nuevas imágenes generadas. La instalación y el enlace para compartir se mantienen como isla React, ahora debajo del acceso.

El celular muestra primero el formulario; el texto de presentación lateral se omite en pantallas pequeñas. Los indicadores históricos salen de esta pantalla de ingreso, pero no se eliminan del tablero público ni se alteran sus fuentes. `Consultar` abre esa vista sin cuenta. Invitación y guía conservan destinos reales; no se inventa recuperación de contraseña.

La presentación está en `assets/access.css`, cargada solamente por `login.html`. No modifica los módulos internos, las APIs Node.js, las fórmulas, los roles, las migraciones ni los datos de Neon. Se conservan correo, contraseña, selección explícita del ámbito, códigos por correo, autenticador, recuperación, cancelación y mensajes de error. La prueba de navegador detectó un defecto preexistente: `openMfaStep` no ocultaba el selector de contexto. Se agrega únicamente esa ocultación para mostrar un paso por vez, sin cambiar el protocolo de identidad.

## Criterio para próximos módulos

- Una acción principal clara por tarea; información complementaria bajo demanda.
- Azul institucional `#153a4b`, verde de acción `#167468`, fondo claro `#f6f7f5`.
- Una familia tipográfica, jerarquías cortas y nombres comprensibles para administrativos y contadores.
- Campos delimitados y controles táctiles de al menos 44 px; foco visible y estados ocultos fuera del recorrido de teclado.
- Mantener la identidad y los componentes existentes; migrar a React por flujo comprobable, sin reescritura masiva ni cambios de permisos como efecto colateral.
- Capturas y prueba del artefacto construido antes de publicar; comprobar versión y contenido servido después.

## Validación y publicación

- Revisión independiente de los 38 identificadores originales y los estados `hidden`. Los scripts se conservaron inicialmente; el recorrido posterior justificó la corrección de presentación de una línea descrita arriba.
- `npm run build`: 1.651 pruebas aprobadas (1.641 previas y 10 del nuevo diseño), incluida regresión del paso de verificación superpuesto.
- Marca revisada en acceso, tablero público y recibos a 390 y 1280 px. Sólo acceso cambia de composición. Recibos se prueban con datos inventados interceptados, no con una liquidación real.
- Instalación/compartir React a 320 y 1280 px: estados, cancelación, copia alternativa y formulario conservado. No se instala una app física ni se envían mensajes en estas pruebas.
- `node scripts/verify-access-design-browser.mjs`: 320, 390, 768, 1280 y 1920 px; 25 capturas; teclado, salto al formulario, mostrar contraseña, validación/foco, selección explícita, verificación por correo y cancelación. Un solo paso visible. Contraste inicial mínimo: texto 5,46:1 y límites de controles 3,55:1. Sin desbordamiento. Las 15 respuestas de identidad son simuladas; cero solicitudes reales, correos o sesiones.
- `node scripts/verify-brand-production.mjs`: HTML completo de acceso, CSS, recursos de marca, isla React, manifiesto y service worker coinciden por hash con el build revisado (normalizando saltos de línea). Metadatos públicos de acceso, tablero y recibos comprobados para WhatsApp/Facebook; PDF privado no publicado.
- `node scripts/verify-access-production-browser.mjs`: Producción real a 390 y 1280 px; diseño nuevo, acción principal visible, paneles secundarios ocultos e instalación React desplegable. Cero errores de navegador, desbordamientos o solicitudes a APIs. No es una prueba con credenciales reales ni una nueva entrega de correo.

## Deploy Result · 2026-09-05

- URL: https://municipio-junin-friendly.vercel.app/login
- Target: production
- Status: READY, alias y contenido servido comprobados
- Commit: `efcf47df1914ab93ebde0d0a06002543639c2633`
- Deployment: `dpl_5pTza8awYHNHuzW8XRMz8RiG1dds`
- Immutable URL: https://municipio-junin-friendly-l5jc8u8fw-marcelos-projects-c26aa499.vercel.app
- Framework: shell multipágina con isla React y APIs Node.js; no se cambia la arquitectura en este incremento
- Build Duration: 25,2 segundos desde buildingAt hasta ready según API de despliegues; fase de compilación reportada por CLI: 17 segundos
- Rollback previo verificado antes de publicar: `dpl_76uq4AT2cCxwaQ7QZt4nZxhBotEc` / `8824165773cacb79abd96cc7bc35e706b1818fbd`

### Post-Deploy Observability

- Error scan: no entradas devueltas por `vercel logs` de este despliegue con nivel error, ventana 30 minutos y límite 20; no implica auditoría de todo el tráfico histórico.
- Drains: no auditados en este incremento.
- Monitoring: prueba puntual pública verificada; monitoreo externo continuo no evaluado. Autenticación funcional cubierta con fixtures locales, sin iniciar sesiones ni enviar correos reales en Producción.
