# B5.1 · integridad del paso Relojes → Preparte → Novedades

## Referencia y defecto reproducido

Trabajo iniciado desde el commit remoto `7ee821a1848bd04a4f7e9b87dcc5c2c6db58324b`, después de comprobar GitHub, el alias de Vercel y la copia de trabajo limpia. No se partió de un árbol anterior ni se modificó el expediente de proveedores diferido.

El preparte mensual agrupaba por legajo y comprobaba identidades personales distintas y tramos superpuestos. Sin embargo, la misma identidad personal podía aparecer en dos circuitos de origen —otro vínculo o equipo— sin horarios superpuestos. Ese caso seguía habilitado para proponer una novedad. Además, cambiar sólo el vínculo conservando las mismas horas no cambiaba la huella individual utilizada para conservar una selección revisada.

Se reprodujeron ambos casos con el reconstructor real y fuentes sintéticas: tres pruebas fallaron sobre el código anterior (dos circuitos, otro equipo y cambio de vínculo con los mismos tiempos). No se revisaron ni modificaron registros reales de empleados para reproducirlos.

## Corrección implementada

Cada marca reconstruida se relaciona con su referencia original. El agregado del legajo requiere un único par de circuito y equipo antes de ofrecer tiempo utilizable. Si existen varias identidades, vínculos o equipos, el preparte informa la incidencia, conserva los registros y sus intervalos, pero no presenta su suma como horas reconocibles.

La huella individual incluye ahora las identidades de circuito y equipo. Al cambiar un vínculo sin cambiar las horas, la selección previa se retira durante la actualización. Los campos declarados por Personal se conservan para una nueva revisión, pero no quedan seleccionados automáticamente. La huella del preparte completo incluye también el equipo.

Los circuitos nuevos de un mismo legajo no se fusionan por nombre, número o igualdad de horarios. No se inventa una asignación de contrato. Resolver ese caso exige revisar el vínculo de origen y volver a consultar; la pantalla no añade una excepción manual para eludirlo.

## Recorrido de aceptación

En Novedades → Generar preparte de mayor dedicación desde relojes, el registro conflictivo queda visible, desmarcado y sin controles editables de propuesta. La exportación conserva esa fila y el motivo, pero no genera una fórmula numérica de tiempo extra cuando el total no es utilizable. El paso a la planilla sigue exigiendo la revisión documental existente, sin cálculo automático de haberes.

Una recepción nueva sin cambios en marcas o vínculos conserva la evidencia anterior. Una reasignación de origen con la misma duración obliga a revisar de nuevo. Los nombres iguales con legajos distintos continúan separados. Los datos de prueba verifican también invariancia ante orden de eventos y conservación de la fuente original.

## Usabilidad de la revisión

La tabla de escritorio tiene altura contenida y encabezados fijos: recorrer las 25 filas de una página no aleja indefinidamente los controles de confirmación. La región permite navegación por teclado; se mantiene la presentación de tarjetas en pantallas pequeñas y la impresión sin recorte de altura. La exportación sigue utilizando todo el preparte, no sólo las filas visibles.

## Verificación y límites

Se agregaron nueve pruebas unitarias y cuatro comprobaciones al recorrido de navegador existente (12 en total). El recorrido utiliza el reconstructor y el flujo de validación reales con respuestas API interceptadas. Comprueba rechazo de mezcla de circuitos, retirada de selección ante cambio de vínculo, exportación completa y conservación de filas válidas. El lote de prueba se intercepta; no se escribe en la base municipal.

El build completo local pasó 4.982 pruebas, cero fallos y dos omitidas. El resultado del CI y el cotejo de archivos publicados se verifican por separado para el commit final. No se presenta el ensayo sintético como aceptación con las cuentas reales de Hugo o Noelia.

Este incremento no instala migraciones, modifica permisos o firma recibos. No incorpora el respaldo del 22/09 ni las fuentes aún pendientes de otros relojes. El alcance del preparte continúa siendo un punto y un mes; PM10 no se considera un subsistema distinto. La conciliación multiequipo, las reglas aprobadas y la entrega definitiva de novedades mantienen sus propios criterios de aceptación.

Comandos: `node --test tests/preparte-stream-integrity.test.js tests/attendance-preparte.test.js`, `npm run build`, `node scripts/verify-attendance-preparte-browser.mjs`. La verificación publicada usa `node scripts/verify-attendance-preparte-browser.mjs --published` y el control de huellas existente, con todas las solicitudes de negocio interceptadas.
