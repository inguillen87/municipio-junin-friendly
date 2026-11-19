# Octubre, convenio 1: qué falta cargar y en qué orden

19/11/2026. Para liquidaciones y para quien acompañe la carga. No tiene datos de personas: los valores están en archivos privados que quedaron en la PC de Marcelo, en la carpeta «MuniControl-octubre-privado» de Descargas, y no se publican.

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
| 1 | Novedades del mes: 304 filas, 74 personas, 26 conceptos | Novedades → Cargar novedades → planilla pegada, con la columna de concepto (candidato 8) | Marcelo o liquidaciones | `novedades-octubre-2026-convenio1-para-pegar` (legajo, concepto, unidades, importe) |
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

Se compararon las fórmulas de GRH de cada convenio con las del convenio 1, sólo para los conceptos que GRH liquidó de verdad en la mensual de octubre (fórmula, unidades, condición y tipos de liquidación; es una primera lectura, no revisa acumuladores):

| Convenio | Personas en octubre | Conceptos liquidados | Iguales al convenio 1 | Distintos | Sin regla en el 1 |
|---|---|---|---|---|---|
| 6 · Personal interino | 295 | 57 | 51 | 6 | 0 |
| 5 · Jardines maternales | 164 | 37 | 15 | 16 | 6 |
| 4 · Personal temporario | 160 | 48 | 39 | 9 | 0 |
| 1 · Planta permanente | 79 | 55 | 55 | — | — |
| 13 · Horas cátedra cultura | 54 | 30 | 12 | 17 | 1 |
| 12 · Horas cátedra deportes | 43 | 27 | 12 | 14 | 1 |
| 2 · Funcionarios | 23 | 32 | 24 | 7 | 1 |
| 11 · HCD secretarios | 12 | 22 | 14 | 7 | 1 |
| 7 · Concejales | 10 | 23 | 14 | 7 | 2 |
| 14 · Orquestas infantiles | 4 | 17 | 7 | 8 | 2 |

**El 6 y el 4 son casi el convenio 1.** En la liquidación mensual, lo que cambia de verdad es:

- Convenio 6: la base de mayor dedicación (44) suma un concepto más (el 59) y el embargo alimentario (670) se toma por cantidad en lugar de importe. Los otros cuatro «distintos» sólo difieren en qué tipos de liquidación alcanzan, y la mensual está en todos.
- Convenio 4: lo mismo en el 44; la antigüedad (48) tiene otra condición; el 649 se toma por importe y el 670 sale de un dato del legajo. Los otros cinco sólo difieren en los tipos.

Entre el 1, el 6 y el 4 son 534 de las 844 personas con recibo en octubre. La aplicación ya tiene «copiar reglas de otro convenio»: el camino corto es copiar el 1 y tocar esas dos o cuatro reglas. Los convenios docentes (5, 12, 13 y 14) son otra familia de fórmulas y van aparte.

Las novedades de octubre de los otros nueve convenios ya están preparadas en la misma carpeta, un archivo por convenio listo para pegar (2.236 filas en total; el 6 tiene 1.062 y el 4, 479) y, aparte, sus forzadas (342). Las fijas vigentes de 80, 56 y 57 del resto son 97.
