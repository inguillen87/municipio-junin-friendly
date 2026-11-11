# OSEP 206 desde cierres propios: contrato de preparación

## Resultado y alcance

Este incremento implementa un adaptador puro de una fuente propia cerrada y verificada al generador OSEP 206 revisado. Incluye contrato de mapeo, declaraciones de identidad vinculadas a la fuente, observaciones por fila, controles monetarios y pruebas sintéticas. No agrega API, tabla, migración, botón, descarga automática ni escritura municipal.

El resultado conserva `activation: PREPARATION_ONLY`, `institutionalValidation: pending`, `officialSubmissionAllowed: false` y `canExport: false`. `canRenderReview` sólo permite fabricar bytes de revisión privada cuando el conjunto seleccionado no tiene observaciones. No es homologación, autorización institucional ni prueba de envío a OSEP.

### Fuentes técnicas admitidas

- Repositorio: `inguillen87/municipio-junin-friendly`.
- PR 262 inspeccionada en `b870f406fdc0d7a6a82112633a374b122ec1984b`. El modelo ART y sus verificadores se reutilizan sin modificar su contrato.
- Generador corregido de OSEP: `assets/payroll-osep-206-generator.js`, SHA-256 `cbe8eae10706f3fadf396b41aae43304bb0d6cbb1ca1af2821ae67361cd7559c`. Es el candidato privado revisado de raíz, no la versión original incompleta de PR 258.
- El procedimiento de lectura `own_art_report_source_v1` conserva todos los conceptos y el padrón de los cierres elegidos. Que su nombre diga ART no limita el contenido al cálculo 993+995.
- Las fuentes históricas de GRH sólo justifican los códigos y el formato. Este adaptador no consulta GRH ni lo necesita durante la operación.

## Versiones y compatibilidad

| Elemento | Tratamiento de este candidato |
|---|---|
| `own-art-preview.v1` + `own-art-source.v1` | Contrato de entrada. Se verifican conteos, origen MUNICONTROL, período, tipos, cada recibo de cierre y huella del contenido completo. |
| `own-close-receipt.v1` | Recibo de cierre verificado con el modelo existente, sin sustituirlo por un stub. |
| `own-close-snapshot.v1` | Puede pasar la verificación histórica, pero carece de jurisdicción capturada. Cualquier población no vacía queda bloqueada para OSEP. |
| `own-close-snapshot.v2` | Admite revisión con jurisdicción capturada y población completa. |
| `own-close-snapshot.v3` | Admite revisión; respeta la separación entre conceptos y auxiliares de `own-payroll-namespaces.v2`. |
| Snapshot privado v4 / cantidades de raíz | **No admitido por este paquete.** El verificador real de PR 262 lo rechaza. No se reemplazaron validadores, imports ni formas de datos para aparentar compatibilidad. |

El worktree Windows contiene trabajo privado posterior de cantidades y snapshots v4. Componerlo, admitir esa forma nueva y verificar su ciclo completo corresponde al integrador. Esta prueba sobre PR 262 no certifica esa composición ni el HEAD productivo. La base de PR 262 tampoco contiene por sí sola los 28 commits de producción posteriores a `master`; integrarla no autoriza perderlos.

## Mapeo de los doce importes

`contracts/own-osep-closed-mapping.v1.json` y `OWN_OSEP_GRH_MAPPING_DRAFT` contienen el mismo contrato. Los tests comprueban su igualdad. Cada término especifica código, espacio de nombres y naturaleza, además de exigir `unit: money` en la fuente cerrada.

| Campo OSEP | Alias histórico por defecto | Espacio / naturaleza de la propuesta nativa |
|---|---|---|
| Aporte patronal | 701 | concepto / contribución patronal |
| Haberes exportados | 993 + 994 | auxiliares monetarios |
| Neto | 998 | auxiliar monetario; debe coincidir con el neto guardado del cierre |
| Cuota | 601 | concepto / retención |
| Voluntario puro | **602 + 608** | conceptos / retención |
| Voluntario estudiante | 603 | concepto / retención |
| Catastrófico | 604 | concepto / retención |
| Catastrófico indirectos | 682 | concepto / retención |
| Catastrófico voluntarios | **683** | concepto / retención |
| Catastrófico estudiantes | **684** | concepto / retención |
| Cuenta corriente | 605 | concepto / retención |
| Discapacidad directo | 685 | concepto / retención |

La lista resumida del pedido no incluía 608, 683 y 684; se conservan porque el generador revisado y las columnas de la consulta histórica los requieren. El código 619 no agrega un campo a los 206 bytes.

Los códigos son parametrizables. Cambiarlos genera otro hash de mapeo; no autoriza una equivalencia institucional. Cada campo debe tener términos explícitos, o `terms: null` para dejarlo pendiente. Una lista vacía y un término repetido dentro del mismo campo son inválidos.

Existe una alternativa nativa explícita para el neto: `[{"kind":"closed_total","key":"net"}]`. Lee el total neto histórico de ese empleado, ya conciliado por el verificador del cierre. No ejecuta una fórmula ni supone que un auxiliar 998 ausente valga cero. El contrato de ejemplo conserva 998 para hacer visible la equivalencia pendiente.

Los espacios de nombres y naturalezas de esta propuesta deben contrastarse con el programa nativo que finalmente se apruebe. La evidencia histórica de un código no demuestra por sí sola esa equivalencia.

## Reglas monetarias

1. Cada término se recibe como decimal textual de un cierre verificado. Números JavaScript, `null` y fuentes ausentes no se convierten a cero.
2. **Cada término** debe admitir centavos exactos y no negativos antes de sumarlo. `1000.001 + 49.999` se rechaza aunque su suma matemática tenga dos decimales. No se cancelan residuos para ocultar redondeos.
3. Los ceros explícitos de conceptos presentes se preservan. No hay una política de ausencia equivalente a cero; incorporarla requeriría una declaración institucional y su contrato de origen.
4. Cada término y la suma del campo deben caber en diez dígitos de centavos. No hay truncamiento por `RIGHT`, módulo, saturación ni recorte.
5. El neto mapeado debe coincidir con el neto guardado del mismo cierre. Si no coincide, el valor y su total de control quedan `null` y el archivo completo se bloquea.
6. Si falta un importe en una fila, el control total de ese campo queda `null`. No se presenta una suma parcial como total completo. Los demás campos completos conservan sus controles independientes.

## Población y selección

La consulta debe corresponder exactamente al período y tipos solicitados. Se revisan los recibos completos antes de trabajar con filas. Los topes del verificador de origen permanecen vigentes y se controla el presupuesto de 32 MiB de entrada; no se divide ni recorta una fuente que exceda la capacidad.

La jurisdicción del archivo debe ser una elección explícita, 42 o 55, basada en la clasificación conservada por cada cierre. Si todas las participaciones están clasificadas, se toman **todas** las de la jurisdicción elegida y se informa cuántas pertenecen a la otra. No hay búsqueda, página, rango de legajo ni lista arbitraria que reduzca el TXT.

Si una jurisdicción falta o todavía no se eligió destino, se conservan todas las filas de origen en la revisión bloqueada. No se deduce jurisdicción de nombre, documento, dependencia o cantidad de agentes.

Este primer contrato exige `populationComplete: true` en cada snapshot. Un conjunto de cierres parciales podría llegar a cubrir una población completa, pero su suma de conteos no es prueba suficiente; la conciliación de esa partición queda pendiente. El adaptador lo informa como `CLOSED_POPULATION_INCOMPLETE` y no fabrica un archivo parcial.

Sólo se acepta una participación cerrada por contrato para una fila. Si mensual y SAC, por ejemplo, incluyen el mismo contrato, se conservan ambas procedencias y se bloquea la consolidación. No se elige una liquidación ni se suman tipos automáticamente: el reporte histórico también distinguía fechas, y falta un contrato de consolidación aprobado.

El alcance demostrado es el conjunto de **cierres actuales devueltos por la fuente**. No es certificación de que toda la nómina municipal deba haber sido liquidada, ni autorización para liquidar empleados faltantes.

## Identidad y concursado

La fuente ART propia trae DNI, nombre, legajo, contrato, persona, registro y token de identidad; no trae un tipo documental OSEP explícito. Por eso el adaptador no supone el código 3.

Las declaraciones se reciben separadas, con esta forma:

```json
{
  "version": "own-osep-identity-declarations.v1",
  "scopeVersion": "SHA-256 del ámbito verificado",
  "sourceVersion": "SHA-256 de la fuente completa",
  "period": "2026-11",
  "rows": [{
    "contractId": "UUID del contrato de esa fuente",
    "personId": "UUID de la persona de esa fuente",
    "registrationId": "UUID del registro de esa fuente",
    "identityToken": "SHA-256 de la identidad de esa fuente",
    "documentTypeCode": "3",
    "bankrupt": null,
    "reference": "Referencia de la declaración documental"
  }]
}
```

El ejemplo muestra nombres de campos, no datos ejecutables. La declaración debe coincidir con contrato, persona, registro, token, ámbito, período y huella de fuente reales. Un tipo faltante conserva una observación por fila; una declaración duplicada, ajena u obsoleta se rechaza. Una huella sólo prueba correspondencia de contenido: no sustituye la autorización y aprobación institucional que necesitaría su registro.

`bankrupt: null` aplica el valor explícito `bankruptDefault: false` del contrato, como pidió el sprint. `true` o `false` en una declaración vinculada constituyen un override explícito. Se conserva la procedencia `mapping_default_no` o `explicit_declaration`. No se infiere la situación concursal a partir de descuentos o embargos.

Dos contratos con el mismo legajo normalizado, la misma persona o el mismo documento producen observaciones en **todas** las filas involucradas. No se fusionan ni se elimina la segunda fila. El archivo se ordena por legajo numérico de forma determinista.

Los días ART, el sexo y el CUIL no son requisitos adicionales de OSEP. Se conserva la validación estructural del registro recibido; una declaración ART ausente o no aprobada no impide por sí sola esta revisión OSEP.

## Escritura y custodia de la revisión

El escritor revisado produce 206 bytes por detalle, Windows-1252, sin BOM, con CRLF. No cambia mayúsculas, no reemplaza caracteres y no trunca nombres superiores a cuarenta bytes. Cada identidad debe caber en el formato.

El registro terminal observado de 24 tabulaciones y un espacio se emite exclusivamente si el contrato elige `osep-206-tab-footer25.v1`. Se cuenta separado de las personas. El perfil base no lo agrega.

`prepareOwnOsepReport` copia sus argumentos antes del primer `await`; verifica la fuente y los recibos con los módulos reales, y congela el resultado. Incluye hashes independientes del mapeo y las declaraciones. `renderOwnOsepReview` sólo admite objetos creados por esa preparación en el mismo módulo y rechaza copias o objetos reconstruidos. Cada llamada genera bytes nuevos; esos bytes no se presentan como archivo firmado o almacén inmutable.

No se guardan los datos en `localStorage`, archivos nominales, CI o servicios externos. Las pruebas incluyen sólo identidades e importes inventados.

## Diseño del panel posterior

El panel futuro puede seguir el patrón de ART: elegir período/tipos/jurisdicción; consultar fuente completa; mostrar observaciones y totales; producir una revisión explícita. La búsqueda y paginación afectan sólo la pantalla.

Antes de ofrecer una descarga operativa faltan:

- Incorporar el generador corregido y admitir el contrato de cierre efectivamente integrado, incluido v4 si corresponde.
- Resolver y aprobar el mapeo por jurisdicción y programa nativo, el tratamiento de participaciones múltiples y las declaraciones documentales.
- Establecer la persistencia y autoridad de esas declaraciones con el circuito propio, sin editar el padrón para salvar el formato.
- Revalidar sesión, capacidades, ámbito, fuente y hashes inmediatamente antes de generar; invalidar ante cambio de cuenta, permisos, selección, contrato o visibilidad.
- Conciliar un período completo y sus controles con la evidencia institucional, además de definir nombre oficial del archivo y presentación.

No se cablea un botón mientras esas decisiones sigan pendientes. Los permisos del endpoint ART no se amplían ni se reutilizan para suplantar una autorización de envío.

## Verificación y composición

Las pruebas se ejecutan con Node y los modelos reales de PR 262, no con un verificador simulado. Cubren bytes y posiciones, mapeos compuestos, tipos documentales, nulos y ceros, precisión por término, límites, neto, colisiones de espacios de nombres e identidad, población y jurisdicción completas, varias liquidaciones, huellas obsoletas, cambios concurrentes en los argumentos y versión v4 rechazada.

En una composición con las dependencias correctas:

```sh
node --test tests/own-osep-report.test.js
```

Los cinco archivos de este candidato son el modelo, el JSON de contrato, el test, su fixture y este documento. Los directorios de fuentes, runtime y evidencia son material privado de revisión; no deben copiarse como nuevos archivos de aplicación ni reemplazar las dependencias actuales. El integrador debe resolver diferencias de preimagen y conservar el trabajo productivo existente.

No se ejecutó SQL ni se probó una sesión de navegador, un cierre real, una descarga productiva o una presentación a OSEP en este incremento.
