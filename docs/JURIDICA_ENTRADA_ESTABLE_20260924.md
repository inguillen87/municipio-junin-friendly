# Jurídica · entrada estable del primer campo

## Incidente encontrado durante la aceptación cruzada

La aceptación de producción del commit `5e3cdcf` falló en `Native novelty sheet 057`, dentro de su recorrido del Registro normativo. La prueba llegó a la revisión final sin el número del documento: la validación nativa exigió completar ese campo. La captura del job `107689009712`, run `36016130219`, conserva el formulario con título, año y PDF informados y número vacío. No se registró ninguna norma en esa prueba.

El código de apertura programaba con `setTimeout(..., 0)` un cambio de foco al título después de mostrar el formulario. Ese cambio diferido puede interferir con la escritura inmediata del primer campo. Se retiró el temporizador y se hace el enfoque durante el montaje del editor con `useLayoutEffect`, sólo cuando se abre un borrador. Es una corrección de la interacción, no una omisión ni relajación de la validación del número.

Los cambios posteriores del formulario no disparan nuevamente ese foco. Se conservan la preparación de versión, la validación, el aviso de descarte, la confirmación final, los permisos, la concurrencia y las fuentes originales.

## Aceptación

Se agregaron tres pruebas de regresión y un recorrido de escritura inmediata sobre cuatro borradores consecutivos sin guardar. El circuito completo del Registro normativo pasó 23 comprobaciones locales, incluyendo PDF de dos páginas, versiones, exportación, recuperación de respuesta perdida, restricciones de lectura y revocación.

El build completo final pasó 4.902 pruebas locales, cero fallos y dos omitidas. Este incremento incorpora el sprint de confirmaciones de acciones de `5e3cdcf`; en conjunto se añadieron 76 pruebas desde `d7309dd`.

Las API de la aceptación están interceptadas y sus datos son sintéticos; las lecturas de publicación usan sólo archivos públicos y verificaciones anónimas. No se cargaron normas, decisiones ni datos de prueba en la base municipal. El estado del CI final y del despliegue se acredita por separado con su commit; el fallo del commit anterior no se presenta como una ejecución exitosa.

## Plan

Se cierra este defecto de captura del Registro normativo para el área de Mariano. No implica cerrar sus expedientes, relaciones normativas o alertas; tampoco sustituye los pendientes de relojes, reglas, novedades, recibos firmados o la selección sucesora del respaldo. La matriz integral conserva esos cierres funcionales separados.
