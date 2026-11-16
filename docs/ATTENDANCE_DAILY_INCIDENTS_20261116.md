# T4: resumen diario de observaciones y proyección para la campana

Estado: **código candidato y fixtures sintéticos; sin lector operativo, SQL ejecutado ni instalación**. Base de código: PR292, `a122d1c094c6a39cbd680c6de060ae9d6a733ef3`.

## Resultado de esta unidad

`evaluateAttendanceDailyIncidents(input)` reúne una fuente completa de jornadas v3, población explícita, asignaciones y dependencias del catálogo116, cobertura y justificaciones. Produce un resumen versionado de un área, un punto y un día civil. `projectAttendanceDailyNoticeSource(result)` elimina las filas y todas las identidades antes de la presentación.

La campana admite ahora una tercera clase opcional: **Asistencia diaria**. Muestra conteos observados, bloqueos y valores **A confirmar**, con enlace a `/relojes`. Una observación de asistencia no suma propuestas pendientes de aprobación ni decisiones sobre trámites. No se añadió ningún lector a `PENDING_BELL_READERS`, endpoint, consulta, permiso o envío programado.

Este código no acredita que la fuente exista en producción. El contrato de entrada expresa lo que un productor autorizado deberá entregar; los ejemplos completos son exclusivamente sintéticos.

## Contrato de entrada

Versión: `attendance-daily-source.v1`. Se rechazan claves ajenas, páginas de UI, metadatos contradictorios y componentes cuya huella no corresponda.

| Campo | Contenido requerido |
|---|---|
| `scope` | UUID de tenant y binding, área `{organizationUnitSourceId,sectorSourceId}`, punto, día explícito y zona `America/Argentina/Mendoza`, igual al catálogo116. |
| `cut` | UUID, instante de corte igual a `workdays.generatedAt`, declaración `single_snapshot` o `unconfirmed`, referencia de evidencia y SHA-256 canónico de los cinco componentes completos. |
| `workdays` | `clock-workday-source.v3` completo, con día/contexto/revisión originales. El nuevo wrapper puro reutiliza la validación del lector v3 antes de reconstruir todos los eventos. |
| `population` | Completitud, evidencia y lista sin duplicados de contratos del área. Cada miembro conserva área, vínculo temporal explícito y dispositivos esperados. |
| `catalog` | Completitud y asignaciones `{record,assignment}` con los contratos existentes de `timeCatalogRecord` y `timeCatalogAssignment`. No se suman páginas del catálogo. |
| `coverage` | Estado explícito, evidencia, revisión de jornadas, intervalo cubierto y listas de contratos/dispositivos cubiertos. |
| `justifications` | Completitud, evidencia y entradas explícitas aprobadas/pendientes/rechazadas, con contrato, intervalo y referencia de evidencia. |

Las huellas canónicas comprueban la correspondencia de los **bytes suministrados**. No son firmas, permisos ni prueba de una lectura real en una sola transacción. `consistency:'single_snapshot'`, una referencia y un estado de aprobación recibidos como datos tampoco autentican al emisor. La salida conserva `authorizationVerified:false` y `productionReady:false`.

### Identidad y ámbito

El UUID de v3 sigue siendo el contrato histórico resuelto por la fuente original. No se une por nombre, persona, legajo, dispositivo o posición de fila.

Cada miembro debe aportar `identityBinding` con estado confirmado, binding exacto, UUID histórico, UUID de catálogo, vigencia y evidencia. Esta primera versión exige que ambos UUID coincidan exactamente con el miembro. Una correspondencia entre UUID distintos queda bloqueada; no se inventa un puente de adopción.

Una marca ajena o sin UUID contamina conservadoramente el corte completo con `OUT_OF_SCOPE_EVENTS`. Una observación sin ubicación bloquea comparaciones. Se validan todas las filas del contexto antes de cualquier proyección. La proyección de campana nunca contiene nombre, legajo, contrato, tenant, evento, fundamento libre ni referencia de evidencia.

### Población y cobertura

`workdays.collection.sourceComplete:true` significa que la lectura de lo disponible terminó; **no certifica que se hayan recibido todas las marcaciones esperadas**. Las banderas originales de cobertura y homologación v3 permanecen intactas.

Para comparar un contrato se requieren dispositivos esperados explícitos y no vacíos, cobertura de todos ellos y del contrato, y ausencia de eventos en dispositivos ajenos a esa declaración. Una lista de dispositivos vacía nunca demuestra que no hubo marcaciones.

El intervalo cubierto debe comenzar como máximo al inicio civil del día y extenderse hasta su cierre: el mayor entre el fin civil del día y el fin del turno, más la demora explícita aprobada. El instante del corte también debe superar ese cierre. No se usa la zona del host ni un offset UTC fijo. Un límite civil ambiguo o inexistente se bloquea.

Población, catálogo, justificaciones o corte conjunto incompletos mantienen las comparaciones desconocidas. Los conteos agregados desconocidos se conservan como `null`; incluso una población vacía no permite que un bloqueo global se oculte como cero.

## Horarios y parámetros: sin valores por defecto

Asignación, turno, calendario y perfil deben estar aprobados, tener decisión y cubrir el día. Las revisiones vinculadas deben coincidir. Más de una asignación candidata vigente bloquea; no se elige la primera. El calendario debe declarar el día. Los días especiales requieren una regla adicional.

La primera regla de observación propuesta es limitada: un solo intervalo `work` para el día de la semana, sin pausas ni guardias. El perfil aprobado debe declarar **ambos** parámetros:

| Clave | Forma exacta | Semántica propuesta |
|---|---|---|
| `attendance.daily_observation_rule` | `valueKind:'code'`, `unitCode:'rule'`, `codeValue:'single_work_interval.v1'` | Comparar el único intervalo ordinario observado con el único tramo laboral declarado. |
| `attendance.daily_close_delay_seconds` | `valueKind:'integer'`, `unitCode:'seconds'`, entero textual canónico entre0 y172800 | Demora explícita de cierre; el máximo es una cota técnica de esta versión, no un valor municipal aprobado. |

El cero del fixture es una declaración **sintética**, no un valor por defecto ni una aprobación para Hugo. La falta de cualquiera de estos parámetros, su forma incorrecta o una versión desconocida bloquea. No se infiere horario desde medianas, jornadas mensuales, horas diarias, convenio o historial de fichadas.

La tolerancia procede exclusivamente del turno aprobado. `lateSeconds` expresa segundos posteriores al comienzo más esa tolerancia. No redondea ni convierte tiempo a unidades de descuento. Varias entradas ordinarias, pausas observadas o declaradas, guardias y turnos partidos se bloquean en esta versión. La incidencia nocturna existente de v3 también requiere revisión: no se homologa por coincidir con una asignación.

Varios flujos o dispositivos de un contrato no se fusionan. Se conservan las observaciones por dispositivo; los segundos agregados del contrato quedan `null` para evitar sumar dos veces el mismo tiempo.

## Significado de los resultados

- **Marcaciones faltantes** es una observación técnica de un turno esperado sin eventos y con el corte/cobertura exigidos. No significa inasistencia injustificada. Una licencia aprobada puede coexistir con esa observación y se conserva aparte como `approved_covering_shift`.
- **Llegadas tardías observadas** usa exclusivamente el horario y la tolerancia declarados. Si hay tardanza, `TARDINESS_CONVERSION_UNCONFIRMED` mantiene pendiente su eventual traducción al parte.
- **Tiempo extra observado** procede de intervalos declarados por las marcas. `EXTRA_CONVERSION_UNCONFIRMED` impide tratarlo como44,95, tiempo pagable o importe.
- `absence101Days`, `quantity107`, `payableSeconds` y `amountArs` permanecen siempre `null`. La regla mensual107 de PR294 es otra unidad; no se alimenta con un solo día ni con ausencia inferida de marcas.
- Todas las salidas conservan `coverageCertified:false`, `approvalStatus:'not_approved'`, `payrollEligible:false`, `payrollCalculated:false`, `payrollPosted:false` y `notificationsSent:false`.

Los datos agregados de GRH comunicados en [6902753988](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6902753988) y [6905911206](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6905911206) orientaron los casos de prueba y los límites de alcance. No se extrajo de ellos un factor de tardanzas ni una conversión44/95. No se leyó el respaldo municipal.

## Adaptador de campana

`attendanceDailyNotice(source)` valida `attendance-daily-notice-source.v1`. Sólo permite ocho conteos, fecha, clave opaca, estado, motivos fijos y las tres banderas conservadoras. La UI muestra desconocidos como **A confirmar** y explicita **Observación técnica sin aprobación salarial**.

`bellState(sources, seenKeys, circuitReads, dailySources)` acepta el nuevo cuarto argumento opcional. `mountPendingBell` admite `dailySources` en la respuesta del lector existente, sin agregar consultas. Avisos idénticos con una misma clave se cuentan una vez; la misma clave con datos contradictorios queda en `failed`. Los avisos diarios no se guardan como decisiones vistas.

La clave vincula el corte completo. El productor futuro debe entregar sólo el corte vigente por día/ámbito autorizado, sin acumular versiones viejas en el array. La minimización no sustituye la autorización del destinatario: no se reconoce a Hugo por su nombre ni se le conceden capacidades globales.

## Verificación

Fixtures construidos desde cero, sin identificadores ni documentos municipales. El evaluador tiene20 pruebas: cobertura incompleta/vacía, dispositivos esperados, cut/hash, scope/identidad, parámetros ausentes, microsegundos SQL, fechas imposibles, doble flujo, ausencia de marcas, pausas, justificaciones y proyección mínima.

```sh
node --test tests/attendance-daily-incidents.test.js tests/attendance-daily-notice.test.js tests/pending-bell.test.js tests/pending-bell-mount.test.js tests/build-published-imports.test.js tests/continuous-workdays-v3-identity.test.js tests/continuous-workdays-v3-api.test.js
```

Resultado integrado: **87/87**, cero fallos y cero omitidas; `git diff --check` limpio. No se instaló `playwright`, ejecutó un navegador ni compiló PostgreSQL. La presentación se verificó con DOM sintético; la revisión visual en sandbox queda a cargo de Claude.

La revisión independiente detectó y cerró tres defectos antes de la entrega: cobertura vacía sin dispositivos esperados, rechazo de timestamps SQL con fracciones y pausas observadas que pasaban como jornadas cerradas. También se cerraron los conteos vacuos y la exigencia del vínculo antes de declarar un contrato esperado.

## Siguiente habilitación, todavía pendiente

Falta implementar y verificar un **productor de corte conjunto por área**, con sesión/capacidad propia, autorización de ámbito repetida en SQL, origen completo, asignación/identidad temporal y cobertura acreditadas. Los lectores actuales del catálogo116 usan permisos globales y no se reutilizan para dar ese acceso a Hugo. Los permisos por área de licencias tampoco autorizan asistencia por transitividad.

Después deben aprobarse los parámetros municipales que correspondan, cerrar composición/instalación del lector v3 y del productor, y conectar una lectura mínima a la campana. Esta entrega deja el evaluador y la presentación preparados y ensayables; **no activa una notificación diaria ni convierte declaraciones de fixtures en autorización operativa**.

Codex conserva instalación y producción. NoeliaReady=false.
