# Preparte de área — contrato de entrega

**Estado: regla pura de propuesta 107 implementada con pruebas sintéticas;
el circuito de área sigue en diseño, sin publicación ni instalación.** Base del contrato inicial:
`3d59c5278151de0df4cd08aa73a0c8e833ab5d35`. Conserva la decisión de
[Root 6841313525](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6841313525)
y responde a [evidencia 6842582734](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6842582734)
y [maqueta 6842674954](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6842674954).
Actualizado con las respuestas de Liquidaciones comunicadas por Marcelo a Claude el 13/11/2026,
[comentario 6843539344](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6843539344),
y el documento R3 de SHA-256 `a21e22eabc60bebb2a9684d8133bd4346d2025c0c5091fb8ab97a329e7c625d0`.
La actualización del 16/11/2026 implementa la decisión de Marcelo
[6923480164](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6923480164),
sobre base de código PR292 `a122d1c094c6a39cbd680c6de060ae9d6a733ef3`.

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

**Decisión posterior de Marcelo: cada día entero de 101 cuenta como una falta para
presentismo.** La regla versionada `own-area-presentismo107-rule.v1` propone
`cantidad107 = min(3, incidencias107_adicionales + dias101)` y conserva los dos
componentes originales. `incidencias107_adicionales` debe excluir expresamente los
días de 101; un total de 107 que ya los contiene no se vuelve a sumar. Si la
procedencia no permite establecer esa separación, la propuesta queda bloqueada.
`dias101` son días enteros de inasistencia injustificada declarados con evidencia,
no días inferidos por falta de marcas. Las fracciones de 101 que pueda producir el
modelo anterior de tardanzas tampoco son esos días: no se redondean ni se convierten.

La decisión alcanza la pérdida de presentismo. No autoriza un descuento adicional
de días de sueldo ni calcula un importe del concepto 144. La fecha del comentario
no establece una fecha efectiva: la aplicación requiere una revisión de política,
aprobación, área, convenios y vigencia suministrados expresamente para el período.

**Sigue pendiente la regla expresa para convertir tardanzas en esa cantidad.** La respuesta
«todo» confirma su inclusión, pero no dice cuántas tardanzas equivalen a una unidad, qué minutos
o umbral considerar ni cómo acumularlas. No se asigna factor por defecto, no se supone que cada
tardanza vale una unidad o un día y no se deduce una equivalencia de la escala 33/50/100. Sin esa
política aprobada, la derivación automática afectada queda bloqueada y conserva las incidencias
originales para revisión. Una cantidad declarada por el circuito autorizado conserva su propia
constancia; no se presenta como resultado calculado desde el reloj.
La entrada distingue las incidencias adicionales de 107 ya declaradas de las
tardanzas todavía sin conversión. Una tardanza sin conversión bloquea la propuesta
mensual incluso cuando la suma conocida ya alcanza 3. Esa saturación permite
conservar un mínimo conocido como evidencia; no completa la regla pendiente.

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
tampoco se inventa la conversión horas/porcentaje. La nueva relación entre días 101 y
cantidad 107 sólo genera una propuesta de presentismo. Incorporar novedades aprobadas
al cálculo salarial y cualquier otro efecto de 101/144 conservan sus contratos y
autorizaciones propios.

### 1.1. Regla pura implementada y forma cerrada

[Módulo `evaluateAreaPresentismo107`](../lib/own-area-presentismo107.js): sin acceso
al reloj, SQL, sesión, red ni estado del programa mensual. Separa versión de entrada,
regla y propuesta; no cambia los lectores ni hashes existentes.

```text
{
  version:'own-area-presentismo107-input.v1', periodMonth:'YYYY-MM-01',
  subject:{tenantId,sourceBindingId,contractId,identityToken,agreementCode,
    area:{organizationUnitSourceId,sectorSourceId}},
  policy:null | {id,revision,sha256,ruleVersion,status,approvalId,
    scope:{tenantId,sourceBindingId,area,agreementCodes},validFrom,validUntil},
  cut:{id,sha256,from,to,complete},
  incidences107:{quantity,origin:'additional_declared_107_excluding_101' | 'unresolved',
    evidenceRefs:[{id,sha256}]},
  absence101Days:{quantity,origin:'declared_whole_unjustified_days_101' | 'unresolved',
    evidenceRefs:[{id,sha256}]},
  tardiness:{unconvertedCount,evidenceRefs:[{id,sha256}]}
}
```

Todas las claves son obligatorias y se rechazan claves ajenas. Cantidades: texto
canónico de entero no negativo, hasta 18 dígitos, o `null` para desconocido explícito.
No se admiten números de JavaScript, fracciones, signos, espacios, ceros iniciales
ni notación exponencial. La suma usa enteros exactos; los valores originales no se
recortan al tope. `null` bloquea y nunca se transforma en cero. El límite de longitud
es de representación, no una cantidad autorizada de incidencias. Una cantidad de
días de 101 superior a los días civiles del mes o del corte parcial es incoherente para un contrato:
se conserva el original, pero bloquea y no genera suma ni mínimo conocido. Esta
validación no define días laborables ni deduce un calendario de trabajo.

UUID canónicos no nulos y hashes SHA-256 minúsculos identifican referencias; no son
credenciales ni una verificación de los bytes. `identityToken` también es SHA-256.
Área y convenio son identificadores canónicos opacos. Cada referencia pertenece al
componente en el que se declara, dentro del sujeto y corte de la entrada. Sus IDs
deben identificar incidencias o conjuntos disjuntos; un archivo compartido que
contenga distintos hechos necesita referencias separadas certificadas por la fuente.
Repetir un ID entre componentes bloquea; repetirlo dentro del mismo componente es
entrada inválida. El módulo no intenta reconstruir, resolver ni deduplicar evidencia.
Un componente positivo requiere al menos una referencia, y `origin:'unresolved'`
bloquea aun cuando haya referencias.

La política debe indicar `status:'approved'`, UUID de aprobación, revisión positiva,
hash y versión exacta de la regla. Su alcance debe coincidir con tenant, binding,
organización, sector y convenio del sujeto. La vigencia debe cubrir el mes entero.
`validFrom:null` significa vigencia pendiente y bloquea. `validUntil:null` sólo
representa una vigencia abierta declarada en la política aprobada suministrada;
omitir el campo es inválido. Una lista vacía de convenios no habilita todos.

El corte debe cubrir el mes calendario completo y declarar `complete:true`. Una
entrada diaria o parcial no produce una propuesta mensual: el resumen diario T4
prepara incidencias y cobertura, y deberá componerlas bajo su propio contrato antes
de esta evaluación. Ningún resultado de este módulo certifica cobertura.

| Resultado de la evaluación | Significado |
| --- | --- |
| `uncappedQuantity` | Suma exacta de los componentes explícitos y disjuntos, sin tope; `null` si no puede establecerse. No incluye tardanzas sin conversión. |
| `knownQuantity107` | Mínimo conocido, limitado a 3. Un valor positivo puede conservarse en un corte parcial o bloqueado, sólo como evidencia. |
| `knownQuantity107:'0'` | Sólo con mes completo, corte declarado completo, ambos componentes explícitamente en cero y `unconvertedCount:'0'`. Nunca se infiere de datos ausentes. |
| `proposedQuantity` | Cantidad de propuesta, sólo si no hay bloqueos. `0` implica pérdida de presentismo propuesta de 0 %; `1/2/3` implica 33/50/100 %. |
| `presentismoLossPercent` | Porcentaje asociado exclusivamente a la propuesta; `null` cuando `proposedQuantity` es `null`. |
| `authorizedQuantity` | Siempre `null`: la función no aprueba novedades. |

La salida `own-area-presentismo107-proposal.v1` conserva sujeto, política, corte,
componentes y referencias como copias inmutables, además de `appliedCap:'3'`, versión
de regla, vínculo de la decisión y lista de bloqueos. `sourceAuthenticityVerified`,
`policyAuthorizationVerified`, `coverageCertified`, `payrollEligible`,
`payrollCalculated`, `payrollPosted` y `grhMutation` permanecen en `false`;
`baseSalaryDiscount` permanece en `null`. `status:'proposed'` sólo expresa que el
contrato suministrado pasó los gates de esta función pura. La futura fachada
acotada del servidor deberá verificar origen, aprobación y cobertura antes de
preparar el lote. El cliente no puede usar esa etiqueta como autorización.

Bloqueos explícitos: política ausente, no aprobada, versión distinta, alcance
incompatible, vigencia pendiente o que no cubre el mes; corte parcial/incompleto;
composición no resuelta o evidencia compartida; cantidades desconocidas o evidencia
faltante para componentes positivos; días 101 imposibles para el mes o corte; tardanzas
pendientes de conversión. Una forma inválida arroja
`OWN_AREA_PRESENTISMO107_INPUT_INVALID` sin incluir datos de entrada en el error.
Los errores no se convierten en propuestas vacías.

### 1.2. Evidencia comparativa y pruebas sintéticas

Los agregados de GRH comunicados en
[6905911206](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6905911206)
incluyen 23 casos con 101 sin 107: 8 con presentismo completo, 10 prorrateados,
3 con otro comportamiento y 2 sin referencia. Esos antecedentes sirven para
identificar diferencias esperadas; no sustituyen la decisión nueva ni autorizan
replicar un prorrateo de días. Los datos de dimensión comunicados en
[6902753988](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6902753988)
tampoco definen factores para 44/95 o tardanzas.

[Fixtures inventados](../tests/fixtures/own-area-presentismo107-synthetic.js) y
[pruebas focales](../tests/own-area-presentismo107.test.js) cubren la suma y escala,
saturación sin perder los originales, comparación con completo/prorrateo, cero
explícito, falta de datos, tardanzas sin factor aun con mínimo 3, fracciones
rechazadas, composición ambigua, evidencia duplicada, alcance, aprobación, vigencia,
meses de distinta duración y resultado sin efecto salarial. Fechas, IDs y
aprobaciones de los fixtures son inventados; no autorizan un período municipal.
No se consultaron ni incorporaron documentos o filas municipales.

```sh
node --test tests/own-area-presentismo107.test.js
```

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
round-trip, respuesta incierta recuperada con la misma clave. Sólo la regla pura de
107 y sus pruebas sintéticas de §1.1–1.2 están implementadas en esta actualización.
El circuito de área, su autenticación, fachadas, acuerdos, TXT y aprobación siguen
siendo gates de implementación; estas pruebas no los certifican. El motor económico,
programa mensual instalado, modelo anterior de tardanzas y batch v1 quedan intactos.

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
