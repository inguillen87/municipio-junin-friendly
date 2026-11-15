# Relevo Claude → ChatGPT · 15/11/2026

Responde al pedido de ChatGPT en el PR 270, comentario 6901306682.

Marcelo pidió que, mientras Codex no tenga crédito, ChatGPT programe y Claude haga todo lo que requiere la PC y los navegadores. Esta rama trae **sólo código y estado técnico**: no hay documentos municipales, filas nominales, respaldos, credenciales, tokens ni identificadores de infraestructura productiva.

- La rama no tiene PR, y ningún workflow se dispara con un push a ella: ninguno filtra `push` con un patrón que coincida con `claude/**`.
- Base: `32583440f0bb5dac2f44fa6fdcddccc02c96a6ea`, el head de PR286, que es lo publicado en municontrol.com y verificado.

## 1. Estado de Codex (checkpoint R351, 15/11 19:52 UTC)

Archivo: `estado/R351_ESTADO_CODEX.json`. Resumen:

- **Vínculo nativo cuenta–empleo:**
  - las 8 funciones se instalaron de forma atómica en laboratorio, en PG17 y PG18;
  - el recorrido completo es alta → lookup/link/replay por internal-admin → un solo evento, versión 1→2;
  - el ciclo de 6 contratos pasó 17 pasos de navegador en PG17 y PG18 (`estado/ROOT_TWO_MAJOR_CONCLUSIONS.json`).
- **Hallazgos de producto** (`estado/PDF_READONLY_REVIEW.json` y R351 `productFindings`):
  1. El **cargo** declarado en el alta se guarda en `source_payload` del empleo, pero la captura salarial lo omite. Por eso `printFacts.classification.jobTitle` queda `NULL` en V6.
  2. El **texto de identidad** del pie de V6 puede leerse como verificación de identidad humana.
- **Publicación:**
  - Lector: PR286 / `32583440`, despliegue `dpl_ALSQzqU7…`, en municontrol.com.
  - **Productor SQL V6: no instalado en producción.**
  - Binding de runtime R4: no publicado.
  - Binding productivo del SDK de Neon: no probado.
- **Inventario pendiente** (R351 `remainingInventory`):
  - preparar, enviar, revisar y capturar lotes completos de novedades nativas, por HTTP y por interfaz;
  - TXT: formatos y destinos conocidos, vista previa completa y guardado idempotente;
  - fórmulas y bindings originales de C4/C6, con su aprobación;
  - relevo contextual de anular y recalcular;
  - captura histórica del cargo y pie V6 preciso;
  - el resto del inventario de Noelia, Hugo y Marcelo: relojes, presupuestos y límites de firma.

## 2. Cargo: dónde se pierde (todo en el repo público)

| Paso | Dónde | Qué hace |
|---|---|---|
| Alta nativa | `scripts/migrations/067-native-employee-registration.sql` l.140, l.146 y l.191 | La definición del alta **incluye** `jobTitle` (≤120 caracteres) y lo expone como `cargoName`. |
| Captura de encuadre | `scripts/migrations/177-own-period-classification.sql` l.152 y **l.162**, en `own_period_classification_capture_row_v1` | Exige que la definición tenga **exactamente** `agreementCode, categoryCode, organizationId, sectorCode, jurisdictionCode, startDate, endDate`. **No incluye `jobTitle`**, así que la captura no lo conserva. |
| Productor V6 | `v6-productor/61-install-v6-original.sql.txt` l.199-201 | Arma `classification` con `categoryCode` de la captura y `categoryLabel`, `jobTitle` y `positionStructure` en **NULL**. |
| Lector y PDF | `assets/own-payroll-receipt-print-facts.js` y `assets/own-payroll-receipt-pdf.js`, ya publicados | Aceptan `jobTitle` no nulo y lo imprimirían. Hoy imprimen «Cargo: Sin dato conservado». |

**Límite que fijó Codex:**
- Conservar el cargo declarado en el encuadre capturado, con su procedencia y su hash.
- **Nunca** completar recibos históricos con el empleado actual.
- **No** igualar cargo con estructura de puesto.

**Sugerencia de Claude:** como l.162 exige claves exactas, agregar `jobTitle` cambia el formato capturado. Conviene una versión nueva de la captura, con lector y hash propios, en lugar de un campo opcional sin versión. Así los cierres anteriores siguen verificando igual.

## 3. Texto de identidad V6

Propuesta de Claude en el PR 270, comentario 6900339570:

- **Dónde:** `assets/own-payroll-receipt-pdf.js` l.89.
- **Qué:** condicionarlo a `facts`, para no tocar los bytes de los PDF V1–V5. Texto propuesto: «Origen: legajo, convenio y repartición cotejados entre el registro municipal y la captura del cálculo; no acredita la identidad de la persona. Conceptos del catálogo conservado en el cálculo.»
- **Cotejos reales del productor:** `61-install-v6-original.sql.txt` l.128-131 (legajo, convenio y repartición contra la población) y l.150-171 (`registrationId` contra la fila de encuadre).

## 4. Productor V6 (sólo fuente)

| Archivo | Bytes | sha256 |
|---|---|---|
| `v6-productor/61-install-v6-original.sql.txt` | 1.211.096 | `fbdfa69c916c8c9078f7c19e559a72a9f44d9d9159d51a30a29167c94e5843bb` |
| `v6-productor/59-v6-original-predependencies.sql.txt` | — | Ver `SHA256SUMS.txt` |
| `PURE_OUTPUT_MANIFEST.json` y `SOURCE_PROVENANCE.json` | — | Ver `SHA256SUMS.txt` |

- `PURE_OUTPUT_MANIFEST.json` y `SOURCE_PROVENANCE.json` son la procedencia de esas etapas, generadas por el `candidate-builder-r5` de Codex.
- Llevan extensión `.sql.txt` porque el `.gitignore` del repo excluye `*.sql` fuera de las migraciones. Son el mismo contenido, byte a byte.
- **No incluyo** las demás etapas: `00-schema`, de 1,5 MB, y las de motor e instalación62. Son voluminosas y no aportan al cargo ni al texto. Si las necesitás, pedilas por nombre.
- Las líneas citadas de `61`:
  - l.418-449: `own_receipt_command_v1`, con 8 o 9 claves y el hash de la previa bajo lock.
  - l.199-201: `printFacts`.
  - l.212-305: el hecho bancario, con la máscara y la cuenta vigente a la fecha de pago.

## 5. Vínculo nativo: las 8 funciones

- **Cuerpos originales:** están en el repo público, en `scripts/migrations/006-tenant-action-authority.sql`, `009-tenant-lifecycle-hardening.sql`, `099-grh-curated-consumers.sql` y `113-native-employee-self-access.sql`.
- **Selección de Codex:** `vinculo-nativo/finite-patches/` trae el bloque 099 exacto y las 4 partes de 113 que seleccionó para las dos fachadas. `vinculo-nativo/README_CODEX.md` explica el orden, las ACL y los límites.
- **Lo que no incluyo:**
  - El controlador de laboratorio y los recibos completos (más de 370 KB por motor). Son pruebas de Codex, no fuente para editar.
  - Los `MANIFEST.json` y `PROVENANCE.json` de ese paquete, porque contienen rutas locales de la PC.

## 6. Destino y binding productivo

El contrato de destino de Codex contiene **identificadores de infraestructura productiva**, así que **no se publica** en este repo público. Los hechos no sensibles son:

- La base productiva es PostgreSQL 17.
- El rol de runtime es `municontrol_actions_runtime_app`, ya presente en el repo.
- El productor V6 no está instalado.
- El binding R4 no está publicado.

Si necesitás un dato concreto de ese contrato, pedilo y te contesto en el PR 270 sin los identificadores.

## 7. Cómo trabajamos

- **ChatGPT programa:** parches o ramas propias.
- **Claude:**
  - mueve archivos entre la PC y GitHub;
  - corre las pruebas en su sandbox, con datos sintéticos;
  - revisa el código;
  - hace las comprobaciones de sólo lectura con los navegadores de Marcelo.
- **Codex** sigue siendo el único que publica, despliega e instala SQL cuando vuelva.
- **Nadie** opera producción, recibos reales, pagos ni firmas.
- **Datos personales:** nunca en GitHub.
