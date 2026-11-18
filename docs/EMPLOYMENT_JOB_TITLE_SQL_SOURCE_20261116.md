# Cargo: fuente SQL candidata para los escritores efectivos

Estado: **fuente para revisión y composición por Codex; no instalable**. Base exacta: `c9f3396940e44b7e96f81ad1b4624c65de34336a`, la rama de escritores de Claude sobre PR291 (`7be686a4f418fe24510692f65f81338a311e7d93`). `NoeliaReady=false`.

El candidato agrega el contrato de cargo a las tres fronteras que pueden guardar un cargo nuevo: alta, propuesta de rectificación y aprobación de una rectificación pendiente. La aprobación comprueba el cargo del documento congelado, porque una propuesta anterior al cambio de los modelos JS puede llegar a esa operación sin pasar por `changeProposalInput`.

## Fuentes efectivas y reemplazos

La numeración 067/095/167/104 identifica la historia del cambio; no es una secuencia para instalar esas definiciones juntas. El relevamiento de las migraciones del árbol base encontró estos reemplazos:

| Firma | Historia del repositorio | Fuente elegida |
|---|---|---|
| `public.native_employee_create_v1(jsonb,jsonb,text,uuid)` | 067 define; 095 reemplaza y agrega jurisdicción; 099 parchea consumidores GRH; 103 agrega el bloqueo del catálogo; 104 y 110 verifican los pins de esa transición; 167 reemplaza el cuerpo y exige `registrationAllowed`. | Cuerpo literal de 167. |
| `public.native_employment_change_propose_v1(jsonb,jsonb,uuid)` | 104 define; 224 reemplaza y agrega la defensa de retiro de altas. | Definición completa de 224. |
| `public.native_employment_change_review_v1(jsonb,jsonb,uuid)` | 104 define; 224 reemplaza y agrega la defensa de retiro sólo al aprobar. | Definición completa de 224. |

El artefacto contiene exactamente esas tres firmas, una vez cada una. Reemplazar `propose` o `review` con los cuerpos anteriores de 104 eliminaría la defensa de retiro de 224; esta derivación no lo hace.

**Límite documental de 167:** la migración conserva un `after_body` exacto y metadata declarada; al aplicarse, conserva el encabezado existente mediante `pg_get_functiondef`. No contiene una definición histórica completa `CREATE FUNCTION`. Para presentar fuente legible se combinan el cuerpo literal de 167 y el encabezado exacto de 095, compatible con la metadata declarada por 167. El manifest registra `beforeDefinitionSha256:null` y `historicalCompleteDefinitionAvailable:false` para esa combinación. No se la presenta como un original recuperado ni como un encabezado observado en una base. La composición posterior debe conservar la metadata real previamente acreditada.

Todos los archivos de entrada están fijados por SHA-256 completo. El derivador rechaza cambios de un byte, ausencia de una entrada o entradas adicionales. También verifica los cuerpos y las definiciones elegidas. Los hashes de 099/103 son los pins declarados por sus parches históricos; no se presentan como definiciones completas extraídas.

## Cambios puntuales

Cada cuerpo recibe **un bloque inline de validación**. Al quitar ese bloque, la prueba obtiene exactamente los bytes del cuerpo original. No se agregan funciones auxiliares ni miembros de familias.

| Frontera | Valor comprobado | Posición del bloque |
|---|---|---|
| Alta | `d->'jobTitle'`, sin normalizar de nuevo. | Después de autorización, validaciones originales, replay, catálogo, identidad y número; antes del primer `INSERT`. |
| Propuesta | `values_value->'jobTitle'`, ya tratado por el helper original. | Después de normalización, replay, retiro, identidad, alcance, base, catálogo, construcción del documento, ausencia de cambios y capacidad; antes de guardar la propuesta. |
| Aprobación | `p.after_contract#>'{source_payload,employment,cargoName}'`. | Dentro de `approve`, después de replay, retiro, autorización y maker/checker, identidad, base, catálogo, consistencia del documento y límites de revisión; antes de guardar la revisión o aplicar el contrato. |

Los reintentos que ya tuvieron éxito retornan el recibo anterior antes del bloque nuevo. No se reinterpretan ni se vuelven a validar esos cargos históricos. `reject` no entra en la validación del cargo y puede rechazar una propuesta pendiente inválida. La guarda de retiro de 224 sigue intacta y conserva su condición exclusiva de aprobación.

Los errores nuevos usan los códigos existentes `NATIVE_EMPLOYEE_INPUT_INVALID` y `NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID`; no incluyen el valor del cargo. Ningún bloque cambia el borrador, la huella del pedido, los IDs, el documento pendiente, los recibos de replay ni filas existentes.

### Contrato y normalización

Para texto no vacío, el bloque exige el contrato compartido de `assets/employment-job-title-contract.js`: NFC, hasta 120 unidades UTF-16, sin espacio exterior del conjunto ECMAScript, sin C0/C1, sin los controles bidireccionales U+202A…U+202E y U+2066…U+2069, sin `<` ni `>`, sin sustitutos Unicode aislados. Cuenta dos unidades para cada punto suplementario y limita la longitud por puntos antes de recorrer el texto. PostgreSQL UTF8/jsonb no admite NUL ni sustitutos aislados; el modelo sintético también comprueba su rechazo.

El cargo vacío sigue permitido en alta y propuesta y el SQL original lo guarda como `null`. El documento congelado que se aprueba debe contener `null` o texto válido no vacío, como exige la captura. Los caracteres `…` y `→` conservan la aceptación del contrato; esta entrega no cambia el repertorio de la fuente PDF ni agrega una regla de WinAnsi.

Se conserva la diferencia de normalización ya existente:

- Los modelos JS aplican `normalize('NFC').trim()` antes de enviar el cargo.
- El alta SQL conserva su borrador original y su fingerprint; no se agrega normalización.
- `native_employment_change_values_v1` de 104 conserva `normalize(btrim(...),NFC)`. No se sustituye `btrim` por el conjunto de espacios de JavaScript. Una llamada SQL directa con NBSP exterior sigue sin convertirse silenciosamente en texto sin NBSP.
- La aprobación no modifica ni normaliza el cargo congelado. Una propuesta pendiente inválida debe rechazarse y corregirse mediante una propuesta nueva.

`values_v1`, `display_v1`, `after_v1`, bootstrap y demás lectores quedan fuera del candidato. En particular, no se endurece el helper de lectura para que un cargo heredado inválido pueda seguir mostrándose y corregirse.

## Otros documentos conservados

Se revisaron los sitios de escritura de `cargoName`/`jobTitle` y de `source_payload` en las migraciones del árbol base. La aprobación de rectificación aplica un `after_contract` que puede introducir un cargo distinto; por eso necesita el control final.

La adopción de 133 también aplica un documento conservado, pero conserva el cargo original. Su guarda exige `before_row.source_payload = after_row.source_payload - 'native'`: agrega procedencia de adopción, sin aceptar una nueva entrada `jobTitle`. No se agrega un bloqueo a esa conservación histórica. El retiro de 224 modifica estado/fecha y conserva el cargo. Esta entrega no pretende sanear datos históricos, intervenir importaciones ni bloquear operaciones cuyo propósito es conservarlos.

## Artefactos y huellas

- Derivador puro: `scripts/lib/employment-job-title-sql-candidate.mjs`.
- Comando que sólo escribe texto: `scripts/build-employment-job-title-sql-candidate.mjs`.
- Fuente: `scripts/candidates/employment-job-title-writers-v1.source.sql.txt`.
- Manifest: `scripts/candidates/employment-job-title-writers-v1.source.manifest.json`.

La fuente tiene **24.726 bytes**, SHA-256 `6c7857f8ce2b992b8094b9cf25174ce29ef2e8a116c4b04887b9ca2f3bdbbf4d`.

El manifest tiene SHA-256 `98d2c27f9016541611b3a99e925928fbe0588b34a864639635592d38dd97d82e`. Incluye las huellas completas de cada archivo de entrada, cuerpos originales y propuestos, encabezados, definiciones emitidas y bloque agregado.

| Cuerpo | Original exacto | Propuesto |
|---|---|---|
| Alta 167 | `6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6` | `34a362257a839c95639b03c8b61c0e5c613c59606d564671373956ad388ddb0b` |
| Propuesta 224 | `9af561b138bcad9a511ced80d8b2dfc24ab0df59a6fa8db9419ecbcd433c5b9e` | `0e1b416ce0f2726d28f35537d100d4827b1fee09202d9814f178f855d6db7131` |
| Aprobación 224 | `d0acb96d0e19dfc67f2cd7e6ce8d494bc73b1b273c1101d34e9df11a4fc61d44` | `4ac8c1d21ceea9ef2254b3da3326a3263bff52cc0508ed81a4faf0a15933cd4d` |

La fuente comienza con `BEGIN` y un `RAISE EXCEPTION` incondicional antes de toda definición; termina con `ROLLBACK`. No contiene `COMMIT`, cambios de ACL, installer, modificaciones de providers o actualización de pins/guards históricos. Las banderas son `installable:false`, `executesSql:false`, `installedStateObserved:false`.

## Verificación realizada

```sh
node scripts/build-employment-job-title-sql-candidate.mjs
node --test tests/employment-job-title-sql-candidate.test.js
```

Resultado: **22 pruebas puras aprobadas**. Comprueban procedencia y deriva reproducible, rechazo de fuentes cambiadas, firmas únicas, barrera, preservación literal de los tres cuerpos, orden de las validaciones, separación de replay/rechazo, conservación de retiro/adopción y paridad de los predicados Unicode emitidos con el contrato compartido mediante valores sintéticos y recorridos de rangos.

Estas pruebas leen texto y ejecutan JavaScript. El modelo de predicados comprueba la lógica propuesta; **no ejecuta ni simula PostgreSQL**, ni acredita su parser, collation, versión Unicode, triggers, privilegios, concurrencia o transacciones. No se consultaron SQL, CI, host, credenciales, respaldos ni documentos municipales.

## Pendiente de composición por Codex

El artefacto determina fuentes actuales del repositorio; no acredita qué cuerpos están instalados ni el candidato operativo elegido. Codex debe identificar ese destino y acreditar sus preimágenes y metadata completas antes de componer. El manifest enumera los hashes conocidos y deja explícita la definición histórica completa no disponible de 167; no inventa IDs de aplicación o pins del destino.

Quedan para un laboratorio con su autorización específica el parseo y ejecución PostgreSQL, la paridad de NFC/UTF8 en las versiones soportadas, y los controles de replay, rechazo, retiro, errores, triggers, concurrencia y rollback. También quedan la composición revisada y el cierre de las atestaciones afectadas. Esta fuente no relaja las guardas existentes para aceptar sus propios cuerpos nuevos y no habilita publicación o instalación.
