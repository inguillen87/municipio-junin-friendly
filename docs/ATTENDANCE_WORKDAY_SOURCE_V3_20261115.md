# Jornadas v3: identidad laboral exacta del origen

Estado: **código prospectivo y fuente SQL candidata, no instalada**. Corte de desarrollo: 15/11/2026, sobre PR291 `113cc26590ec2eb89517a9854765b148b0355305`.

## Problema y alcance de esta unidad

La fuente 065 resuelve internamente el contrato de cada marca por su fecha, pero v2 publica sólo el legajo y un identificador de flujo. Unir ese legajo con el catálogo actual puede asignar una marca histórica a otro contrato. Esta unidad conserva el UUID exacto ya resuelto por 065, con su misma autoridad y ámbito, para poder construir después una unión temporal verificable.

**El UUID corresponde al contrato de la fuente GRH certificada que resuelve 065. No certifica una correspondencia con un contrato propio, una adopción ni una asignación del catálogo 116.** No se agregan orígenes ni uniones por legajo, nombre o semejanza. Dos relojes o flujos del mismo contrato siguen separados.

La extensión no incorpora horarios, calendarios, tolerancias, justificaciones, censo esperado ni reglas de pago. No conecta avisos diarios ni cambia la UI. El objetivo inmediato es cerrar el identificador que faltaba en la lectura de origen, conservando v2.

## Procedencia de la fuente

Base exacta: `scripts/migrations/065-clock-workday-source-continuous.sql`, 14.874 bytes, SHA-256:

```text
437c2df864bbf0bec9e31228bb9150a9f2a87cd7b246a0f69d4236e420ce73dc
```

Candidato: `scripts/candidates/attendance-clock-workday-source-v3.sql.txt`, 14.880 bytes, SHA-256:

```text
b8245352b46ac7338244508b5efe5f8e10d4ea24f77565d8d61172b8dad5a383
```

El candidato define otra fachada, `attendance_clock_workday_source_v3`, y termina en `ROLLBACK`. Es un documento de código para revisión y composición; no un instalador. La prueba documental fija la fuente 065 completa y demuestra que el cuerpo nuevo sólo introduce estas transformaciones:

1. Nombre y versión de fuente v3, con una revisión de origen de v3.
2. Un día obligatorio, sin elegir implícitamente la última marca; contexto del día anterior y posterior conservado.
3. `visible_contract_id`, sólo cuando la lectura nominal está autorizada y `identity_state='mapped'`.
4. `contractId` en el payload de eventos ubicables; ese payload participa del fingerprint.
5. Firma y grants ajustados a nueve argumentos.

Se preservan la sentencia única de lectura y su snapshot MVCC, sesión y binding, deduplicación por bytes, integridad de capturas/recepciones, control de mapas superpuestos, vigencia laboral en la fecha de la marca, límite de 25.000 registros y guardas de conflicto. La metadata sigue siendo PL/pgSQL, `SECURITY DEFINER`, `search_path=public,pg_temp`, revocación a `PUBLIC` y ejecución para `municontrol_actions_runtime_app`.

`eventRef`, `deviceKey`, `personKey`, `streamKey` y las reglas `declared-intervals.v2` conservan su significado. La revisión incorpora el namespace `clock-workday-source.v3` y el payload nuevo; una petición con un corte anterior incompatible debe recibir conflicto, nunca una respuesta de v2.

## Contrato de lectura

Recurso nuevo y explícito:

```text
GET /api/internal-attendance?resource=clock-workdays-v3&source=continuous&site=<punto>&day=YYYY-MM-DD
```

| Campo | Contrato |
| --- | --- |
| `source` | Debe ser `continuous`. |
| `site`, `day` | Ambos obligatorios; un punto y un día civil válido. |
| `snapshot` | Revisión v3 opcional para repetir el mismo corte. |
| `page`, `pageSize`, `search`, `status`, `cause` | Mismos límites y filtros de reconstrucción existentes; se aplican después de reconstruir el contexto completo. |
| `from`, `to`, `context`, `personRef`, `contractId`, `tenantId` | No se admiten en este recurso. No hay cambio de ámbito aportado por el cliente. |

La API reautoriza `attendance.read`, membresía municipal, sesión y binding certificados en cada petición. Rechaza parámetros ambiguos o un corte implícito antes de construir el cliente SQL. La fachada vuelve a verificar la autorización de lectura; `workforce.employee.read` gobierna la proyección nominal. No se exigen permisos de preparación o aprobación de nómina para leer jornadas.

La respuesta HTTP conserva el estilo de Asistencia: `{ok:true,...resultado}`, con `version:'clock-workdays.v3'`, caché privada y `no-store`. `filters.from` y `filters.to` coinciden con el día solicitado. No se publica el principal interno.

Cada fila reconstruida incorpora `contractId`. Debe ser un UUID canónico no nulo sólo para un flujo mapeado bajo lectura nominal; en lecturas seudónimas y estados `ambiguous`/`unmapped` es `null`. Las observaciones no ubicables conservan la forma v2, sin identidad de contrato.

`assertContinuousWorkdayIdentitiesV3` valida la identidad antes de retirar el campo en la proyección privada usada para los validadores v2. Exige un único UUID por flujo. El reconstructor v2 recibe los eventos originales sin la propiedad nueva; el wrapper agrega el UUID a la fila del mismo flujo. No combina dispositivos ni empalma una entrada y una salida pertenecientes a contratos distintos.

No existe fallback: si falta la fachada nueva, el recurso devuelve 503 `ATTENDANCE_WORKDAYS_V3_NOT_READY`. Los recursos anteriores conservan sus rutas y formatos.

## Límites de interpretación

Se mantienen `coverageCertified:false`, `periodCoverageCertified:false`, `automaticCollectorVerified:false`, `homologationStatus:'unverified'`, `approvalStatus:'not_approved'` y `payrollEligible:false`. El tiempo pagable sigue siendo `null`.

Los totales son de jornadas y tramos observados del corte; `extraSeconds` conserva la semántica de teclas declaradas de v2. No representa excedente contra un turno, autorización de horas extra o cantidad liquidable. Una respuesta sin marcas no implica ausencia, ni cero tardanzas o cero horas extra normativas.

El borrador T4 recibido de Claude y sus decisiones posteriores están en PR270, comentarios [6902189410](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6902189410) y [6902189629](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6902189629). Esta unidad no convierte sus propuestas `A CONFIRMAR` en reglas vigentes.

## Verificación y pendientes

Pruebas puras con fixtures íntegramente sintéticas: 17 casos de identidad/reconstrucción, 12 de API/lector y 2 de conservación documental del SQL. También pasan 67 casos existentes de v2 y contexto de persona. La comprobación documental no compila ni ejecuta PostgreSQL.

Comando conjunto reproducible:

```sh
node --test tests/continuous-workdays-v3-identity.test.js tests/continuous-workdays-v3-api.test.js tests/attendance-workday-source-v3-candidate.test.js tests/continuous-workdays-v2.test.js tests/workday-person-context.test.js
```

Quedan fuera de esta entrega: laboratorio SQL de la fachada, instalación y certificación de su entorno; resolución temporal de una asignación aprobada por UUID y día; correspondencia con contratos propios cuando corresponda; revisión conjunta de marcas y catálogo; población esperada y cobertura; conciliación completa de licencias/franquicias; reglas homologadas y aprobación de asistencia. Dos lecturas válidas por separado no acreditan un corte conjunto.

No se ejecutaron SQL, runners, CI, host, hardware, instalaciones ni operaciones municipales para producir esta entrega.
