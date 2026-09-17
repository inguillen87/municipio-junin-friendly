# J1.1 · Comparación documental de versiones

Continuidad de #40 y #37. Este incremento utiliza el Registro Normativo nativo ya publicado; no modifica sus datos, API, controles de escritura, permisos ni alcance municipal.

## Operación
Jurídica y Legislativa → Registro normativo → ficha con dos o más versiones → **Comparar versiones**. Se eligen una versión inicial y otra posterior. Sólo al confirmar la consulta se recuperan ambas mediante el endpoint de detalle autenticado existente, con sus números exactos. No se compara contra una referencia móvil a «la última versión».

El resultado presenta cambios de título, clase de documento, temas, procedencia, resumen y fechas; diferencias entre transcripciones de artículos; responsables, fecha y motivo de cada versión; y huellas del PDF. Las referencias enlazan la versión concreta y el artículo correspondiente. La herramienta funciona con permiso de consulta: no requiere permiso de registrar ni vínculo laboral.

## Qué se compara y qué no
- Comparación textual exacta de los artículos transcritos. Diferencias numéricas, puntuación, espacios, acentos y negaciones no se normalizan ni se omiten.
- Etiquetas de artículos coincidentes salvo mayúsculas se relacionan. Cambiar «Art. 1» por «Artículo 1» no produce una equivalencia automática: se muestran una entrada no presente y otra incorporada.
- Cambio de página o etiqueta permanece visible aunque no cambie el texto. Reordenar artículos se muestra por separado, sin confundir la inserción de una fila con una modificación de todos los artículos siguientes.
- Igualdad SHA-256 indica igualdad del contenido binario registrado. Cambiar el nombre del archivo se distingue de cambiar sus bytes. Un PDF distinto no demuestra que se modificó una norma.
- El informe no compara texto interno de PDF, interpreta vigencia, verifica firmas, propone derogaciones ni sustituye revisión jurídica. No usa IA ni envía documentación a proveedores externos.

El resaltado usa una comparación de tokens con trabajo acotado. Los textos extensos se presentan como bloques de diferencias conservando todos los caracteres. Los límites documentales existentes siguen vigentes.

## Controles
Se verifican la identidad de la norma, los números de versión solicitados y el contrato de respuesta. Ante versiones diferentes de las pedidas, datos inconsistentes o errores no se presenta una comparación parcial como válida. La selección cambiada limpia el resultado anterior. Cerrar o cambiar selección cancela las consultas; la revocación del permiso elimina los resultados privados. No hay almacenamiento persistente del comparador en el navegador.

Se conserva el comportamiento de altas, revisión, recuperación de intentos, descargas originales e historial. La lectura de una versión desde un enlace ahora también exige que el servidor devuelva exactamente el número pedido.

## Aceptación
Pruebas unitarias sobre comparación de datos, identidad, número de versión, artículos incorporados/no presentes/modificados, orden, archivos, citas y reconstrucción exacta de texto. Recorrido del React compilado/publicado con handler GET real y autenticación/SQL sintéticos: selección, lectura a demanda, resaltado, filtros, fallos, respuestas tardías, cierre, rol de consulta, referencias y revocación. No hay documentos ni cuentas municipales de prueba.

La verificación de publicación reutiliza el workflow existente de Novedades, su instalación y navegador. No se agregan dependencias, migraciones ni previews por ajuste. Reversión: revertir sólo el commit de interfaz y comparación; no restaurar tablas.

## Siguientes cierres del plan general
La comparación documental completa una parte de la trazabilidad de J1; no se da por terminado el motor de vigencia J4. Siguen extracción asistida de PDF con revisión, expedientes y trámite legislativo, contratos/obligaciones, relaciones motivadas, alertas y análisis con citas. La autonomía salarial #37 mantiene sus propios cierres: topes oficiales versionados, turnos y justificaciones homologados, catálogo ejecutable y conciliación por legajo/concepto. Registrar o comparar una norma no activa un parámetro ni altera haberes.
