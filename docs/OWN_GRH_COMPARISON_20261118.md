# Comparador MuniControl contra GRH (18/11/2026)

Rama `claude/own-grh-comparison-20261118`. Compara una corrida propia completa con la liquidación GRH
incorporada del mismo período y tipo, por legajo y concepto y por totales de legajo. Es una consulta:
no recalcula fórmulas, no redondea, no confirma ni paga nada.

## Piezas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Modelo | `assets/own-grh-comparison-model.js` | `ownGrhComparison(captura, grh, unión)` y `grhStatementLines(grh)` |
| Lectura GRH | `scripts/migrations/242-own-grh-statement-lines.sql` | `own_grh_statement_lines_v1`: legajo de origen y renglones GRH de un conjunto incorporado |
| Fachada | `lib/internal-own-grh-statement-lines.js` | `/api/internal-data?resource=owngrhstatementlines&datasetId=…` |
| Pruebas | `tests/own-grh-comparison.test.js` | sintéticas, sin personas reales |

## Reglas

- **Unión declarada**: `{own:'employeeNumber', grh:'legajo'}`. Texto exacto: `01001` y `1001` son legajos
  distintos. Un legajo repetido en cualquiera de los lados impide comparar.
- **Mismo período y tipo**: mensual `M`, primera quincena `P`, aguinaldo `S`, vacaciones `V`, final `F`,
  otra `O`. «Suplementaria» no tiene letra GRH declarada y no se compara.
- **Diferencia = MuniControl menos GRH**.
- **Naturaleza**: acumulador GRH 993 remunerativo, 994 y 995 no remunerativo, 996 retención, 990 aporte
  patronal (la misma correspondencia que `own-payroll-official-totals.js`). Un renglón GRH sin acumulador,
  un auxiliar propio o una unidad propia distinta de pesos: **no evaluable**, con ambos importes visibles.
- **Totales por legajo**: Bruto = 993+994+995; Retenciones = 996; Neto calculado = 999; Aportes
  patronales = 990.
- **Redondeo**: sólo en totales y en retenciones (ambos lados 996), una diferencia exacta de 1 a 5
  centavos se rotula «Diferencia de redondeo (hasta 5 centavos)». Sigue visible con su importe y no se
  cuenta como «Sin diferencia». 6 centavos o más es «Diferencia».
- **Ausencias**: «Sólo en MuniControl» o «Sólo en GRH», nunca cero. Un totalizador simple que el recibo
  no trae es «Sólo en MuniControl»; uno presente sin importe, o un bruto con alguna parte ausente, es
  «no evaluable».
- **Sin recorte**: si la comparación completa (filas reales después de unir) supera 250.000 filas, no se
  compara. Un recibo GRH tiene a lo sumo 1.000 renglones, el CHECK de la 048.
- **Códigos GRH canónicos**: sin ceros iniciales; `0993` se rechaza por ser un alias ambiguo.

## Instalación (Codex)

La 242 es aditiva y exige la 048 (`payroll_detail_*`), la 007 (sesión de lectura) y el rol
`municontrol_actions_runtime_app`. Crea la tabla de auditoría `own_grh_statement_lines_read_event`
(inmutable) y la función con `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE` sólo al rol de ejecución.
Capacidades: `payroll.read` + `workforce.employee.read`, las mismas del detalle por legajo. No devuelve
nombre, documento ni contrato. Probada en PostgreSQL 16 con stubs: lectura completa, conjunto ajeno
(`found:false`), sin capacidad, conjunto incompleto, auditoría inmutable y reinstalación rechazada.
