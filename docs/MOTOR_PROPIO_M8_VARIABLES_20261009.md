# M8 · Variables originales de cada liquidación propia

Pedido M8-01 de Noelia: consultar por mes y legajo las variables de la liquidación, con prioridad para antigüedad. Se contrastó la página 1 del módulo 8 original, SHA-256 `3eafe9bf6f3190a8aebf2cadab77b2507c285c6c08035d5c1e360aa6b9951ec2`. El PDF y su captura permanecen privados.

En **Nómina → Reportes → Consultar liquidaciones propias**, elegir meses y tipos, consultar y seleccionar:

1. **Variables originales de la liquidación**: una fila por entrada y participación, con clave, descripción del catálogo conservado, valor literal, unidad declarada, cantidades de conceptos que la usaron directamente o mediante otro concepto, procedencia y versión/fecha originales.
2. **Uso de variables por concepto**: detalle completo de cada relación realmente ejecutada. Una entrada capturada sin uso tiene su propia fila; las dependencias de una rama que no se ejecutó no se presentan como uso.
3. **Fuentes de las variables**: corrida original, participaciones seleccionadas, fecha declarada si existe y huellas del programa, captura, entradas y resultado.

PDF, Excel y CSV incluyen todo el alcance de cada informe, aunque haya búsqueda o varias páginas. Se mantienen rangos inclusivos, selección exacta de contratos, períodos, tipos, jurisdicción conservada y los controles del lector anterior. La vista resumida evita repetir el valor de una variable por cada concepto; el detalle permanece disponible por separado.

## Fuente y fidelidad

Cada grupo cerrado identifica la corrida, las huellas de sus entradas y resultado y los conceptos originales. Se recupera cada corrida una sola vez mediante el GET nominal existente de liquidación propia, incluso cuando ya no aparece entre las capturas actuales del período. Se verifican integridad, período/tipo, contrato, dimensiones, precisión, totales, conceptos y traza contra su cierre original. Una captura faltante, ajena, repetida o incompatible invalida el conjunto completo, incluso si un filtro excluiría al legajo afectado.

Las descripciones y orígenes vienen del programa y catálogo conservados en esa captura, nunca del catálogo vigente. El uso por concepto se obtiene de referencias efectivamente registradas en la traza, incluidas las transitivas, sin evaluar fórmulas ni reconstruir el resultado. Los valores conservan su representación decimal original; nulo, cero y ocho decimales permanecen distintos. Las unidades se muestran como fueron declaradas, sin convertir horas, porcentajes o unidades en otra magnitud.

Antigüedad se muestra cuando fue capturada como una entrada de esa liquidación, con su descripción y unidad originales. No se infiere del ingreso, del padrón actual ni del importe de un concepto. Una antigüedad no capturada no equivale a cero. El informe no homologa por sí solo las reglas municipales ni incorpora variables que el motor todavía no conserva.

## Consulta, invalidación y capacidad

Se reutilizan exclusivamente GET de las fachadas privadas de cierre y liquidación, con permisos existentes. Las otras vistas no solicitan las capturas adicionales. No hay API nueva, migración, guardado, cambio de clave/cuerpo pendiente, cálculo, anulación, confirmación, imputación o pago.

Cada descarga reautoriza y consulta nuevamente el censo completo y sus capturas, compara el histórico y las huellas originales y cancela si cambió la fuente, selección, cuenta, permisos o visibilidad. Se retiran datos al ocultar/cerrar la página o cambiar tarea; una respuesta tardía no repone resultados. No se persiste información nominal en localStorage.

Se mantienen doce meses, mil grupos, 256 MiB acumulados y límites de las APIs existentes. El detalle de variables tiene un límite global explícito de 250.000 filas; un exceso rechaza todo el conjunto, sin recortar, dividir ni eludirlo mediante filtros. Un período sin grupos cerrados conserva su ausencia de resultados. Fuentes de las variables y Fuentes y cobertura siguen siendo informes distintos.

## Verificación y alcance pendiente

Regresiones sintéticas: 61 legajos, 122 entradas resumidas y 427 relaciones completas; antigüedad capturada sin uso y efectivamente usada; null/zero/precisión; fecha declarada y anterior sin fecha; captura histórica fuera del listado actual; dos meses/tipos; rangos/selección/jurisdicción; fuentes ausentes o alteradas; CSV seguro y límite global. El navegador usa producto construido, handlers y SQL reales en bases locales de prueba, con descargas completas, móvil, respuesta alterada/tardía y revocación SQL. Ninguna operación de negocio se realiza sobre la base municipal.

Implementación, pruebas y publicación se acreditan por separado en el resultado privado de este incremento. Continúan pendientes la homologación municipal de las variables y fórmulas, el flujo completo con el padrón propio real, aceptación de Noelia, otras salidas de M8 y su circuito institucional. No se declara el módulo 8 íntegro ni independencia operativa completa de GRH. El objetivo integral de los diez módulos, actores y relojes permanece activo.
