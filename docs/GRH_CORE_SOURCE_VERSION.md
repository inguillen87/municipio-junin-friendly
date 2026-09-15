# Versiones de la fuente GRH

Este incremento conserva el núcleo del 6 de agosto y prepara una lectura completa del respaldo del 10 de septiembre. No activa septiembre en las pantallas ni cambia los importadores o vistas operativos. El detalle de nómina y la fuente bancaria del 19 de agosto mantienen su procedencia independiente.

## Conservación y consulta

`061-grh-core-source-version.sql` agrega una versión identificada por fuente, manifiestos, corte, empresa, vinculación municipal y lote base. Guarda únicamente altas, reemplazos y ausencias respecto del lote explícito. Los reemplazos y ausencias conservan también el registro anterior literal. Las tablas y el sello de verificación son inmutables; después del sello tampoco se pueden agregar filas a esa versión.

`prepareGrhSourceVersion` consume los artefactos ya extraídos y vuelve a comprobar sus huellas. `importGrhSourceVersionWithinTransaction` exige la huella aprobada del paquete y una transacción del llamador. Comprueba las proyecciones completas de la base y del candidato, incorpora los deltas y sella la versión. Repetir el mismo paquete no duplica filas. Un error requiere que el llamador revierta la transacción completa.

`readGrhSourceVersionEntity({client, versionId, entity, revision})` permite consultar `baseline` o `candidate` para corridas, snapshot, movimientos, hechos mensuales y conciliación administrativa. Devuelve todas las filas con una proyección común, huella de fuente, corte y fecha de nómina. No admite `latest`, no combina revisiones y rechaza una base alterada o una versión incompleta. La conciliación conserva evidencia administrativa y de liquidación; una ausencia del snapshot no se convierte en baja laboral. Los importes siguen siendo valores nominales de origen; no se recalculan.

Estas consultas son internas: runtime no tiene acceso a las tablas ni a las funciones nuevas. Los futuros adaptadores deben incorporar sesión, permisos y selección explícita antes de habilitar una versión al usuario. Ninguna fila de este contrato se rotula como operativa.

## Evidencia local y capacidad

El ensayo sobre la restauración existente verificó las cinco proyecciones completas del candidato: 624 corridas, 847 integrantes del snapshot, 495.237 movimientos, 216.411 hechos mensuales y 2.452 conciliaciones. Los 11.430 deltas conservan las 811 correcciones mensuales, un hecho mensual ausente y 13 movimientos ausentes, además de las otras diferencias del respaldo.

El crecimiento medido de las relaciones nuevas fue **17.473.536 bytes**, aproximadamente 16,66 MiB. No es una proyección del tamaño total de la actualización. El importador reserva 24 MiB para este incremento, conserva 16 MiB libres dentro del límite de 512 MiB y comprueba el tamaño real al finalizar; excederlo rechaza la operación.

`rehearseGrhSourceVersion` sólo acepta la restauración local existente y siempre revierte. Comprueba repetición, consulta íntegra, inmutabilidad, datos incompletos, alteración del lote base, denegación a runtime y conservación de los datos y vistas actuales. No crea conexiones, bases o servicios.

Para activar septiembre todavía falta medir la transición conjunta con los datos curados y las identidades, y adaptar todos los consumidores del núcleo a una revisión explícita. El guard anterior de S11 sigue vigente. Incorporar una versión para revisión no declara nómina aprobada, pago efectuado ni vigencia operativa.
