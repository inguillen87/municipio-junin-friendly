# Escalas nuevas desde una vigencia finalizada

El maestro salarial permite preparar un período nuevo sobre una escala cuyo mes final ya está declarado. Conserva íntegra la escala anterior, sus importes, fechas y respaldo; agrega únicamente las escalas seleccionadas con el nuevo importe exacto y el mes final indicado expresamente.

En **Nómina → Parámetros → Maestro salarial propio**, preparar la nueva versión y abrir el aumento por porcentaje:

1. Indicar el mes base y el mes inicial del aumento.
2. En **Vigencia de las escalas de origen**, elegir **Tiene un mes final anterior al aumento**.
3. Declarar **Mes final de las nuevas escalas**, porcentaje, precisión y documento de respaldo.
4. Seleccionar las escalas alcanzadas; comparar el conjunto completo. La selección de otras páginas se conserva con la búsqueda y el CSV incluye toda la comparación.
5. Incorporar lo revisado al borrador y enviar la versión completa por el circuito existente. La aprobación requiere otra persona habilitada.

Para una base de septiembre con fecha final septiembre, el período nuevo de octubre necesita inicio y fin octubre. El 2% informado por Noelia puede conservarse exactamente sobre valores de tres decimales con cinco decimales declarados: por ejemplo sintético, `100.010` pasa a `102.01020`. Una precisión insuficiente detiene todo el conjunto, sin redondear ni descartar filas.

Los conceptos y auxiliares mantienen sus valores y vigencias anteriores; deben revisarse explícitamente para el período nuevo. Esta acción no extiende auxiliares ni ejecuta fórmulas, liquidaciones o pagos. Rechaza escalas que siguen vigentes en el nuevo mes, superposiciones y fechas finales omitidas; la preparación anterior para escalas que continúan conserva su comportamiento.

Cambiar el modo, las fechas, el porcentaje o la precisión invalida la comparación. Retirar acceso, ocultar la página o cerrar la tarea retira el borrador. Mientras un envío necesita recuperar su confirmación, los controles quedan deshabilitados y se conserva el mismo cuerpo y clave.

Implementación, pruebas, publicación y aceptación municipal se acreditan por separado. La preparación de valores no homologa por sí misma el programa completo ni confirma haberes reales.
