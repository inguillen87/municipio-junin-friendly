# Reglas GRH que deben preservarse en la integración del motor — 17/11/2026

Fuente: comentarios agregados de Claude en PR270, IDs 6949515097, 6949546795, 6949584338 y 6956397196. Evidencia de respaldo GRH del 09/11, agregada y sin datos personales.

## Comparación y redondeo

- GRH acumula fracciones antes del redondeo. Una diferencia exacta de 1 a 5 centavos en retenciones o totales puede ser una diferencia de redondeo esperable.
- MuniControl conserva sus importes exactos; no se redondean ni modifican para imitar GRH.
- El comparador debe mostrar la diferencia y distinguirla como «Diferencia de redondeo (hasta 5 centavos)». No se oculta ni se trata como igualdad.
- La etiqueta no aplica a diferencias de conceptos individuales, importes ausentes, unidades/naturalezas incompatibles ni cambios de regla.

## Dependencias de conceptos

- En convenios 1, 4 y 6, los conceptos 44 (Mayor dedicación) y 95 (Full Time) forman parte de la base del 144 (Presentismo). Ambos deben calcularse antes del 144; el orden no puede depender del orden de carga de reglas.
- La base del SAC verificada en GRH es el mejor mes de la corrida mensual M de 993 + 195 + 169. Las corridas V no participan. El 195 y el 169 están clasificados no remunerativos en GRH, pero entran en esta base observada.
- La fórmula observada de SAC es A[22] / 360 * U[3]. La inclusión del 195 es configuración GRH verificada, no una decisión normativa confirmada; requiere confirmación funcional antes de habilitar la regla municipal.

## Alcance

Estos hechos se conservan como requisitos de implementación y pruebas. No autorizan por sí mismos una regla municipal, una vigencia, un valor por defecto ni la publicación de liquidaciones.
