# Automatización de archivos de Noelia - 05/09/2026

## Incremento implementado

Novedades > Desde una planilla o archivo > Excel de garantía provincial, concepto 195.
Lectura local del XLSX original; ya no requiere confeccionar, guardar y volver a cargar un TXT RETRO intermedio.
La selección de formato fija el concepto observado 195. El usuario elige período y tipo de liquidación; la hoja debe coincidir con ese período. Se previsualiza el lote completo antes de preparar. Preparar usa el contrato, autorizaciones y circuito de aprobación existentes, sin nuevas migraciones ni consultas de importación al cargar/analizar.

### Evidencia original, procesada en memoria

- ZIP aportado: `AGOSTO-20260902T125117Z-1-001 (1).zip`.
- Libro: `AGOSTO/LIQUIDACION MENSUAL/GARANTIA PROV (195)/LISTADO DE GARANTIAS PROV 195 08.2026.xlsx`.
- SHA-256 del libro: `8909adc3ee8e051e5ada9370ceaec37ae7c32897c5b9870e20cee3b55d2a546e`.
- Hoja única `195 08.2026`. B1 Legajo, K1 COEF. 81%. Datos B2:B69 y K2:K69. No hay filas/columnas ocultas ni vínculos externos.
- B + K guardados, redondeando cada importe decimal al centavo con HALF_UP, reproduce los 68 registros, el orden y todos los bytes de `195082026.txt`, incluidos ceros de relleno y CRLF.
- Total de registros/TXT: $13.981.013,93. K70 muestra $13.981.013,95: suma valores sin redondear por fila. No se fuerza igualdad con ese total ni se agrega una diferencia artificial.
- Q2:Q69 copia B; U2:U69 copia K. U70 copia el total, sin Q70. No se importa como otro agente.
- Las 477 fórmulas observadas conservan resultados; eso no prueba recálculo reciente. No se ejecutó ni modificó ninguna fórmula.
- Una fórmula compartida declara hasta K97 aunque datos terminan en 69: los rangos de fórmulas no determinan los registros importados.

El lector conserva decimales como texto y opera con BigInt. Admite hasta 500 registros/2 MiB, rechaza plantilla distinta, período discordante, duplicados, importes negativos/textuales, errores, caché ausente, filas ocultas y archivos fuera de límites. No devuelve subconjuntos preparables si hay errores. No copia nombres al contrato ni sube el libro.

### Alcance honesto

La regla reproduce esta pareja XLSX/TXT observada. No certifica las reglas salariales de garantía ni la vigencia del coeficiente 81%. La muestra no contiene empates exactos de medio centavo; esos límites se cubren con pruebas sintéticas. Un libro con otro coeficiente, otra disposición de columnas o otro propósito requiere un adaptador explícito.

## Otros formatos investigados, todavía no habilitados como importaciones

- Colegio Farmacéutico: archivos TXT de 76 y 80 caracteres con 22 documentos únicos y mismos importes por documento, pero diferente orden. Las posiciones del documento cambian: 10/8 versus 3/8 (base cero). No son archivos intercambiables sin transformación.
- OSEP: fuente histórica de 185 caracteres y exportaciones de 206 caracteres tienen diseños y poblaciones distintas; no son conversiones equivalentes. Fuente histórica 759 documentos únicos; archivos agentes/jardines 779 únicos combinados, con 750 comunes, 9 exclusivos históricos y 29 exclusivos recientes. No inferir personas faltantes ni importes por aproximación.
- Mayor/Full: usa documento y cantidad, no legajo e importe. Una variante FULL Servicios tiene 14 caracteres frente a los 13 del catálogo observado.
- El contrato actual de Novedades acepta legajo, no DNI. No se hace búsqueda aproximada por persona, ni una consulta por cada línea. Esas fuentes requieren un cruce exacto y no ambiguo en el servidor, en otro incremento.

Catálogo de referencia: `docs/GRH_OLD_FORMAT_EXPORT_20260904.md`. La investigación no modifica GRH, liquidaciones ni datos de Neon.

## Recibos nuevos y continuidad

Los seis PDF nuevos se revisaron completos, incluida representación visual y estructura de firma. Hallazgos, fuentes y prioridades: `docs/NOELIA_RECEIPT_REQUIREMENTS_20260905.md`.
El manual de recibos se consultó por HTTP 200 en el servidor municipal: `http://172.100.96.4:8080/GRH_WEB/Manuales/Guias/WebHelp/__Recibos_de_sueldo.htm`. Describe Nómina > Informes > Recibo de sueldo, con legajo, fecha, mes, año, tipo y pantalla/impresión. No se generó ni alteró una liquidación en GRH durante esta consulta.
La herramienta de control visual del navegador falló al iniciar con `failed to write kernel assets ... os error 3`; no se afirma un recorrido interactivo nuevo de todos los menús.

## Muestra visual local

Se generó `output/pdf/noelia-bono-municontrol-revision.pdf` con los importes conciliados del bono aportado y firma gráfica de la planilla aportada, sin alterar los originales. Etiqueta visible de muestra de diseño, no emisión oficial ni firma digital; no acredita depósito. No se publica como asset ni se incorpora al repositorio. Sirve para revisar la plantilla, no sustituye la futura emisión autenticada con datos por concepto y firma sobre el PDF definitivo.
