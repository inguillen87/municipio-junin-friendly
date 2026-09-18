# Consulta de artículos y selección de referencias

## Funcionalidad

Dentro de una ficha del Registro Normativo se incorpora búsqueda literal en las transcripciones de esa versión, con resultados, resaltado y diez artículos por página. Se conservan el texto original, sus signos, cifras, negaciones y la posición del artículo. La búsqueda ignora mayúsculas y acentos de vocales, pero distingue ñ de n; no es una búsqueda semántica ni se extiende a PDF no transcritos.

La consulta es local: escribir, buscar, cambiar de página o seleccionar no llama a servicios de IA ni genera escrituras. Hasta treinta artículos pueden seleccionarse para una descarga TXT de trabajo. La selección se conserva entre filtros y páginas de una misma versión y se puede revisar antes de exportar. Cambiar de norma o versión elimina la selección anterior.

Cada selección incluye título, norma, versión, página, enlace interno al artículo y SHA-256 del PDF fuente. Los textos se copian completos, no se resumen ni se completan automáticamente. El archivo identifica las versiones documentales históricas. No constituye copia certificada, dictamen, comprobación de firma o acreditación de vigencia.

Antes de generar la descarga se vuelve a consultar la ficha mediante el endpoint autorizado existente. Deben coincidir identidad, versión, última versión conocida, título, documento y artículos. Si la ficha cambió, se detiene la exportación sin borrar la selección. Denegación de acceso retira la ficha; cerrar o cambiar de vista cancela la solicitud y descarta respuestas tardías.

Los enlaces profundos siguen usando la posición original del artículo, no su posición en el filtro. Un enlace al artículo 23 abre la tercera página y mueve el foco al encabezado correspondiente. La vista móvil evita que la etiqueta de versión o los controles de selección compriman el texto.

## Límites y continuidad

No se agregaron tablas, endpoints, permisos, datos de prueba en el municipio ni servicios pagos. La API de Registro Normativo y sus operaciones de guardado permanecen sin cambios. Las transcripciones existentes deben contrastarse con el PDF; una búsqueda o descarga no verifica su exactitud.

Se intentó preparar una vista del PDF original en la página citada, pero la herramienta bloqueó la escritura de su cliente. Ese archivo no se integró ni se publicó; el PDF sigue disponible por la descarga original existente. Esta entrega cierra la búsqueda, referencias y selección sobre artículos, no el visor pendiente.

Septiembre, edición/baja/reingreso de legajos, recepción de los relojes adicionales, expedientes y obligaciones de Mariano, y la integración oficial de firma conservan sus cierres independientes. No se aplicaron migraciones ni se alteraron haberes, cuentas o marcaciones durante este incremento.

## Verificación

Nueve pruebas unitarias nuevas cubren búsqueda literal, Unicode, índices estables, límites, conservación exacta de texto y revalidación. La regresión completa terminó con 3.633 pruebas aprobadas y compilación correcta. El paquete jurídico queda en 86.759 bytes gzip, dentro de su presupuesto existente de 100.000.

El recorrido nuevo utiliza 25 artículos sintéticos y prueba paginación, búsquedas sin consultas extras, selección a través de filtros, TXT con fuente, cambio de versión, enlaces profundos, versión histórica, respuesta tardía y denegación. Se inspeccionan escritorio y 390/320 px. No se crea una norma real ni se cambia un empleado durante las pruebas.

Se amplía el workflow de publicación existente para comprobar este recorrido junto con el registro y la comparación documental. Sin nuevo workflow ni previews. La publicación y sus resultados deben acreditarse por separado de estas pruebas locales.
