# Recibo propio v6 — contrato de entrega

**Estado: diseño para implementación; no publicado.** Base de revisión:
`3d59c5278151de0df4cd08aa73a0c8e833ab5d35`. Responde al
[pedido de Claude 6842714952](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6842714952).
Primera entrega: unidades por concepto, ingreso, clase/cargo y destino bancario enmascarado.

## 1. Hechos comprobados y decisión

Los lectores actuales aceptan snapshots v1–v5 con claves exactas. Los registros oficiales v4/v5
**ya conservan `quantities`**, con unidad, valor racional, etapa, redondeo y fuente; `concepts[]`
no proyecta esa cantidad. El capture puede conservar `sourceInventory.periodClassifications`,
con ingreso y categoría del período; ese componente no garantiza cargo, estructura ni etiquetas.
Existe `own-bank-accounts.v1`, con revisión aprobada, vigencia, contrato y canal declarado.
Una cuenta aprobada no acredita depósito. Fuentes: [lector de recibos](../assets/own-payroll-receipt-model.js),
[evidencia oficial](../assets/own-payroll-official-receipt-model.js),
[encuadre capturado](../assets/own-payroll-period-classification.js) y
[cuentas](../assets/own-bank-accounts-model.js).

**Decisión:** nueva versión `own-receipt-snapshot.v6`, conservando la evidencia económica v4/v5
y sus selectores. Agregar a cada registro oficial `printFacts`, sin cambiar importes, totales,
`concepts[]`, cantidades originales ni renglones omitidos. V6 no renombra la versión del cálculo:
`inputVersion`/`resultVersion` siguen siendo los del resultado original.

## 2. Forma cerrada y origen de los cuatro campos

```text
printFacts = {
  version: "own-receipt-print-facts.v1", frozenAt,
  units: [{rowKey, quantity}],
  employmentStartDate, classification, paymentDestination,
  sources: {runId, payloadSha256, inputSha256, resultSha256,
            employmentEvidenceSha256, bankConfigurationVersion, bankApprovalId}
}
```

| Campo | Forma y fuente obligatoria |
| --- | --- |
| `units[]` | Una entrada por concepto visible, en el mismo orden. `rowKey=contractId + ':concept:' + code`. `quantity` es la copia exacta de su entrada verificada en `record.quantities`, o `null` si el cálculo no la produjo. Se conserva su `unit`, `stage`, `exactValue`, `value`, `decimalValue`, redondeo y procedencia; no se usa la unidad monetaria del renglón como unidad de cantidad. |
| `employmentStartDate` | Fecha civil `YYYY-MM-DD` o `null`. Sale del `startDate` del encuadre **conservado en esa corrida** y ligado al mismo contrato/token. Nunca de `registeredAt`, corte del respaldo, fecha de adopción o consulta del legajo actual. |
| `classification` | `{categoryCode, categoryLabel, jobTitle, positionStructure}`; cada valor es texto congelado o `null`. Códigos y etiquetas deben pertenecer a la evidencia histórica de esa corrida. `categoryCode` no se convierte en puntos ni clase presupuestaria por inferencia. Cargo/estructura sin evidencia capturada quedan nulos. |
| `paymentDestination` | `null` o `{bankLabel, accountType, accountNumberMasked, currency, referenceDate}`. Se selecciona una sola cuenta aprobada del mismo contrato, `enabled`, canal explícito `bank_payroll`, vigente en la fecha declarada `params.paymentDate`. Se congelan banco/tipo/moneda exactos y número enmascarado antes de guardar el recibo. Sin fecha, canal o cuenta aprobada disponible: `null`; cuentas múltiples o evidencia inválida: rechazo. |

`sources` vincula la proyección a la misma corrida y a sus hashes existentes. La huella de empleo
es la del componente congelado que respalda los campos; sin componente, es `null`. Los dos pins
bancarios son versión SHA-256 y UUID de aprobación, ambos nulos si no hay destino. Nunca se incluye
en esta evidencia el conjunto de cuentas, el CBU completo ni el número sin máscara.

Para cantidades exactas se imprime el decimal sólo si su expansión es finita y exacta; de otro modo
se conserva la fracción o se utiliza una política de presentación explícitamente versionada.
Una cantidad ausente se muestra sin valor; no se inventa `1`, `0`, días, años ni porcentajes desde
el importe. Las cantidades redondeadas usan el `decimalValue` ya probado por la corrida.
El número de cuenta conserva como máximo sus últimos cuatro caracteres, ocultando todos los demás;
si tiene cuatro o menos, se oculta completo. Un número no informado sigue siendo `null`, sin derivarlo del CBU.

## 3. Congelación, validación y permisos

Los tres primeros campos se proyectan exclusivamente desde el capture/resultado sellado.
Si una captura antigua no tiene un dato, permanece nulo; para capturas futuras deberá ampliarse
explícitamente el contrato de captura con su fuente histórica. No se completa con el catálogo o
el empleo actual al preparar, abrir, aprobar o descargar un recibo.

La cuenta es la única fuente nueva consultada al preparar: revisión aprobada y verificable,
enmascarada en servidor y congelada junto al recibo. Una propuesta bancaria pendiente no sirve.
Antes de aprobar se revalidan las referencias y versiones revisadas; después, cambios bancarios o
de personal no reescriben la copia conservada. Se mantiene la reautorización y el control vigente
de cierre/reapertura al consultar. Un pin inválido o una asociación ambigua rechaza el conjunto;
la ausencia documental representada por `null` no equivale a corrupción.

El hash del snapshot incluye `printFacts`. SQL, API, modelo, PDF y vista del agente verifican la
misma forma, contrato, hashes, completitud y relación con el selector de impresión. Revalidar la
integridad no permite añadir una fila omitida ni recalcular totales.

Se conservan `OWN_RECEIPT_READ`, `payroll.receipt.prepare` y `payroll.receipt.approve` y su revisión
independiente. La consulta propia sigue con `actions.read` + `payroll.receipt.self.read` y contrato
resuelto por vínculo IAM, nunca por un identificador libre del navegador. La proyección enmascarada
no concede acceso al registro bancario; modificarlo sigue requiriendo sus capacidades de parámetros.
No se crean ni asignan permisos por este contrato.

## 4. Compatibilidad y aceptación

- V1–v5 permanecen byte a byte, con sus validadores; no se agregan campos a originales guardados.
  V6 se habilita sólo cuando productor SQL y lectores API/UI/PDF admitan expresamente su forma.
  Versión desconocida o mezcla de campos: rechazo, sin quitar campos para pasar `salaryExact`.
- La leyenda bancaria será **«Cuenta de acreditación declarada»**. Se mantienen
  `paymentDateBasis='declared'`, `paymentExecuted=false`, `payrollPosted=false` y
  `signatureState='pending'`; no imprimir «han sido depositados» como hecho.
- Gates: fuentes congeladas y hashes; cantidad exacta/redondeada/ausente; cuenta pendiente,
  fuera de vigencia o ambigua; cambio de datos actuales sin cambio del PDF histórico; self sin
  datos de otros contratos ni cuenta completa; conservación de totales y omisiones; regresión v1–v5.
- «Personal», días globales, expediente y número de bono quedan fuera de esta primera entrega.
  Un UUID de emisión no se presenta como correlativo municipal: ese correlativo requiere su
  registro explícito. No se inventan cantidades ni datos bancarios para completar rótulos.

Fuentes de validación adicionales: [cantidades oficiales](../assets/own-payroll-official-snapshot-model.js),
[API](../api/internal-own-payroll-receipts.js) y [circuito de emisión](MOTOR_PROPIO_M9_RECIBOS_20261005.md).
