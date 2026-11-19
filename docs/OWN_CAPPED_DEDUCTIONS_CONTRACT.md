# Descuentos con límites y efectos conservados

## Alcance

`own-capped-deductions.v1` es una capacidad optativa para programas propios con cantidades y totales oficiales V4/V5. No activa un concepto municipal. Un programa histórico sin estos campos conserva su cálculo, forma de salida y cierre anteriores.

El programa declara `cappedDeductionsVersion` y `cappedDeductionPolicies`. Cada política tiene identidad, convenio, tipo mensual, inicio, fin opcional, sucesión y referencia de la decisión. Una sucesión conserva la política anterior byte a byte y cita su identidad y huella. La vigencia puede abarcar años; no existe una excepción para octubre de 2026.

La política declara dos bases monetarias y sus etapas, una reserva mediante una regla monetaria propia, todos los descuentos anteriores al tramo y la secuencia completa del tramo. No hay valores predeterminados para reserva, saldo inicial, etapa de una referencia ni desempate entre conceptos. El revisor ordinario del programa ve esos campos y las fuentes incompatibles en la misma revisión.

## Orden y fórmulas

Cada posición es `capped` o `existing_deduction`. La primera declara auxiliares distintos para pedido, disponible monetario, disponible oficial y límite; también método, etapa del efecto, huella de origen y referencia. La segunda conserva su fórmula y sólo participa en la secuencia de saldos.

La validación estructural exige que cada miembro del total oficial 996 aparezca exactamente una vez como descuento anterior o posición del tramo. Las dos bases deben depender de los descuentos anteriores y no de una posición del tramo. Se verifica el árbol de expresión real, además del orden declarado. Pedidos, reservas y descuentos existentes no pueden leer una posición posterior ni crear un ciclo.

Para cada posición, el disponible monetario siguiente descuenta la **línea redondeada** anterior. El disponible oficial siguiente descuenta el **importe exacto** anterior. Ambos importes y sus diferencias quedan conservados.

El límite es el piso a centavos de `max(min(disponible monetario, disponible oficial) − reserva, 0)`. El piso se expresa con operaciones existentes y redondeo `half_up` de dos decimales; no amplía el contrato general de precisión. El importe aplicado es el mínimo entre pedido y límite. Pedido, reserva e importe aplicado deben ser no negativos. Si el saldo ya resulta insuficiente, el descuento no puede agravar esa insuficiencia.

Un pedido subcentavo no puede consumir silenciosamente la reserva: el piso impide que el redondeo de la línea exceda el límite, y la segunda cadena conserva el consumo exacto aunque la línea sea cero. El resultado compara los saldos finales con los netos reales de ambas etapas y conserva la diferencia de redondeo del pedido, aplicado, no aplicado y saldo.

## Límite de los descuentos existentes

Dentro de esta política, **todo `existing_deduction` debe ser no negativo**. La capacidad independiente `own-monthly-forced-passthrough.v2` admite un importe negativo, pero eso no habilita un 649 negativo dentro de un tramo con esta política. La combinación se rechaza. No se transforma el negativo en cero ni se cambia de posición. Una futura política que admita reintegros necesita su propia semántica explícita.

Un descuento existente tampoco se recorta automáticamente: conserva su importe y el cálculo falla si consume la reserva declarada. La propuesta debe establecer un orden compatible, incluyendo cualquier concepto que comparta prioridad en otra fuente.

## Efectos y trazabilidad

Cada efecto identifica contrato, política y huella, posición, concepto, pedido, disponible, reserva, límite, aplicado, no aplicado y saldos posteriores. Conserva valores racionales exactos, importes de línea y diferencias de redondeo.

El método 29 registra una asignación equivalente al importe aplicado, incluida una asignación cero; el nombre de destino conservado es `L[133]`. El método 27 registra por concepto la contribución no aplicada, con destino `DCTONEFE`. Son efectos del cálculo actual con `debtWritten:false`. No acreditan un saldo histórico, no escriben deuda, no modifican condiciones salariales y no ejecutan un pago.

La captura incluye política, sucesión, clausura completa de reglas y huellas. Los finalizadores verifican ese material contra el programa y las fuentes inmutables. El resultado, cierre y lector de recibos conservan y vuelven a comprobar los efectos; eliminar una asignación cero, cambiar un importe, ocultar una diferencia de redondeo o agregar una escritura de deuda invalida el resultado.

## Fuentes incompatibles

`incompatibleSourceCodes` es una lista explícita de la política; puede estar vacía. No hay códigos municipales incorporados al núcleo. La captura y los finalizadores comprueban las novedades mensuales importadas, las nativas aprobadas y la exportación fija completa para la población seleccionada, antes del consumo por bindings. Un evento incompatible bloquea incluso con importe cero y aunque no exista binding para su código.

La ausencia sólo se comprueba con ambos canales mensuales y el canal fijo completos, con sus identidades y referencias aprobadas. Esta guarda no produce un testigo monetario cero, no resuelve una fórmula ausente y no cambia `source.complete`.

## Instalación y revisión

El orden de composición es **234 → 236 → 235**, aunque el número de esta migración sea menor. La migración 235 exige las preimágenes de 236, incluido su resolver temporal, y rechaza una base anterior. Su SQL semántico debe formar parte del instalador con los pines de disponibilidad y atestación recompuestos. No se debe ejecutar como una migración independiente de publicación.

La capacidad no añade tablas, roles, aprobaciones operativas ni revisores. La propuesta de programa y su aprobación usan el circuito existente con quien prepara y una persona revisora distinta.

Los ejemplos y pruebas de 608, 630 y 649 son sintéticos. No representan una decisión municipal ni una reconstrucción probada del ejecutor GRH. La declaración de que 608 y 630 no se usan actualmente se trata en el alcance del programa municipal, por separado de esta capacidad del producto.
