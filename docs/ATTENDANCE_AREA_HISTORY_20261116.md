# Pertenencia histórica al área por contrato y fecha

Entrega de código sobre PR296 `ad0d80d989b736dee52a0102ef3200b8905b65b2`. No se ejecutó SQL, no se instaló el candidato y no cambia el estado de producción. `NoeliaReady=false`.

## Contrato resuelto

`resolveAttendanceAreaHistory(source, query)` consume hechos cerrados y sintéticos o proporcionados por un productor interno autorizado. La consulta identifica **tenant, binding y UUID exacto del contrato**, más `validFrom` y `validUntil`, inclusivos. El algoritmo acredita una única área durante todo el intervalo. Un límite final nulo exige un intervalo laboral explícitamente abierto.

El SQL interno correspondiente es `attendance_area_history_v1(ctx, target, first_date, last_date)`. `ctx` debe provenir de la nueva fachada autenticada de área; esta función privada no autentica al usuario. Su ejecución directa está revocada a `PUBLIC` y a `municontrol_actions_runtime_app`.

Al resolver devuelve:

```json
{
  "version": "attendance-area-history.v1",
  "status": "resolved",
  "contractId": "UUID del contrato",
  "validFrom": "AAAA-MM-DD",
  "validUntil": null,
  "area": {
    "organizationUnitSourceId": "código exacto",
    "sectorSourceId": "código exacto o null",
    "organizationName": "etiqueta declarada",
    "sectorName": "etiqueta declarada o null",
    "areaLabel": "Repartición / Sector"
  },
  "evidence": {
    "sourceVersion": "SHA-256 de la evidencia y el rango",
    "registrationId": "UUID del alta",
    "registrationRequestSha256": "SHA-256 original",
    "registrationCatalogSha256": "SHA-256 original",
    "registeredAt": "fecha de registro original, sólo auditoría",
    "changeApprovalIds": [],
    "lifecycleApprovalIds": []
  },
  "reasons": []
}
```

Al bloquear, conserva los identificadores de la consulta que recibió, establece `area:null`, `evidence:null` y enumera códigos de impedimento. **La fachada no debe proyectar esa identidad al navegador:** todavía no existe un área histórica acreditada con la que demostrar el alcance del lector. Un bloqueo no produce una asignación a partir del área actual.

`evidence.sourceVersion` es determinista para el contrato, el rango y el recorte de evidencia. En SQL es SHA-256 de los bytes UTF-8 de `source_evidence::text` en JSONB, con zona UTC. Incluye alta, catálogo del alta, área, revisiones aprobadas y sus hashes, intervalos y contrato de guardas. No contiene un reloj de consulta nuevo. El padrón puede utilizarlo como `subjectVersion`; cambia si cambia el rango o cualquier aprobación relevante.

## Qué puede demostrar cada fuente existente

| Fuente original | Datos conservados | Uso en este contrato |
|---|---|---|
| Registro067; escritor095/167 | UUID de registro/contrato/persona, tenant/binding, SHA de pedido y catálogo, `created_at`; contrato con `start_date`, códigos y etiquetas del catálogo | El inicio laboral es explícito. La fecha de grabación se conserva únicamente como procedencia. |
| Rectificación104; aprobación vigente224 | Propuesta y revisión inmutables, `revision`, `before_contract`, `after_contract`, maker/checker, `reviewed_at` | Verifica continuidad y recupera la proyección inicial de la primera preimagen. No posee fecha de efectividad del cambio de área. |
| Ciclo laboral110 | Propuesta `movement` + `movement_date`; intervalos anteriores y posteriores aprobados | Reconstruye altas/bajas/reingresos por las fechas declaradas, sin unir intervalos separados por una baja. |
| Anulación224 | Aprobación de retirada de un alta errónea | Bloquea el contrato completo; no transforma la anulación en una baja con fecha. |
| Adopción133 | Snapshot GRH anterior y posterior; `adoptedAt` | Conserva procedencia pero no prueba desde cuándo estuvo en esa área. Bloqueada. |
| Clasificación177 | Configuración mensual aprobada, definición y procedencia propias | Conserva su dominio mensual; este contrato no la transforma en historia diaria. |

El registro067 no almacena un segundo cuerpo completo del alta. Si existen rectificaciones, la primera preimagen aprobada conserva la proyección inicial; la cadena completa debe terminar exactamente en la fila canónica. Si no existen rectificaciones, la combinación de registro exacto y guardas inmutables permite utilizar la proyección canónica como la original. No basta con leer sus códigos actuales.

El candidato verifica cuerpos originales de las guardas mediante SHA-256 de `pg_proc.prosrc` y verifica los triggers habilitados de registro, contrato, rectificaciones y ciclo laboral. Los pins se obtuvieron exclusivamente del código versionado; no describen una consulta a una base instalada. Una composición que cambie esas guardas necesita revisar y versionar los pins; el lector bloquea si no coinciden.

## Límites expresos

Toda rectificación que cambie repartición, sector o sus etiquetas queda bloqueada con `AREA_HISTORY_EFFECTIVITY_REQUIRED`, incluso si luego hubo otra rectificación que devolvió el área anterior. Las fuentes104/224 no declaran fecha efectiva y no se deriva una del instante de aprobación. Los cambios de otros campos que mantengan la misma área y etiqueta sí conservan la pertenencia cuando la cadena completa es válida.

GRH y contratos adoptados quedan bloqueados con `AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED`. No se unen por legajo ni se utiliza la transferencia de titularidad como inicio de área. Habilitarlos requiere una fuente de vigencia diaria explícita con otro contrato versionado.

Una revisión rechazada o una propuesta pendiente no altera el área ni los intervalos. El lector procesa exclusivamente revisiones aprobadas y exige propuestas coincidentes, revisiones contiguas y autor distinto del aprobador por membresía, persona y correo. El SQL compara snapshots completos; los hechos del módulo puro transportan el resultado de esa comprobación como `sourceMatches` y `makerChecker`. Esas banderas proporcionadas por un consumidor **no acreditan autoridad**: el módulo puro sólo valida el contrato; el productor SQL es quien debe leer y comprobar las fuentes reales dentro del alcance autorizado.

El nombre legible procede del snapshot de alta y de su catálogo SHA, conservado a través de la cadena. No se fabrica un nombre desde el código. Para mostrar scopes del usuario, la fachada debe resolver aparte sus etiquetas con `native_employee_catalog_v1(ctx)`, seleccionar una sola fila por `kind + code` y limitar por el binding autenticado. La función vigente está en103; prioriza catálogo propio aprobado y conserva un fallback GRH publicado. Un catálogo de sectores no prueba por sí solo una relación repartición-sector ni la pertenencia del contrato.

## Integración de la fuente

El helper es `STABLE`; sus lecturas comparten el snapshot de la sentencia que lo invoca. La fachada debe materializar ese resultado en su corte y limitar por el área resuelta **antes** de proyectar contratos o unir marcas. Una secuencia de lecturas separadas no acredita el corte conjunto.

La fuente SQL tiene un `RAISE EXCEPTION` incondicional antes de cualquier definición y termina con `ROLLBACK`. No tiene grants de ejecución pública, no escribe historia, no modifica fuentes originales y no es un instalador. La composición, validación SQL aislada y posterior instalación corresponden al carril autorizado de revisión/operación.

## Verificación realizada

```sh
node --test tests/attendance-area-history.test.js
```

Pruebas puras y estáticas: alta retroactiva con fecha explícita, separación registro/vigencia, contrato/tenant/binding exactos, falta de procedencia, datos incompletos, adopción/GRH, anulación, cadena contigua y maker/checker, cambio de área con retorno, baja inclusiva, reingreso, huecos de continuidad, fechas imposibles, campos extra, caracteres invisibles, propiedades ejecutables y guardas de la fuente candidata.

Estas pruebas no certifican ejecución PostgreSQL. La fuente candidata queda disponible para que Claude la revise y pruebe en el sandbox acordado; producción e instalación permanecen en Codex.
