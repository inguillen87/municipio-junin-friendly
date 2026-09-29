# Noelia · importación masiva TXT, distinta de la exportación AMARU

## Incidencia y reproducción
El mensaje del 29/09 a las 14:02 informa que la carga masiva por TXT no funciona; a las 14:01 confirma que ya puede entrar al alta de una carga familiar, no necesariamente que haya completado una escritura familiar.

Sobre master `3e64af79f161376ec37c395880164238eebd1bc7` se reprodujo un rechazo previo al contenido: `handleFile` exigía extensión `.csv`. El selector tampoco ofrecía `.txt`. Un archivo de texto con el contrato CSV exacto terminaba en «Archivo no admitido», cuerpo vacío y cero POST. Eso se comprobó en `verification/novelty-txt-baseline/result.json`.

La consulta READ ONLY de la cuenta municipal confirmó membresía activa y las seis capacidades de novedades: lectura, lectura nominal, preparación, aprobación, exportación y auditoría. No se modificaron permisos, contraseñas, sesiones ni MFA. Este diagnóstico no suplanta su sesión ni acredita la carga de su archivo particular.

## Función integrada
En Novedades → Carga masiva · TXT / CSV se selecciona explícitamente el formato y la codificación, se carga o pega el texto, se valida el archivo completo y se crea el lote mediante el circuito existente.

Formatos admitidos:
- CSV o TXT con las diez columnas originales y su encabezado; conserva la validación previa existente.
- TXT por columnas separadas por punto y coma, tabulación o barra vertical. Selección explícita de dos, tres o cuatro columnas: legajo y concepto por fila o concepto común, unidades e importe como datos distintos. El encabezado es una opción explícita y debe corresponder al diseño elegido.
- RETRO: legajo en desplazamiento 0/longitud 8, importe en desplazamiento 8/longitud 10 con punto decimal. Registro de 18 caracteres, sin encabezado. El concepto se informa, no se deduce del nombre del archivo.
- TXT de posiciones declaradas por legajo: ancho exacto, inicio/longitud de identificador y valor, clase unidades/importe y convención decimal. Los campos no pueden superponerse ni exceder el registro; fuera de ellos sólo se permite relleno blanco.

La ubicación de campos RETRO se cotejó en los registros de configuración `formatoimportacion/formatoitem` del respaldo entregado. No se equipara este contrato acotado con todos los formatos históricos ni con una aceptación de un organismo externo.

UTF-8 se decodifica estrictamente; Windows-1252 requiere elección expresa y recargar el archivo. No se introducen caracteres de reemplazo. Cambiar codificación retira el contenido ya decodificado. Los TXT fijos usan ASCII para evitar ambigüedad entre bytes y posiciones de caracteres.

## Identidad, valores y persistencia
Los adaptadores de esta entrega **reciben legajos, no DNI**. Formato Junín y MAYOR y FULL de GRH identifican por documento en su configuración; no se ofrecen como si ese documento fuera un legajo. Falta su conciliación de identidad correspondiente y la prueba del TXT exacto que intentó cargar Noelia. No se declara resuelto ese circuito por aceptar la extensión.

Se mantiene el límite de 500 registros y 480 KiB. Las líneas inválidas, vacías intermedias, duplicados y cambios de diseño retiran la previsualización completa; nunca se omiten filas para formar un lote parcialmente aceptado. Los ceros de relleno en los identificadores TXT se normalizan numéricamente de forma exacta, detectando alias duplicados; el texto original permanece en el editor local.

Las unidades no se convierten en importe; el importe ausente sigue siendo null, distinto de cero. Los separadores de miles y decimales incompatibles se rechazan. Los decimales implícitos exigen una escala declarada, nunca se elige una escala por el código del concepto. Un importe de más de dos decimales se rechaza, no se redondea.

La creación, la validación del servidor, la revisión independiente y la clave de idempotencia no cambian. Cambiar archivo, formato, columnas, concepto o decimales retira el borrador validado. Una respuesta de FileReader antigua no reemplaza un texto más reciente ni vuelve a poblar la pantalla tras retirar el permiso. Se mantienen los modos individual, rápido y planilla, y la restricción individual de las altas nativas.

## Pruebas ejecutadas
- 61 nuevas pruebas de adaptadores, valores exactos, límites, duplicados, codificación y formatos; 99 junto con las regresiones del parser/revisión original.
- Suite completa: 5.786 aprobadas, cero fallos y dos omitidas; construcción correcta.
- El navegador monta el workbench real compilado: lectura TXT mediante FileReader, validación de 60 registros, creación del lote completo aun con la vista filtrada, RETRO, posiciones, tabulaciones, ANSI, plantillas, valores nulos/cero y reintento con la misma clave. Todos los POST están interceptados con respuestas sintéticas; no se guardan novedades municipales.
- Regresiones: revisión anterior 21 escenarios, controles de lote 8, planilla 22. Sin errores de JavaScript. Interfaz inspeccionada a 320 y 390 píxeles.
- La prueba estática antigua buscaba `fatal:true` dentro del handler. Ahora comprueba el uso del decodificador y que éste mantenga la decodificación estricta; se añadieron pruebas de bytes inválidos. No se suprimió el control de codificación.

El workflow de controles de novedades incorpora el nuevo recorrido para PR y producción. El verificador público compara HTML y los dos módulos nuevos con el build integrado, antes de repetir el recorrido con APIs sintéticas. Los módulos privados quedan excluidos de caché del service worker.

## Límites de aceptación
No se importó el archivo exacto que Noelia intentó cargar el 29/09, que no está identificado en su mensaje. La enumeración del archivo de referencias de agosto fue posible; un intento de análisis adicional de ejemplos fue bloqueado y no se ejecutó. Se consultaron por separado únicamente registros de configuración de formatos en el respaldo entregado.

No se afirma que todos los TXT de terceros estén homologados ni que un archivo por DNI pueda cargarse como legajo. Para cerrar su caso nominal hace falta identificar el TXT concreto y su diseño, completar cualquier resolución de identidad pendiente y confirmar su creación desde la sesión de Noelia. Tampoco se modificó la carga familiar, la firma de Hugo/Noelia, los relojes ni el exportador AMARU.

Este incremento resuelve el rechazo general de extensión y entrega importación TXT por legajo con diseños explícitos; no certifica que los módulos 1–10 estén terminados.
