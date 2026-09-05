# Garantía 195 y distinción de recibos - 05/09/2026

## Incremento

- En Novedades, «Desde una planilla o archivo» permite elegir «Excel de garantía provincial · concepto 195». Lee el XLSX observado directamente, muestra importes por persona y total exacto, y reutiliza preparación/aprobación existentes. No requiere generar un TXT intermedio.
- Procesamiento local hasta validar. El original y los nombres no se suben. Sólo al crear se envían filas canónicas con legajo/concepto/importe al endpoint existente. Sin nuevas consultas de importación a Neon, migraciones ni cambios de permisos.
- Un error bloquea el lote completo; se conserva el archivo. Cambios de período/formato/archivo invalidan el resultado. Quitar el archivo impide reutilizar bytes anteriores. La carga asíncrona tiene recuperación y límite de espera.
- Los PDF individuales de control distinguen fecha completa, tipo y código GRH en el nombre y metadatos; no mezclan automáticamente mensual/bono del mismo mes. Siguen siendo resúmenes de control, no recibos oficiales firmados.

## Evidencia anterior a publicación

- `npm run build`: 1608 pruebas aprobadas, cero fallas/omisiones, shell construido.
- Pruebas de navegador de novedades: 20 aprobadas, cero fallas; una captura RETRO opcional omitida. Las capturas de garantía desktop1280/mobile390 sí se generaron y revisaron.
- Lector de garantía y PDF: 31 pruebas focales aprobadas, incluidas 21 del lector y 10 del resumen individual.
- Archivo original de agosto: 68 filas, total $13.981.013,93; reconstrucción TXT byte-idéntica; SHA-256 del XLSX sin cambio antes/después. Orígenes y límites en `NOELIA_SOURCE_FORMAT_COMPARISON_20260905.md`.
- Seis PDF de Noelia revisados completos y requisitos persistidos en `NOELIA_RECEIPT_REQUIREMENTS_20260905.md`.
- Muestra local de diseño del bono con firma gráfica, rotulada no oficial/sin firma digital, validada visualmente y por texto. Excluida tanto de Git como de Vercel. No se alteraron los PDF originales ni se produjo una firma criptográfica nueva.
- Manual de recibos municipal HTTP200; herramienta UI de navegador no pudo inicializar. No se afirma un recorrido nuevo completo de GRH/GRH_WEB.
- Pruebas de navegador usan datos sintéticos y API interceptada. No se crearon novedades ficticias en producción ni se repitió un E2E autenticado con los tres usuarios.

## Publicación

- Producción verificada: https://municipio-junin-friendly.vercel.app ; estado `READY`, subestado `PROMOTED`, destino `production`.
- Deployment: `dpl_FdnGah5KmNeCM57Xe2bJnjevwNic`.
- URL inmutable: https://municipio-junin-friendly-9e6ugwu5k-marcelos-projects-c26aa499.vercel.app .
- SHA de código publicado, corroborado en metadatos de Vercel: `2163ad06f92a519beb41ccb6ba5fd0618d8e41f0`.
- Build remoto: 14 segundos; 1607 pruebas aprobadas, cero fallas y una omitida. El resultado local sin omisiones no se presenta como resultado remoto.
- El alias público devolvió HTTP200 y SHA-256 idéntico a `public/` para las dos páginas `/novedades-nomina`, `/recibos-sueldo` y cuatro recursos: `payroll-guarantee-xlsx-import.js`, `payroll-novelty-workbench.js`, `payroll-receipt-preview.js`, `vendor/fflate.min.js`.
- `/novedades-nomina.html` redirige HTTP308 a `/novedades-nomina`.
- La ruta de la muestra privada `/output/pdf/noelia-bono-municontrol-revision.pdf` devuelve HTTP404. La muestra no forma parte de la aplicación pública.
- Consulta de logs del deployment, nivel error, última hora, máximo 20: sin entradas devueltas. Es una observación acotada posterior al despliegue, no una certificación de todos los flujos autenticados. No se configuraron ni verificaron drains externos.
- No se escribieron novedades, cierres ni liquidaciones de prueba en producción. Continúan pendientes la emisión oficial de recibos con detalle canónico y firma digital propia, y la prueba autenticada de extremo a extremo con los tres usuarios.

Este registro documental es posterior al despliegue; su eventual commit no sustituye al SHA de código publicado indicado arriba.
