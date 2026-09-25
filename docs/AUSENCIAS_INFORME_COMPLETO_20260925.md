# Historial individual · informe completo

## Recorrido implementado

Ausentismo → Ver caso → Ver historial de ausencias → **Descargar CSV completo** o **Vista imprimible**. El informe reúne todos los eventos del filtro, aunque la persona esté leyendo la última página. Conserva contrato, municipio, criterio de fechas, período solicitado y aplicado, corte y versión de fuente.

El colector lee lotes de 50 eventos y admite hasta 5.000, con un plazo de 90 segundos. Verifica el contexto, los totales y el orden entre páginas; vuelve a consultar la primera página antes de emitir. No agrega endpoints ni permisos. Los módulos de reporte se descargan sólo al solicitarlos, no al abrir o paginar el historial.

Cancelar, cerrar el historial, cambiar la fuente o perder acceso impide entregar un archivo parcial. Las fechas editadas sin aplicar deshabilitan las dos salidas. La vista vuelve al historial conservando su página; Escape regresa del informe al historial antes de cerrar el diálogo. El documento inicia en su encabezado y la consulta ordinaria no mueve el foco al botón de exportación.

## CSV y documento imprimible

El CSV utiliza UTF-8, punto y coma y valores entrecomillados. Incluye los eventos completos y el contexto, preservando fechas originales, cantidades completas y valores no informados. El nombre de archivo no contiene nombre ni legajo. No guarda cuerpos en el almacenamiento del navegador.

La vista imprimible presenta el agente, período, criterio, corte, indicadores, tabla completa y aclaraciones. **Imprimir / guardar PDF** vuelve a comprobar acceso y fuente antes de abrir el diálogo del navegador. No es un PDF firmado ni recibo de haberes: no acredita asistencia, justificación, licencia aprobada o descuento salarial.

La impresión comprobada utiliza A4 horizontal, márgenes, encabezados de tabla repetidos con agente/período, numeración de páginas y pie informativo. El estilo de página se aplica sólo mientras se imprime el informe. La salida de 61 eventos de prueba ocupa cuatro páginas, sin la quinta página casi vacía que apareció en la primera revisión. Se revisaron las cuatro páginas renderizadas, además de las vistas de escritorio y móvil a 390 píxeles.

## Verificación

Se conserva el trabajo iniciado en `0cf5b2c`, basado en la versión remota `9126e00b3a05eec394ab58ee4fdb83191ab72253`. Se corrigieron dos errores que impedían completar el script de aceptación: una declaración duplicada de CSV y la liberación del worker PDF.js a través de su tarea de carga.

Pasaron 17 pruebas unitarias nuevas, incluyendo recolección de 61 eventos desde una página con 11 filas, solapamiento de 40 eventos, cambios de contexto/fuente, cancelación y denegación final. La aceptación de navegador incorpora CSV descargado, PDF generado y extraído, dimensiones A4, numeración, límites de acceso y conservación del contexto. Las APIs del navegador son sintéticas e interceptadas: no equivale a una aceptación de Noelia con datos reales.

El estado final de build, CI, publicación y cotejo de archivos se registra por el commit exacto. No se declaran pruebas adicionales bloqueadas o no ejecutadas como aprobadas. Este incremento no modifica fuentes de GRH, datos municipales, haberes, permisos ni relojes. El staging del 22/09 continúa separado de la selección activa; la revisión de dependencias nativas y la autonomía tienen sus propios cierres.


### Resultado de aceptación local final

El build final pasó 5.322 pruebas, cero fallos y dos omitidas. El recorrido integrado aprobó 39 comprobaciones, siete vinculadas a esta salida completa o su carga diferida. Se descargaron 61 filas de eventos y se generó/leyó el PDF A4 horizontal de cuatro páginas, con contexto repetido y numeración. Las cuatro páginas se renderizaron y revisaron visualmente; escritorio y viewport de 390 píxeles también se inspeccionaron. El CI y la versión publicada se acreditan por separado.
