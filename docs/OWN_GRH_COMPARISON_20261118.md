# Comparador MuniControl contra GRH (18/11/2026)

Rama `claude/own-grh-comparison-20261118`. Compara una corrida propia completa con la liquidación GRH
incorporada del mismo período y tipo, por legajo y concepto y por totales de legajo. Es una consulta:
no recalcula fórmulas, no redondea, no confirma ni paga nada.

## Piezas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Modelo | `assets/own-grh-comparison-model.js` | `ownGrhComparison(captura, grh, unión)` y `grhStatementLines(grh)` |
| Lectura GRH | `scripts/migrations/242-own-grh-statement-lines.sql` | `own_grh_statement_lines_v1`: legajo de origen y renglones GRH de un conjunto incorporado |
| Fachada | `lib/internal-own-grh-statement-lines.js` | `/api/internal-data?resource=owngrhstatementlines&datasetId=…`, forma compacta `grh-statement-lines-compact.v1` que `grhStatementLinesExpand` lleva a `grh-statement-lines.v1` |
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
- **Totales sin datos en ningún lado**: un legajo sólo en GRH cuyo recibo no trae los totalizadores de un total no
  genera esa fila (no hay nada que mostrar); no se cuenta como «Sólo en MuniControl».
- **Descripción y unidad GRH** son informativas: pueden llegar vacías (la unidad, hasta 80 caracteres).
- **Tamaño**: la 242 envía el catálogo de conceptos una sola vez y cada renglón como `[código, importe, cantidad]`;
  con el máximo de la 048 (30.000 renglones) queda muy por debajo del límite de respuesta. Si aun así una respuesta
  supera 4 MB, la fachada responde 413 y no entrega una parte. La 242 lo detecta antes (texto jsonb mayor a 3.800.000
  bytes) y lo audita como `too_large`; `success` sólo se registra cuando la respuesta se entrega entera.
- **Fuentes de la 048 no canónicas**: la 048 admite importes con ceros iniciales (`0001.23`) y `-0.00`; la 242 los
  entrega en forma canónica sin cambiar el valor (`1.23`, `0.00`). Un **código** con ceros iniciales (`0993`) no se
  normaliza, porque `0993` y `993` serían ambiguos: la 242 lo detecta (también descripciones, unidades o acumuladores
  fuera de formato), audita `incompatible` y la fachada responde **422** con el motivo y sin datos.
- **Errores de configuración** (release o vínculo de origen sin certificar, rol de base) responden 503 con el mismo
  mapeo que el resto de las lecturas de nómina; no se presentan como un problema de sesión ni de permisos de la persona.

## Instalación (Codex)

La 242 es aditiva y exige la 048 (`payroll_detail_*`), la 007 (sesión de lectura) y el rol
`municontrol_actions_runtime_app`. Crea la tabla de auditoría `own_grh_statement_lines_read_event`
(inmutable) y la función con `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE` sólo al rol de ejecución.
Capacidades: `payroll.read` + `workforce.employee.read`, las mismas del detalle por legajo. No devuelve
nombre, documento ni contrato. Probada en PostgreSQL 16 con stubs: lectura completa, conjunto ajeno
(`found:false`), sin capacidad, conjunto incompleto, auditoría inmutable y reinstalación rechazada.
