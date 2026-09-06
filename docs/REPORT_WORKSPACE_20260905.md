# Reportes y controles por tarea · 2026-09-05

## Resultado

Un espacio de trabajo para Informe de RRHH, Control bancario, Escolaridades y F.931. Una tarea visible por vez, con enlaces directos y opción explícita de ver todas. La navegación React no monta ni desmonta formularios: conserva archivos, campos y resultados existentes mientras la página permanece abierta. No conserva archivos al recargar o cerrar.

Se corrigió un fallo operativo: `reportContent[hidden]` contenía también las tres herramientas locales. Una respuesta fallida de `friendly-data.json` las ocultaba aunque no dependían de ese informe. Ahora son secciones independientes. “Reintentar informe” recupera únicamente esa fuente sin recargar la página ni duplicar consultas o eventos. Sin fuente válida, las cifras y descargas del informe siguen deshabilitadas.

## Experiencia y alcance

- Identidad azul/verde, tipografía sans-serif, campos delimitados, foco visible y controles táctiles.
- Período y cuentas bancarias agrupados; detalle de formato bajo demanda. Escolaridades y F.931 conservan sus límites y salidas deshabilitadas cuando corresponda.
- Hashes anteriores, Atrás/Adelante, enlaces a descarga con carga tardía y navegación por teclado conservados. Sin JavaScript de la isla, los enlaces y herramientas mantienen su estructura multipágina de respaldo.
- La isla sólo se descarga en Reportes: 61.981 bytes gzip incluido React. Acceso conserva su propia isla de 62.122 bytes. Ninguna dependencia nueva.
- El build incluye CSS e isla pública de reportes en el manifiesto de caché y en su versión; no amplía caché a acceso, identidad, archivos seleccionados o APIs.
- Sin migraciones, escrituras en Neon, cambios de roles, fórmulas, importes, recibos, credenciales o integraciones municipales.

## Validación

- 1.667 pruebas generales aprobadas: incluye recuperación 503/contrato inválido, reintento sin duplicados, navegación, conservación de estado y contratos existentes.
- `verify-report-workspace-browser.mjs`: Chrome a 320, 390, 768 y 1280 px. Todas las solicitudes interceptadas; falla de fuente y recuperación, archivos conservados, navegación/historial, Excel descargado, impresión sin menú, deep link y alternativa con isla no disponible. Cero solicitudes externas y cero errores de ejecución.
- Se detectó y corrigió una superposición de la fuente lateral en tamaño intermedio; revisión independiente detectó y corrigió la barra lateral en impresión.
- `verify-rrhh-report-browser.mjs`: Excel y PDF construidos desde la instantánea agregada existente, con validación de contenidos; escritorio y móvil.
- `verify-schooling-report-browser.mjs` y `verify-f931-report-browser.mjs`: diagnósticos reales con archivos sintéticos y controles de generación/presentación aún bloqueados. No equivalen a validación contable ni aceptación de ARCA.
- No se navegó nuevamente GRH ni se importó otro período en este incremento. Tampoco se volvió a conciliar una nómina bancaria real ni se certificó un recibo.

## Publicación

Publicado y comprobado: commit `8d116869ca0ea968a4c727e91eb84e88d89f29bc`, deployment `dpl_Go6LTTazDYucDGiyEoJuVXT8dy7N`, alias https://municipio-junin-friendly.vercel.app/reportes-rrhh. Target production, READY; 25,128 segundos de construcción según API. Framework: shell multipágina, islas React y APIs Node.js.

`verify-brand-production.mjs` comprobó coincidencia por hash de HTML/CSS/islas/manifiesto/recursos públicos con el build revisado. `verify-report-workspace-production.mjs` recorrió las cuatro tareas a 390 y 1280 px en Producción: fuente cargada, menú exclusivo, impresión correcta, sin desbordamiento ni llamadas a APIs. Sin errores devueltos por logs de este deployment, nivel error, 30 minutos, límite 20. Drains y monitoreo continuo no auditados. Rollback previo: `dpl_5pTza8awYHNHuzW8XRMz8RiG1dds`.

## Siguiente alcance útil

Continuar con el circuito bancario de Noelia: disponibilidad y conciliación de fuentes reales, diferencias accionables y salida exacta por banco/jurisdicción. Escolaridades requiere cerrar su muestra/reglas; F.931 requiere validar campos y especificación aplicable. No presentar controles estructurales como automatizaciones finales.
