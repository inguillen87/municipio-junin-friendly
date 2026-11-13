# Preparte de área — contrato de entrega

**Estado: diseño para implementación; no publicado.** Base:
`3d59c5278151de0df4cd08aa73a0c8e833ab5d35`. Conserva la decisión de
[Root 6841313525](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6841313525)
y responde a [evidencia 6842582734](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6842582734)
y [maqueta 6842674954](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6842674954).
Actualizado con las respuestas de Liquidaciones comunicadas por Marcelo a Claude el 13/11/2026,
[comentario 6843539344](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6843539344),
y el documento R3 de SHA-256 `a21e22eabc60bebb2a9684d8133bd4346d2025c0c5091fb8ab97a329e7c625d0`.

## 1. Decisión de dominio, regla 107 confirmada y conversión pendiente

**Se reutiliza `own-payroll-novelty-batch.v1`**, un mes, tipo `monthly` y una repartición histórica.
Procedencia y autorización de área se conservan en un registro inmutable separado, en la misma
transacción. El batch vigente valida claves exactas y no admite incrustar esos campos.

**Acuerdos y topes tendrán registro propio de área con vigencia**, distinto del lote mensual y de
las novedades fijas. Un acuerdo full time o mayor dedicación describe condiciones administrativas;
no equivale a una fija 44/95 que el cálculo deba aplicar automáticamente. El registro fijo existente
admite concepto/cantidad/importe, no este contrato de horas semanales, garantía y evidencia.
La jornada contractual diaria/mensual existente sigue siendo su fuente canónica; no se convierte
una cifra semanal en jornada mensual. Altas, bajas, renuncias y encuadre permanecen en Personas,
con sus actos y revisión; el parte sólo referencia esos hechos, sin escribirlos nuevamente.

**La escala de 107 está confirmada por Liquidaciones:** se informa una cantidad, no el porcentaje
de descuento. La cantidad autorizada 1, 2 o 3 corresponde a pérdida de presentismo de 33 %, 50 % o
100 %, respectivamente; el tramo de tres o más se representa con cantidad 3. Cuentan las
inasistencias y las tardanzas. La regla propia que use esta declaración debe quedar versionada,
con alcance y vigencia explícitos, y seguir la revisión ordinaria; no se vuelve a pedir confirmación
de la escala ya respondida.

| Cantidad autorizada de 107 | Pérdida de presentismo confirmada |
| --- | --- |
| 1 | 33 % |
| 2 | 50 % |
| 3, que representa el tramo de tres o más | 100 % |

**Sigue pendiente la regla expresa para convertir tardanzas en esa cantidad.** La respuesta
«todo» confirma su inclusión, pero no dice cuántas tardanzas equivalen a una unidad, qué minutos
o umbral considerar ni cómo acumularlas. No se asigna factor por defecto, no se supone que cada
tardanza vale una unidad o un día y no se deduce una equivalencia de la escala 33/50/100. Sin esa
política aprobada, la derivación automática afectada queda bloqueada y conserva las incidencias
originales para revisión. Una cantidad declarada por el circuito autorizado conserva su propia
constancia; no se presenta como resultado calculado desde el reloj.

Los motivos y sus topes deben conservar la referencia aplicable; no se presume que cualquier
licencia afecta de la misma forma. Los descuentos por minutos de atraso tampoco se confunden con
107 ni se crean por esta escala. Cantidades originales, conversión, tope y cantidad autorizada deben
ser trazables. Un mes sin marcas no prueba ausencia: el preparte actual declara
`coverageCertified=false`; el cero exige cobertura completa, no datos faltantes.

**Circuito de RRHH, según lo informado por Liquidaciones:** Recursos Humanos remite en Word las
altas, bajas y cambios de clase; Liquidaciones los vuelca al sistema con la evidencia y revisión
del módulo correspondiente. Ese circuito queda fuera de Secretaría y del preparte de asistencia
del área. No se habilita escritura directa de RRHH por esta declaración ni se añade una aprobación
de Secretaría. La referencia a la ordenanza se conserva como información recibida, sin inventar
número, texto ni facultades adicionales.

44/95 se admiten únicamente con unidad y lista aprobadas del programa del período; sin ese gate
tampoco se inventa la conversión horas/porcentaje. 101/144 del pedido anterior pueden mostrarse
como incidencias, pero su inclusión salarial exige otra entrada explícita de política, no sólo UI.

## 2. Datos del contrato propuesto

Respuesta nueva: `{version:'own-area-preparte.v1', batch, preparationSource}`. `batch` conserva
su v1 completo. `preparationSource` tiene la siguiente forma cerrada:

```text
{id, version:'own-area-preparation-source.v1', tenantId, sourceBindingId,
 area:{organizationUnitSourceId,sectorSourceId}, periodMonth,
 batchId, preparedBatchRevision, rowsSha256, sourceVersion, policyVersion,
 operatorScopeVersion, preparedBy, preparedAt, rows:[RowSource]}

RowSource = {rowOrdinal, contractId, identityToken, classificationVersion,
 provenanceKind, evidenceRefs, agreementRevisionId, correctionReason,
 proposedQuantity, authorizedQuantity, unit, appliedCap}
```

UUID, SHA-256, autores y fecha provienen del servidor; `preparedBy` identifica persona y membresía.
`preparedBatchRevision` fija la revisión de preparación; decisiones posteriores cambian la revisión
del batch, pero no este registro ni sus filas. Se cotejan siempre `batchId` y `rowsSha256`.
`sourceVersion` liga el conjunto completo de evidencias, políticas, acuerdos y clasificaciones.
`evidenceRefs[]` contiene referencias inmutables `{kind,id,sha256}`. `classificationVersion` fija
la pertenencia histórica resuelta, aunque `identityToken` siga igual; no son pruebas intercambiables.

| Procedencia | Evidencia y regla |
| --- | --- |
| `clock` | Snapshot, hash y versión de reconstrucción; calendario/jornada y cobertura requeridos por la regla. Conservar propuesta y autorización por separado. Incidencias o identidades ambiguas bloquean la derivación correspondiente. |
| `agreement` | UUID de revisión aprobada, contrato, área y vigencia que cubre el período/tramo. No aceptar un borrador ni copiar ciegamente el mes anterior. |
| `secretariat_correction` | Evidencia original más motivo cerrado: `unjustified`, `late_leave_entry`, `service_assignment`, `missed_punch_with_evidence`. Constancia obligatoria; rectifica la propuesta, no las marcas ni la licencia original. |
| `legacy_txt` | SHA del archivo, perfil/escala del parser, líneas originales y resolución explícita al contrato propio. El importador conserva su autor real; un documento de Secretaría no se atribuye como sesión autenticada del Secretario. |

`authorizedQuantity` es texto decimal exacto y coincide con `batch.rows[].values.quantityDecimal`.
En el lote: `amountCents=null`, `forced=false`, `costCenterSourceId=null`, `adjustmentMonth=null` y
`movementType=null`. Se conservan los demás campos requeridos del modelo y sus validaciones.
No se agregan importes ni dimensiones alternativas para eludir conflictos.

Acuerdo propuesto `own-area-work-agreement.v1`:
`{id,revision,contractId,area,kind,weeklyHours,agreedPercentage,cap,shortfallMode,validFrom,validUntil,documentReference,documentSha256}`.
`kind` es `full_time` o `greater_dedication`; horas/porcentaje son declaraciones exactas o nulos,
sin equivalencia implícita. Historial de propuestas/decisiones inmutable y revisiones aprobadas sin
solapamientos del mismo alcance. `shortfallMode` exige una regla aprobada: `clock_based` o
`guaranteed_agreement`; sin decisión, la discrepancia queda bloqueada. Un acuerdo garantizado sólo
puede superar lo observado si el acto y la política lo autorizan, siempre dentro de los topes.

`cap` declara unidad y límite o ausencia de límite explícitamente respaldada; nulo significa dato
no informado. El límite aplicado es el más restrictivo de los generales, de área e individuales
comparables; un tope de área nunca amplía el general. Sin regla general verificable o con unidades
incompatibles, no se prepara el lote. Las políticas/topes tienen revisión, vigencia y hash propios.

## 3. Autoridad y dos intervenciones independientes

- **Secretaría:** nueva capacidad propuesta `payroll.novelty.area.prepare`, con alcance expreso de
  organización/sector. Autoriza lectura nominal y preparación sólo mediante la fachada de área.
  El servidor restringe bootstrap, detalle, intento, acuerdos, preparación, envío y cancelación.
  No se conceden `OWN_NOVELTY_READ` ni `payroll.novelty.prepare` globales para hacerla funcionar:
  esos permisos abrirían el bootstrap municipal actual.
- **Liquidaciones:** lectura vigente del lote y `payroll.novelty.approve`, con persona y membresía
  diferentes del preparador. Autorizar Secretaría es preparar/presentar; aprobar Liquidaciones es
  la decisión independiente existente. No son firmas digitales ni una aprobación automática.
- Acuerdos/topes tienen su propio ciclo previo: propuesta con `payroll.novelty.area.prepare`, revisión con
  `payroll.parameter.approve` por otra persona y membresía. Su aprobación no aprueba los lotes
  posteriores. Esta extensión de facultades debe implementarse expresamente; hoy no existe.

La intervención de Secretaría anterior corresponde al preparte del área. No se intercala en el
circuito RRHH Word → Liquidaciones para altas, bajas o cambios de clase; allí se conservan las
facultades y decisiones propias de Personas y el autor real de cada carga.

Sesión administrada/MFA, tenant, binding y release certificados siguen obligatorios. El sujeto se
selecciona por `contractId` y token; la pertenencia se comprueba con
`own_period_classification_resolve_v1` del período. Organización, repartición y jurisdicción no son
sinónimos. La asignación del operador se valida aparte. Un traslado de área o encuadre incompleto
requiere tratamiento histórico explícito; no usar la repartición actual como sustituto.

`tenant_action_area_scope` y `normalizeActionScopes` sólo admiten hoy `leave.request.area.*`.
La nueva capacidad exige migración del constraint, aprovisionamiento, normalizador y fachadas
acotadas. No sirve fabricar capacidades para llamar al contexto global existente.

## 4. Ciclo, complementario y TXT transitorio

Se mantienen `draft → submitted → approved/rejected`, cancelación según estado, revisión exacta e
idempotencia con el mismo cuerpo/clave. La preparación y su procedencia se guardan juntas; cambios
de fuentes antes de decidir exigen nueva revisión. Después de aprobado no se edita.

Un complementario es **otro batch del mismo mes/área con destinos nuevos**. El escritor vigente
rechaza repetir contrato/concepto/dimensiones entre lotes activos (`OWN_NOVELTY_CONFLICT`); corregir
una fila ya aprobada exige el circuito de corrección/anulación y, si está capturada, revisar la
corrida. No se suman duplicados ni se disfraza la clave para crear un complementario.

TXT será un adaptador transitorio del **mismo batch**, nunca una fuente salarial paralela:

- Entrada: normalizar archivos completos antes de `prepare`, resolver DNI contra el padrón
  autorizado y fijar UUID/token; ambigüedad requiere selección expresa. Importar no aprueba.
- Salida: sólo desde batch aprobado y revisión exacta, con manifiesto
  `{batchId,batchRevision,rowsSha256,sourceVersion,profileVersion,files:[{conceptCode,rowOrdinals,sha256}]}`.
  Se conserva quién exportó y los bytes; no se crea otro lote ni se marca importado/pagado.
- Perfil inicial propuesto sobre formato 4: DNI de 8 posiciones + cantidad de 5, dos decimales implícitos,
  CRLF; un archivo por 44 o 95. Los anchos/escala quedan fijados por perfil versionado, no inferidos.
  La variante de 6 dígitos reportada para Servicios exige perfil cotejado propio, sin truncar cola.
  107 no hereda formato 4; sin perfil homologado su exportación queda bloqueada.
- Cada fila exportada debe volver exactamente al mismo contrato/concepto/cantidad en la prueba de
  ida y vuelta. No redondear, omitir cero, sumar duplicados ni reducir el conjunto silenciosamente.
  Si una fila no es representable, se rechaza el paquete solicitado. Reimportar sus bytes no crea
  un segundo destino: manifiesto, hash e idempotencia deben detectar el intento existente.

## 5. Gates para implementación y compatibilidad

Batch v1 y su hash permanecen intactos. Los contratos nuevos tienen lectores de claves exactas;
los lotes antiguos no reciben procedencia retrospectiva inventada. La UI se conecta sólo cuando
existan las fachadas scoped; no utiliza el bootstrap global mientras tanto.

Aceptación: aislamiento entre áreas en todas las operaciones, clasificación histórica, revocación,
revisor idéntico rechazado, fuentes/acuerdos cambiados, escala 107 1/2/3 → 33/50/100 conservada,
derivación de tardanzas bloqueada sin conversión expresa y sin factor por defecto, topes estrictos,
menor asistencia según política, complementario conflictivo rechazado, bytes TXT completos y
round-trip, respuesta incierta recuperada con la misma clave. Esta entrega define esos gates;
no afirma haberlos implementado ni ejecutado.

Fuentes reales: [batch](../assets/own-payroll-novelties-model.js),
[escritor 130](../scripts/migrations/130-own-bulk-novelties.sql),
[preparte actual](../lib/attendance-preparte.js),
[fijas](NOELIA_FIXED_NOVELTIES_CONTRACT.md),
[jornada contractual](../assets/own-contract-working-time-model.js),
[formato 4](../assets/grh-entity-formats.js) y
[alcance IAM](../scripts/migrations/006-tenant-action-authority.sql).
La escala y variante de los TXT proceden de la
[muestra reportada por Claude](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6841155981);
esta entrega no revalida los archivos privados de agosto.
El documento R3 confirma las respuestas transmitidas y distingue su evidencia de las inferencias
de la maqueta. Su sugerencia de contar cada tardanza como una no forma parte de este contrato.
