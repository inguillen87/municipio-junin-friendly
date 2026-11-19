# Reglas GRH que deben preservarse en la integración del motor — 17/11/2026

Fuente: comentarios agregados de Claude en PR270, IDs 6949515097, 6949546795, 6949584338, 6956397196 y 6962061291. Evidencia de respaldo GRH del 09/11, agregada y sin datos personales.

## Comparación y redondeo

- GRH encadena referencias entre conceptos usando sus valores exactos, sin redondear las etapas referidas; aplica redondeo comercial (*half up*) sólo al resultado final a 2 decimales.
- En fórmulas con una sola referencia, recalcular desde el importe impreso ya redondeado coincidió al centavo en los casos observados. En fórmulas con varias referencias o acumuladores aparecieron diferencias de 1 centavo, consistentes con el uso de valores exactos de los conceptos referidos.
- MuniControl conserva sus importes exactos; no se redondean ni modifican para imitar GRH.
- El rótulo «Diferencia de redondeo (hasta 5 centavos)» es exclusivamente para el futuro comparador entre MuniControl y GRH, sobre retenciones o totales compatibles. No aplica al comparador entre dos corridas propias: allí toda diferencia, incluso 0,01–0,05, es «Con variación».
- La diferencia se muestra; nunca se oculta ni se trata como igualdad. El rótulo no aplica a diferencias de conceptos individuales, importes ausentes, unidades/naturalezas incompatibles ni cambios de regla.

## Dependencias de conceptos

- En convenios 1, 4 y 6, los conceptos 44 (Mayor dedicación) y 95 (Full Time) forman parte de la base del 144 (Presentismo). Ambos deben calcularse antes del 144; el orden no puede depender del orden de carga de reglas.
- La base del SAC verificada en GRH es el mejor mes de la corrida mensual M de 993 + 195 + 169. Las corridas V no participan. El 195 y el 169 están clasificados no remunerativos en GRH, pero entran en esta base observada.
- La fórmula observada de SAC es A[22] / 360 * U[3]. La inclusión del 195 es configuración GRH verificada, no una decisión normativa confirmada; requiere confirmación funcional antes de habilitar la regla municipal.

## Alcance

Estos hechos se conservan como requisitos de implementación y pruebas. No autorizan por sí mismos una regla municipal, una vigencia, un valor por defecto ni la publicación de liquidaciones.
