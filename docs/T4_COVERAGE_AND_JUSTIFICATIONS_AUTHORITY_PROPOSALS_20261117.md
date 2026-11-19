# Propuestas T4 pendientes de decisión — borrador 17/11/2026

Estado: **sólo diseño**. No es migración, no crea tablas, no concede capacidades y no debe instalarse sin decisión explícita de Marcelo y revisión/instalación de Codex.

## C. Fuente explícita de cobertura por contrato, dispositivo e intervalo

### Objetivo

Conservar evidencia declarativa de qué dispositivos deben cubrir qué contratos, en qué sede y durante qué intervalo. Esta declaración no prueba por sí sola que el dispositivo haya transmitido; el productor T4 debe contrastarla con capturas/recibos íntegros del mismo corte.

### Modelo propuesto

Entidad lógica inmutable attendance_coverage_declaration:

- id, tenant_id, source_binding_id, site_id.
- contract_id, device_id.
- valid_from, valid_until (intervalo civil inclusivo, zona horaria heredada de la sede).
- status: pending, approved, rejected, retired.
- revision, supersedes_id, payload_sha256.
- Proponente: actor_membership_id, actor_person_id, actor_session_id, actor_session_version, recorded_at.
- Revisor: mismos campos de identidad/sesión y decided_at; nunca puede coincidir con el proponente.
- reason_code cerrado; no incluir notas libres ni datos de empleados.

Una propuesta agrupa un conjunto completo de filas bajo proposal_id y un hash canónico. Las decisiones son eventos append-only. Una aprobación cubre exactamente el payload revisado; cualquier modificación requiere nueva propuesta y segunda aprobación.

### Reglas de integridad

1. Contrato y dispositivo pertenecen al mismo tenant y sede; contrato pertenece al área durante todo el intervalo según historia acreditada.
2. No se permite solapamiento aprobado para el mismo contrato/dispositivo cuando genere ambigüedad; los reemplazos requieren retiro efectivo explícito y nueva revisión.
3. El proponente no puede aprobar ni retirar su propia declaración.
4. La aprobación vuelve a validar identidad nativa, permisos, scope, sesión, versión, historial contractual, inventario del dispositivo y conflictos temporales bajo bloqueo transaccional.
5. La declaración aprobada no equivale a recepción completa: coverage.status sólo puede ser confirmed si la evidencia del gateway demuestra todos los dispositivos y contratos esperados en el intervalo y en el mismo sourceRevision.
6. Sin evidencia de recepción, el resultado permanece A confirmar; no se generan ausencias, descuentos, notificaciones ni cantidades 101/107.

### Capacidades sugeridas (nombres tentativos)

- attendance.coverage.propose
- attendance.coverage.approve
- attendance.coverage.read

Cada capacidad requiere scope explícito por área y sede. El permiso de lectura no permite proponer ni decidir. No se hereda de attendance.area.read.

### Preguntas para decisión

- ¿La cobertura se declara por contrato+dispositivo o por grupo de contratos/dispositivos con filas expandidas e inmutables?
- ¿El intervalo se administra por día o por fechas efectivas inclusivas?
- ¿Quiénes serán los dos perfiles municipales habilitados para proponer y aprobar?

## D. Lectura acotada del estado de justificaciones por área

### Objetivo

Permitir que T4 y la campanita conozcan sólo el estado agregado de justificaciones de un área/día, sin revelar motivos, notas, adjuntos, nombres, legajos ni identidad del solicitante.

### Condición de autoridad

La lectura debe pasar por native_leave_authorized_v1 y conservar sus comprobaciones de sesión, binding, tenant, identidad nativa, capacidad y alcance. attendance.area.read por sí sola no autoriza leer licencias. No se debe consultar native_leave_event directamente desde el runtime ni crear una ruta alternativa que evite el helper.

### Proyección mínima propuesta

Por área+día+corte:
- status: confirmed, a_confirmar o blocked.
- counts: approved, pending, rejected, unavailable (enteros no negativos; unavailable cuando no se puede demostrar el total).
- sourceRevision, generatedAt, componentSha256.
- blockerCodes: códigos cerrados, sin texto libre.
- coverageComplete: booleano.

No devolver contractId, personId, registrationId, reason, payload, evidence, actor, owner, notes, attachments ni identificadores de evento.

### Propuesta de capacidad

attendance.area.justifications.status.read, con scope exacto de área y sólo para la proyección agregada. La función invoca internamente native_leave_authorized_v1 para cada lectura y falla cerrada si la autoridad no se confirma. No concede permisos de lectura de detalle ni de gestión de licencias.

### No incluido

No se propone capacidad de aprobar, rechazar, consultar fundamentos, abrir adjuntos ni cambiar estados. El detalle sigue en el circuito nativo de licencias y sus permisos propios.

## E. Quién ve la campanita diaria de asistencia (jefes de área)

### Qué exigía antes de la decisión (hasta `f6c2c354`)
La lectura diaria (`/api/internal-attendance-daily-notice`) arma el corte con la 240, que lee el catálogo horario. Por eso
una cuenta necesita, todas juntas: `attendance.area.read` (con sus áreas), `time.catalog.read`, `workforce.employee.read`,
autoridad operativa y **un vínculo laboral activo** propio (lo exige `time_catalog_assert_actor_authority_v1`). Si falta
algo de la cuenta, la lectura responde 403 con el motivo y la campanita no reintenta (`88b63714`, `59945a79`).

### Opción A — dar los permisos que faltan
- Asignar `time.catalog.read` y `workforce.employee.read` al rol de jefe de área y verificar su vínculo laboral activo.
- Sin código ni SQL nuevos: funciona apenas se publique la integración y se instalen 240 y 241.
- Contra: `workforce.employee.read` es de todo el municipio; el jefe de área también podría consultar legajos fuera de su
  área en otros módulos.

### Opción B — lectura acotada al área (recomendada)
- Una función nueva que, con la autoridad de `attendance.area.read` y sólo para los contratos de las áreas del jefe,
  devuelva las asignaciones horarias aprobadas que necesita el corte. El jefe no recibe permisos generales nuevos.
- Contra: es autoridad nueva sobre el catálogo; requiere diseño, SQL, revisión de Codex e instalación. Unos días.
- Hasta tenerla, la campanita diaria la ven sólo las cuentas que ya cumplen A (por ejemplo, Recursos Humanos).

### Decisión de Marcelo (18/11/2026): B
Elegida «B: solo su área». Implementada en la rama `claude/t4-campanita-b-20261117`:
- La 240 toma su autoridad **sólo** de `attendance_area_workdays_read_v1` (scope de área de `attendance.area.read`).
  Ya no llama a `time_catalog_assert_actor_authority_v1` ni a la vista de asignaciones v2, así que no exige
  `time.catalog.read`, `workforce.employee.read` ni vínculo laboral propio.
- Lee asignaciones aprobadas y vigentes del día **sólo** para los contratos de la población del área
  (`time_assignment_spec.employment_contract_id` unido a `population.contracts`), del vínculo GRH certificado.
- Proyección mínima del destino: `{contractId, legajo, name: null}`; el legajo sale de
  `employment_contract.legacy_legajo` y si no es un legajo válido el catálogo queda `complete:false` (la campanita
  muestra «a confirmar», nunca un cero). Turno, calendario y perfil de reglas van como snapshot del catálogo.
- La API y la campanita piden sólo `attendance.area.read`.
- Probado en PostgreSQL 16 con stubs: contratos fuera del área, entradas propuestas y vencidas quedan afuera; un
  legajo inválido deja `complete:false`.
- Pendiente: revisión de Codex de este cambio de autoridad e instalación junto con la composición de la 240.

## Decisión y despliegue

C y D son propuestas para revisión municipal. No están aprobadas, no crean autoridad y no forman parte de una instalación. E quedó decidida (B, arriba) y espera revisión de Codex antes de instalarse. Codex debe revisar dependencias, seguridad, SQL y grants después de la decisión explícita de Marcelo.
