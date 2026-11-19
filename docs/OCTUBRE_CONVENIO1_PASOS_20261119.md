# Octubre, convenio 1: qué falta cargar y en qué orden

19/11/2026. Para liquidaciones y para quien acompañe la carga. No tiene datos de personas: los valores están en cinco archivos privados que quedaron en la PC de Marcelo y no se publican.

## Dónde estamos

El programa de reglas de octubre del convenio 1 está aprobado en la base operativa (revisión 2). En una copia de ensayo se cargó todo lo que sigue, con las funciones reales y siempre una cuenta preparando y otra aprobando, y el resultado se comparó contra la liquidación de GRH de octubre:

| | Celdas persona × concepto que coinciden (de 1.329) | Personas con todos sus conceptos iguales (de 79) |
|---|---|---|
| Sólo con el programa aprobado | 340 | 0 |
| Más las novedades del mes | 907 | 13 |
| Más las novedades fijas 80, 56 y 57 | 1.119 | 18 |
| Más las cantidades familiares | **1.251** | **53** |

«Coincide» quiere decir igual al centavo o igual con la precisión de GRH: GRH guarda cada importe en precisión simple y arriba de $131.072 no puede dar todos los centavos. De las 78 celdas que quedan, 19 son diferencias de uno o dos centavos por ese mismo motivo en importes que GRH calcula en cadena, y el resto viene de 14 novedades que GRH marca «forzadas» y que las reglas todavía no saben aplicar.

## Los pasos, en la base operativa

Cada carga la prepara una persona y la aprueba otra. Marcelo puede preparar novedades y aprobar; no puede preparar parámetros ni declaraciones (eso pide un vínculo municipal).

| # | Qué | Dónde | Quién prepara | Archivo de apoyo |
|---|---|---|---|---|
| 1 | Novedades del mes: 304 filas, 74 personas, 26 conceptos | Novedades → Cargar novedades → planilla pegada, con la columna de concepto (candidato 8) | Marcelo o liquidaciones | `novedades-octubre-2026-convenio1-para-importar` |
| 2 | Novedades fijas de responsabilidad jerárquica (80), cajeros (56) y sistemas (57): 24 | Novedades → Novedades fijas | Marcelo o liquidaciones | `novedades-fijas-80-56-57-convenio1` |
| 3 | Declaración familiar con cantidades: 50 personas con cargas, 31 en cero | Asignaciones familiares (admite la planilla completa en CSV) | Liquidaciones | `familia-octubre-2026-convenio1` |
| 4 | Condiciones salariales propias, antigüedad de 5 contratos y antigüedad parcial | Reglas y parámetros | Liquidaciones | — |
| 5 | Calcular octubre, convenio 1 | Liquidar el período → Calcular | Marcelo o liquidaciones | — |

Dos aclaraciones sobre los archivos:

- **El de familia es una referencia, no la declaración.** Dice cuántas cargas liquidó GRH en octubre para cada legajo (importe de cada concepto dividido por su tarifa; las 104 líneas dieron división exacta). La pantalla pide que las cantidades salgan de una constancia y no de importes históricos: sirve para cotejar contra las declaraciones juradas, no para reemplazarlas. La región es la 1; el promedio del semestre anterior no viene en el respaldo y hay que informarlo.
- **Las 14 forzadas van aparte** (`novedades-octubre-2026-convenio1-forzadas-pendientes`): embargo alimentario con importe (4) y diez que fuerzan a cero un concepto calculado (básico 3, concepto 107 2, trabajo riesgoso 2, cónyuge, presentismo y seguro por hijo). Si se cargan hoy, el cálculo se frena con «las reglas no dicen cómo aplicarla». Falta decidir la regla: el embargo puede entrar como los otros dos embargos que ya tienen política; forzar a cero un concepto calculado necesita una definición (participación del período para quien no cobra básico, o una política expresa de supresión con doble revisión).

## Qué no hace falta

**No hay que corregir el maestro salarial.** Coincide con la tabla de escalas de GRH en las nueve categorías del convenio. La diferencia de centavos del básico es de GRH.

## Lo que sigue después del convenio 1

Los otros once convenios todavía no tienen todas sus reglas (faltan 15). Las novedades de octubre del resto de las personas son 2.609 filas más, y las fijas vigentes de 80, 56 y 57 son 98 más.
