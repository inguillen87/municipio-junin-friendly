# Cargo conservado en futuras capturas: candidato de fuente

Estado: lector, validadores y derivador puro de fuente implementados. La propuesta emitida incorpora dos validadores nuevos y deriva dos funciones existentes de originales exactos. **No es un instalador ni un cambio operativo; el SQL no fue ejecutado.** Base de programación: `ca0d04b786fe983ad73cc6ae8ec716af42829df2`.

## Problema y fuente recibida

El alta y sus correcciones guardan el cargo en `employment_contract.source_payload.employment.cargoName`. El encuadre económico del período conserva siete campos en la variante `current_own_registration`; no incluye cargo. La captura original 237 preserva ese contrato. El productor V6 recibido toma fecha de ingreso y categoría de ese encuadre y escribe `jobTitle:null` y `positionStructure:null`.

Fuente original recibida de Claude, rama `claude/relevo-chatgpt-20261115`, commit `e3f8075b44f6546c0f0dc69dfb6475e3822c1863`:

| Original | Huella SHA-256 |
| --- | --- |
| `v6-productor/61-install-v6-original.sql.txt`, 1.211.096 bytes | `fbdfa69c916c8c9078f7c19e559a72a9f44d9d9159d51a30a29167c94e5843bb` |
| `own_receipt_print_facts_v6_candidate_v1(jsonb,jsonb,jsonb,text)`, prosrc literal | `e0f475cdd2b451f1a89380f13b74e74fb7b2135cea911f61b1e459cd10e2bfe0` |
| `own_run_capture_v1(jsonb,jsonb,uuid,text)`, público237 y pin original61 | `60a62776902b1c5a0f07f03c99daf97e7565e934801e0be9b34400ef93ef3a03` |
| Definición completa extraída de captura237, incluidos firma, argumentos, retorno, lenguaje y configuración; 38.966 bytes | `006a0083d3a6e6a51cebb9810810316244fb84251ec6fff703666a200c616df3` |
| Identidad de captura en el literal histórico devuelto por ambas familias de original61 | `81e9be18db115cd6d9421118bde5b6f007a95923262e166624bc53b58892feef` |
| `own_period_classification_resolve_v1(jsonb,uuid,text)`, público177 y pin original61 | `2df0dd63f644841a154a0ff2d7817c895b0292faa5036ba166156a3b096175d9` |
| `own_period_classification_source_v1(jsonb,uuid,text)`, público230 y pin original61 | `e06cedeb8a5e04354f8707d9703d216b13cdff86e523603db189854f7643bb72` |

Estos originales permanecen intactos. No se modifica el contrato económico v1 ni se completan registros anteriores. La identidad histórica `81e9…` del literal de familia y el prosrc `60a6…` que comprueba el guard son evidencias distintas del original: el atestador comprueba la segunda y devuelve la primera, sin transformarla. El derivador fija ambas por separado; no las iguala ni actualiza los literales originales.

Los extractos de código original están en `scripts/candidates/originals/own-receipt-print-facts-v6.sql.txt` (10.196 bytes, SHA-256 `5a7a469c983d31caf7ed9b644ee6cf72f64d3051ce9e3356705d2d711625e1f6`) y `scripts/candidates/originals/receipt-v6-family-members.json` (13.372 bytes, SHA-256 `fdb2ed8c470c3cfd08ad9792a51d319683c970b9a01b99bfcff53257e4e4ac7f`). Cada extracto conserva literalmente el contenido del original y agrega un salto de línea terminal; no contiene datos municipales. El cuerpo del productor conserva su prosrc exacto `e0f475…`.

## Componente nuevo

`payload.sourceInventory.employmentPrintFacts` es opcional sólo por compatibilidad histórica. Si aparece, debe contener **toda** la población capturada:

| Campo | Contrato |
| --- | --- |
| `version` | `own-employment-print-capture.v1` |
| `period` | El mismo mes de `body.period` y `payload.period`. |
| `complete`, `total`, `rows` | `true`, cantidad exacta y conjunto denso completo, sin duplicar contratos ni registros. |
| `classificationsSha256` | SHA-256 de la serialización salarial canónica del componente `periodClassifications` completo. |
| Cada fila | `contractId`, `registrationId`, `identityToken`, `classificationRowSha256`, `basis`, `jobTitle`, `provenance`, sin otros campos. |

Cada fila se liga a la misma fila de clasificación por contrato, registro, token, base y hash íntegro. El lector verifica también el hash del payload completo. La ausencia de una fila, incluso la última fuera de una página de pantalla, invalida el componente entero.

### Cargo actual con autoridad temporal existente

Para `current_own_registration`, el candidato de captura vuelve a exigir el resultado exacto del resolver original. Ese resolver ya rechaza un registro posterior al mes y una corrección laboral aprobada desde el inicio del período. Bajo los locks originales, se conserva el valor exacto de `cargoName`, o `null` si no estaba informado.

La procedencia contiene `kind:current_own_contract_at_capture`, el campo exacto `source_payload.employment.cargoName`, `sourceVersion` y la procedencia completa del registro devuelta por `own_period_classification_source_v1`. Esta última conserva registro y request hash; si fue adopción, también propuesta, decisión, sello y paquete final. No se guarda una copia de la ficha completa ni se usa un nombre de estructura como cargo.

El cargo nuevo debe ser texto NFC sin controles, marcado ni espacios exteriores, de hasta 120 unidades UTF-16, o `null`. No se recorta ni se normaliza al leer. El SQL candidato enumera puntos de código para reproducir el contrato JS, sin depender de clases POSIX sensibles al locale. El helper original `own_receipt_text_v1` queda intacto: su `btrim` sólo elimina espacio ordinario y no basta para esta validación nueva.

### Matriz Unicode: JS comprobado, PostgreSQL pendiente

La matriz ejecutable está en `tests/fixtures/own-employment-print-unicode-synthetic.js`. Sus resultados JS se prueban contra el lector real; no se usa un mock que pretenda reproducir PostgreSQL. Claude debe ejecutar la misma matriz sobre el candidato compuesto en su laboratorio SQL.

| Clase de entrada | Resultado esperado |
| --- | --- |
| `null` | Admitido, sigue siendo desconocido. |
| Texto NFC de 1 a 120 unidades UTF-16 | Admitido sin cambios. |
| 60 caracteres suplementarios, cada uno de 2 unidades UTF-16 | Admitido; 61 se rechazan. |
| Texto vacío, no NFC o más de 120 unidades UTF-16 | Rechazado. |
| U+0000–001F, U+007F–009F, `<`, `>`, U+202A–202E o U+2066–2069 en cualquier posición | Rechazado. NUL y sustitutos aislados también son inválidos en la representación jsonb/text de PostgreSQL. |
| En cualquiera de los extremos: U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000 o U+FEFF | Rechazado, igual que `value !== value.trim()` en JS. |
| NBSP, FEFF y otros espacios Unicode NFC en el interior, sin controles prohibidos | Admitido: el contrato no los elimina ni los interpreta. U+2000 y U+2001 se rechazan incluso dentro del texto porque NFC los reemplazaría por U+2002 y U+2003. |
| U+180E y U+200B en los extremos | Admitido: no pertenecen al conjunto ECMAScript de `trim`; no se generaliza a «todos los invisibles». |

### Encuadre retroactivo aprobado

Para `approved_own_period_classification`, `jobTitle` es obligatoriamente `null` y la procedencia debe ser exactamente la del encuadre aprobado. Esa declaración v1 no declara un cargo histórico. La ficha actual no aporta autoridad para inventarlo. Una futura declaración explícita del cargo requerirá otro contrato aprobado; este candidato no lo introduce.

## Impresión V6

La propuesta compuesta deriva `own_receipt_print_facts_v6_candidate_v1` del original fijado: conserva sus comprobaciones de cálculo, cantidades, fechas, categoría y cuenta e incorpora una rama que sólo lee el componente congelado. No se cambia la llamada existente desde el constructor V6. Cuando el componente nuevo está ausente, la nueva variable de cargo permanece en `null` y la salida y huella de empleo siguen el recorrido original.

Con evidencia nueva válida, cambia únicamente `classification.jobTitle` y `sources.employmentEvidenceSha256`. La nueva huella es:

```text
SHA256(salarySerialized({
  version: "own-employment-print-evidence.v1",
  periodClassifications: <componente original completo>,
  employmentPrintFacts: <componente adicional completo>
}))
```

Sin el componente nuevo se mantiene el hash original de `periodClassifications`, o su `null` original. `categoryLabel` y `positionStructure` siguen con el valor original del productor. El lector V6 y el PDF existentes ya admiten cargo; no requieren consultar la ficha actual.

`ownReceiptEmploymentPrintProjection` y `verifyOwnReceiptEmploymentPrintFacts` permiten comprobar independientemente la proyección contra una captura completa. El segundo es un control adicional para el laboratorio; la consulta habitual del recibo conservado sigue usando su snapshot original.

## Fuente prospectiva reproducible y composición pendiente

`scripts/candidates/own-employment-print-facts-v1.source.sql.txt` conserva cuatro funciones de referencia para revisar separadamente procedencia, componente, captura y proyección. **No es la propuesta que se incorpora a la familia:** instalar esas cuatro funciones nuevas consumiría más capacidad que los dos espacios disponibles en official.

`scripts/lib/own-employment-print-candidate.mjs` deriva una propuesta con **sólo dos funciones nuevas**. Exige la huella del cuerpo y la definición completa de captura237, el archivo completo y cuerpo del productor V6 y el literal histórico de familias. Un cambio de firma, nombre de argumento, tipo de retorno, lenguaje, `SECURITY DEFINER`, `search_path`, `TimeZone` o cuerpo de la captura falla antes de emitir fuente. Los originales no se modifican.

| Definición emitida | Cambio prospectivo |
| --- | --- |
| `own_employment_print_provenance_candidate_v1(jsonb,jsonb)` | Validador nuevo de procedencia congelada. |
| `own_employment_print_component_candidate_v1(jsonb,jsonb,jsonb,text)` | Validador nuevo del componente completo, enlaces, hashes y cargo. |
| `own_run_capture_v1(jsonb,jsonb,uuid,text)` | Definición derivada del original237. Inserta el bloque de captura inmediatamente después de `periodClassifications` y `jurisdictions`, antes de los inventarios posteriores. No incorpora otro helper público. |
| `own_receipt_print_facts_v6_candidate_v1(jsonb,jsonb,jsonb,text)` | Definición derivada del productor original. Incorpora la rama de proyección antes del control bancario y mantiene su firma y consumidor. No incorpora el wrapper público de referencia. |

El bloque de captura revalida contexto autorizado, sesión, identidad, registro, encuadre y procedencia bajo locks `SHARE NOWAIT`. La derivación conserva el resto del cuerpo original: límites de respuesta, control de cierre, idempotencia y comprobaciones de actor. El retorno por reintento queda antes del bloque nuevo; no se completa una captura histórica ya guardada. Sólo una **captura nueva** obtiene el componente adicional.

La salida revisable está en `scripts/candidates/own-employment-print-facts-v1.derived.sql.txt`; su manifest contiguo enumera fuentes, SHA-256 de cada entrada, definición y cuerpo antes/después, huella de la salida y capacidad propuesta. Se regenera únicamente como texto con:

```sh
node scripts/build-own-employment-print-candidate.mjs
```

Ese programa sólo lee y escribe los archivos de fuente indicados. No se conecta, no ejecuta SQL ni genera atestadores. Ambas fuentes SQL contienen `BEGIN`, una excepción incondicional de documento fuente y `ROLLBACK`: la transacción queda abortada al intentar ejecutarlas. No son instaladores.

| Familia | Miembros originales del literal | Atestador agregado por provider | Validadores nuevos propuestos | Total propuesto | Límite original |
| --- | ---: | ---: | ---: | ---: | ---: |
| quantity | 29 | 1 | 2 | 32 | 64 |
| official | 61 | 1 | 2 | 64 | 64 |

Esta aritmética resuelve la cabida numérica para la propuesta de dos validadores. El manifest deja `attestationClosed:false`: no acredita todavía metadata, ACL, providers, aprobación ni cierre transitivo. No se excluye un miembro existente ni se eleva el límite.

## Dependencias que impiden declarar cerrado el SQL

1. **Atestadores y familias.** El original 61 fija el prosrc y metadatos de captura, resolver, fuente de clasificación, productor V6 y demás dependencias. `own_run_release_attest_c1_v1(text)` compara esa colección exacta; sus providers fijan a su vez el prosrc `e4cde8662c396377307675e03f6c62e64336a4fa991d04f5f0eaae144cf65c27` del attester. Derivar captura y productor exige una composición revisada de esa cadena. El constructor no cambia en esta propuesta. El derivador no genera ni modifica atestadores, providers, ACL o guardas; actualizar sólo un hash o permitir deriva no resuelve la dependencia.
2. **Cierre dentro de la capacidad.** La propuesta de dos validadores cabe numéricamente en 32/64 miembros, pero aún debe verificarse el cierre exacto de funciones y metadata. Si esa revisión exigiese otro miembro nuevo de official, la propuesta requeriría rediseño; no se puede omitir la dependencia ni aumentar el límite para hacerla pasar.
3. **Tarifas familiares: originales recibidos.** Claude entregó las cuatro definiciones originales en el [comentario 6901930877 de PR270](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6901930877). Se conservaron sin editar y sus huellas coinciden con los pins del original 61. Ya no falta el cuerpo nativo `3293635e…`. La revisión estática comprobó que estos cuatro cuerpos no leen directamente `sourceInventory` ni el hash del payload completo; el productor de hechos familiares reconstruye su versión con una lista cerrada de fuentes y período/registros. Añadir el componente hermano no cambia directamente esas derivaciones. Falta comprobar la cadena transitiva de atestaciones y la composición SQL; esto no demuestra invariancia de todos los hashes oficiales.
4. **Huellas frente a importes.** El payload de una captura nueva y la evidencia de impresión cambian por definición. Las pruebas puras demuestran igualdad del input/result económico en la fixture probada. La revisión de los cuatro originales y de los consumidores JS no encontró un acceso directo al componente nuevo desde los materiales económicos ni un cambio automático de `inputSha256` por reatestación. No se promete invariancia global de `inputSha256` o `resultSha256`: el cuerpo transitivo exacto de `public.own_run_family_input_verify_v1(jsonb,jsonb)` no está entre las fuentes recibidas y la cadena de composición no está cerrada. El atestador de original61 exige prosrc SHA-256 `611e54c2c5611530e8868a62e2acb6da0fb587fca9b60961baa0b91b242e43d8`, argumentos `payload jsonb, input_value jsonb`, retorno `void`, PL/pgSQL `IMMUTABLE SECURITY DEFINER`. Las capturas y recibos anteriores sí deben conservar todos sus bytes y hashes.
5. **Validación SQL pendiente.** No se ejecutó PostgreSQL, instalación, CI ni operación municipal. Sintaxis, tipos, locks, grants del candidato compuesto, recuperación y límites deben comprobarse por Claude en un laboratorio sintético nuevo con los originales exactos.

| Definición familiar recibida | SHA-256 del prosrc original |
| --- | --- |
| `own_run_family_tariff_native_capture_candidate_v2` | `3293635e299db1c74e23eedee7956e15d2814c0a220183f51994ab0a40359a4f` |
| `own_program_family_tariff_options_candidate_v2` | `2fb116b906af493958cd24e2e08643d74539a8bb74f0ff77c91922f8af388213` |
| `own_run_family_tariff_capture_candidate_v2` | `69f5f9d6387752d3d81f72e76cafa6557c9d42a2a3f3d772d283af8c7b6d0d94` |
| `own_run_family_expected_inputs_v1` | `67777cb9e158ee5734fd8078fdaa6fa36a1de4200cb0edd89e08938754ba5abd` |

## Pruebas puras disponibles

`tests/own-payroll-employment-print-facts.test.js` cubre población mixta completa, cargo/null/retroactivo, enlaces por contrato/registro/token/procedencia, hashes conjuntos y por fila, ausencia histórica, corrupción de la última fila, texto exacto, adopción y su sello, separación cargo/estructura, la matriz Unicode y conservación económica de la fixture. También verifica la barrera de la fuente de referencia y la ausencia de lectura de empleo actual en su proyección.

`tests/own-employment-print-candidate.test.js` comprueba las fuentes exactas, rechazo de deriva del header o cuerpo, separación de los dos pins originales de captura, dos altas y dos definiciones derivadas, posición del bloque, conservación del replay y controles originales, proyección sólo congelada y correspondencia exacta del archivo emitido y su manifest. Son pruebas de transformación de texto y contratos JS; no acreditan comportamiento PostgreSQL.

Se ejecutan directamente con `node --test`; no se usa el script amplio de build/test ni un ejecutor de migraciones.

La integración sobre PR289 `49369b8435872bdda4ed6524c841fb345badb9b7` aprobó **118/118 pruebas focales**, cero fallos y cero omitidas: las dos suites nuevas más clasificación de período, print facts V6 y corridas existentes.

```text
node --test tests/own-employment-print-candidate.test.js tests/own-payroll-employment-print-facts.test.js tests/own-payroll-period-classification.test.js tests/own-payroll-receipt-print-facts.test.js tests/own-payroll-run.test.js
```
