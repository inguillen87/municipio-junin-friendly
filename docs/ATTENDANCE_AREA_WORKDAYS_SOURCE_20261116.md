# Fuente candidata de jornadas por área

Entrega de código sobre PR296 `ad0d80d989b736dee52a0102ef3200b8905b65b2`. La derivación sólo escribe archivos; no consulta ni ejecuta SQL. `NoeliaReady=false`.

## Fachada y autorización

Firma propuesta: `attendance_area_workdays_read_v1(p jsonb, q jsonb)`.

`q` admite exclusivamente `resource:'day'`, el área exacta `{organizationUnitSourceId,sectorSourceId}`, fecha civil `day`, sede `site` y `snapshot` nulo o UUID. La sesión se verifica con `attendance_area_context_v1(p,'attendance.area.read')` y el área con `attendance_area_assert_scope_v1`. No se concede acceso mediante el permiso global `attendance.read` y no se llama a la lectura global para filtrar después.

Una única sentencia `WITH` materializa población, declaraciones de dispositivos, integridad cruda, vínculos de identidad y eventos. Los helpers privados de población, historia y dispositivos efectivos deben permanecer `STABLE`; sus lecturas comparten el snapshot de esa sentencia.

## Selección histórica en el servidor

La población acreditada por contrato y día entra antes de proyectar identidades. Cada marca requiere coincidencia exacta de UUID entre el canonical punch, el mapa de identidad vigente y un integrante de esa población, con tenant/dispositivo/sede/instante coincidentes y sin mapa solapado. Se sustituyó el filtro histórico exclusivamente GRH por la pertenencia nativa probada; no se crea ningún puente por legajo, DNI o CUIL.

Los eventos de contexto abarcan día anterior y siguiente. Se vuelve a resolver la pertenencia histórica para la fecha civil de cada evento, agrupada por contrato y fecha para no repetir el mismo trabajo por cada marca. Sólo se unen nombres después de verificar esa área. No salen eventos de personas fuera del área, ambiguos, sin vínculo acreditado ni pseudónimos de una población global.

Si una marca ya atribuida a un integrante acreditado no puede ubicarse con una fecha civil consistente —por ejemplo, su hora local difiere del instante en la zona de la sede, incluso si esa fecha local cae fuera de la ventana—, una guarda privada sobre los candidatos del mismo corte bloquea con `ATTENDANCE_AREA_EVENT_DATE_UNPROVEN`. Los candidatos incoherentes no se eliminan antes de esa guarda; sólo fechas consistentes y dentro del contexto pasan al resolver histórico. No se transporta la marca como observación sin identidad/fecha acreditada ni se descarta para aparentar un día vacío. En una respuesta exitosa `observations` queda vacío y `recordCount` coincide con la cantidad de eventos.

Una población incompleta conserva los integrantes que sí están acreditados y mantiene el bloqueo correspondiente. El productor no declara población completa por el mero hecho de que no se hayan encontrado marcas.

## Qué conserva la derivación

La fuente original es `scripts/candidates/attendance-clock-workday-source-v3.sql.txt`, SHA-256 `b8245352b46ac7338244508b5efe5f8e10d4ea24f77565d8d61172b8dad5a383`. La derivación exige esos bytes exactos y falla ante cualquier deriva.

Se conservan los controles de manifiesto y 40 bytes por registro, continuidad de ordinales, integridad de capturas históricas, proyección de todos los registros confirmados, conflictos entre fuentes, deduplicación por dispositivo y hash de bytes exactos, reglas `declared-intervals.v2` y forma del payload v3. El límite técnico del contexto crudo se conserva como impedimento privado.

Los contadores públicos de eventos/observaciones y colección se calculan sobre los registros autorizados. Los contadores de captura/recibo indican las fuentes que efectivamente contribuyeron al subconjunto deduplicado. La revisión incorpora sólo ese subconjunto, su población y sus declaraciones; no incorpora hashes o contadores globales de capturas/recibos ajenos. Un error privado de integridad puede bloquear la lectura, pero no revela esos contadores.

## Dispositivos esperados

`attendance_expected_devices_effective_v1(ctx,contractId,day)` se evalúa dentro de la misma sentencia. Cada resultado conserva sus impedimentos y se amplía con `expectedDeviceKeys` y `deviceKeyNamespace:'clock-device-v2'`.

La relación de claves es exacta: el `device_id` que usa la fuente v3 es el UUID de `attendance_device` del inventario022. Su clave es SHA-256 de `clock-device-v2:<tenant UUID>:<device UUID>`. La nueva fuente calcula esa misma expresión directamente desde `expectedDeviceIds` de la declaración aprobada; no la deduce de marcas observadas.

`expectedDevices.complete` exige población completa y todas las declaraciones resueltas. Eso acredita la declaración de lo esperado, no la recolección del día. La salida conserva siempre `PERIOD_COVERAGE_UNCONFIRMED`, `coverageCertified:false`, `installationReady:false`, `payrollPosted:false` y `NoeliaReady:false`. No calcula faltas, presentismo ni horas pagables.

## Reproducción y pruebas

```sh
node scripts/build-attendance-area-workdays-candidate.mjs --check
node --test tests/attendance-area-workdays-source.test.js
```

Sin `--check`, el derivador vuelve a escribir solamente la fuente candidata y su manifest en el repositorio. El manifest fija SHA de origen y resultado, dependencias, forma de la clave de dispositivo e invariantes conservadas.

Las pruebas comparan los segmentos retenidos con el original, fuerzan rechazo por deriva, comprueban filtrado y revalidación histórica antes de identidades, contadores y revisión del subconjunto, origen exacto de claves de dispositivos, corte único y bloqueo de cobertura.

No se realizó validación PostgreSQL en esta entrega. La fuente inicia con un `RAISE EXCEPTION` incondicional, termina con `ROLLBACK` y revoca ejecución al runtime y a `PUBLIC`. Una composición revisada deberá decidir expresamente el grant de la fachada y conservar privados todos los helpers. La revisión SQL aislada corresponde a Claude y la instalación autorizada a Codex.
