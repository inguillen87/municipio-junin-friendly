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

Pendiente de registrar URL, ID y SHA tras verificar el despliegue. No confundir este checkpoint con evidencia de Producción.
