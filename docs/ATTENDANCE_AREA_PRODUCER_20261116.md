# Productor de asistencia por área — entrega de código del 16/11/2026

Base de trabajo: PR296, `ad0d80d989b736dee52a0102ef3200b8905b65b2`.
Pedido de Claude de las 15:55 ART: padrón declarado, fachada por área y pertenencia histórica.

## Alcance implementado

| Punto | Implementación | Límite que conserva |
| --- | --- | --- |
| (a) Padrón | Modelo, pantalla `/asistencia-dispositivos`, API y fuente SQL candidata. Declaración por contrato/área/rango, revisión por otra persona, historial y retiro fechado. | Una declaración no prueba cobertura de recepción. |
| (b) Lectura por área | API GET y fachada SQL derivada de los bytes originales de jornadas v3. Población, marcaciones, nombres, contadores y revisión limitados en el servidor. | Las marcas sin identidad o fecha acreditable no se convierten en asistencia confirmada. |
| (c) Pertenencia histórica | Resolver puro y helper SQL privado con procedencia de alta, cadena aprobada de rectificaciones y períodos laborales. | Cambios de área sin fecha efectiva, adopción GRH o falta de evidencia bloquean. |

Código y fixtures de esta entrega son públicos y sintéticos. No se consultaron bases remotas, credenciales, documentos municipales ni respaldos. No se ejecutó SQL, CI, instalación, despliegue o recuperación de equipos. `NoeliaReady=false`.

## Padrón: qué puede hacer RRHH

Se elige un área de la fuente autorizada, un inicio y un fin explícitos. La lectura devuelve contratos cuya pertenencia está probada durante todo ese intervalo y dispositivos del inventario técnico. Se declara un conjunto no vacío; la aplicación nunca lo deduce de marcas recibidas.

La propuesta queda inmutable. Otra persona con la capacidad y el alcance correspondientes aprueba o rechaza la versión examinada. El servidor compara persona y membresía, no sólo usuario de interfaz. Al aprobar vuelve a verificar historia, catálogo, versiones y ausencia de superposición con otra declaración aprobada.

El retiro es una decisión del revisor habilitado, distinto del proponente original. Requiere una fecha efectiva explícita: conserva el rango original y deja de ser aplicable desde esa fecha. No borra las fechas anteriores ni la decisión de aprobación.

Cada fila muestra el nombre autorizado de repartición/sector. El catálogo de área identifica cada componente; no se usa para inventar una relación entre sector y repartición. Esa relación requiere el alcance explícito y la historia del contrato.

### Población incompleta y cargas individuales

Un contrato acreditado puede recibir su declaración aunque otros contratos de la compañía tengan historia sin resolver. La pantalla explica que sólo muestra los contratos demostrados. `choices.complete=false` conserva ese impedimento: **no permite afirmar que la población del área esté completa ni calcular sus ausencias**.

El control privado también contempla los registros GRH de la base/empresa publicada aunque su `tenant_id` sea nulo. No devuelve sus identidades ni infiere su área actual para resolver la historia faltante. Si se supera el límite técnico de población, no entrega una lista truncada utilizable.

Un contrato cuyo historial completo demuestra `AREA_HISTORY_RANGE_NOT_ACTIVE` se excluye de la selección para todo el rango solicitado. En la fachada diaria `from=until`: sólo allí significa que no está activo ese día. Para intervalos largos no significa que nunca haya trabajado durante parte del período.

### Recuperación de intentos

La clave y el cuerpo del intento quedan congelados ante una respuesta incierta. La recuperación consulta el recibo conservado antes de ofrecer el mismo envío. El recibo vincula cuerpo, clave, resultado, versión y contexto; su SHA es la huella calculada en PostgreSQL, no un checksum que el navegador afirme haber recalculado.

No se reintenta bajo otra persona, sesión, tenant, binding o alcance. Un `found:false` no autoriza descartar una transmisión incierta: el POST podría seguir en curso. Un rechazo atómico conocido del primer envío permite corregir únicamente después de releer el acceso y las fuentes. Un 409 posterior a una transmisión incierta conserva el intento.

## Autoridad por área

Las capacidades nuevas son `attendance.area.read`, `attendance.area.devices.propose`, `attendance.area.devices.approve` y `attendance.area.devices.audit.read`. Cada una necesita un registro explícito de alcance en `attendance_area_scope`, además de la capacidad IAM efectiva. `sectorSourceId:null` significa el área exacta sin sector; nunca toda la repartición.

No se heredan permisos de `leave.request.area.*`, de un nombre de rol ni de `attendance.read`. La pantalla tiene su propia ruta y no activa lectores globales. Las funciones verifican nuevamente la sesión administrada, MFA/recuperación vigente, membresía, versión certificada y binding verificado mediante las guardas existentes. El contexto y sus auxiliares son privados.

La escritura requiere el vínculo nativo verificado de la persona operadora. Una cuenta sin ese vínculo puede conservar lectura autorizada; no puede preparar ni decidir. No se crean cuentas, roles, grants, scopes, dispositivos ni declaraciones de Hugo/RRHH con esta entrega. **Instalar las definiciones por sí solo no configura esas autoridades.** Codex debe aplicar únicamente las asignaciones aprobadas en su carril operativo.

Las concesiones nuevas tienen versión y eventos de auditoría; las prohibiciones de UPDATE/DELETE/TRUNCATE impiden borrar los eventos. El token de alcance vincula sesión, persona, binding, empresa, base de origen, capacidades, todos los scopes y catálogo autorizado. El token detecta cambios; no concede autoridad.

## Fachada de lectura

`GET /api/internal-attendance-area` requiere `resource=day`, área JSON exacta, sede y día. El snapshot anterior es opcional para detectar que el corte cambió. No acepta identidad o tenant del cliente.

La fuente se deriva de `attendance-clock-workday-source-v3.sql.txt` con un derivador que exige su SHA original. Conserva las comprobaciones de integridad y deduplicación por bytes. Un único `WITH` reúne la población histórica, declaraciones vigentes, mapas, marcas y proyecciones. Los helpers de datos son `STABLE`; la sesión se comprueba antes y los datos comparten el mismo corte.

El contrato canónico debe coincidir exactamente con la población autorizada. La fecha de cada evento del contexto también debe tener pertenencia probada al área. No se usan nombre, DNI, legajo ni proximidad temporal como puente de identidades. Los nombres sólo se proyectan después de esas comprobaciones. Una incoherencia civil de una marca atribuida bloquea la lectura antes de devolverla.

La revisión, los contadores y la información de recepciones corresponden al subconjunto autorizado. El validador API rechaza la respuesta completa si aparece otro contrato, otro contexto, un nombre/legajo que no coincide con el contrato demostrado, contadores globales o una clave de dispositivo incongruente. No filtra un resultado global en JavaScript para hacerlo pasar por una lectura de área.

Los `expectedDeviceIds` corresponden al inventario 022. La clave de jornadas se calcula con la fórmula exacta ya presente en v3: `SHA-256('clock-device-v2:' + tenantId + ':' + deviceId)`. Esto usa los mismos UUID de la fuente; no infiere dispositivos a partir de observaciones.

El máximo HTTP es 4 MiB. Un corte mayor falla con 413, sin entregar una población recortada. El límite privado de contexto crudo de la fuente original permanece en 25.000 registros; la población técnica permanece limitada a 2.000 candidatos.

## Historia: qué se puede y qué no se puede demostrar

El alta nativa aporta fecha inicial explícita, registro, catálogo y guardas de procedencia. Las rectificaciones aprobadas conservan snapshots antes/después y revisiones; los movimientos laborales tienen su propia fecha explícita. Se comprueban las cadenas completas y la separación entre autor y revisor.

Los escritores actuales 104/224 **no conservan fecha efectiva de cambio de área**. Si una cadena cambia repartición, sector o sus etiquetas históricas, el resolver devuelve `AREA_HISTORY_EFFECTIVITY_REQUIRED`. No convierte `reviewed_at` en vigencia. Tampoco convierte la fecha de adopción de un registro GRH ni una clasificación mensual en pertenencia diaria. Los casos insuficientes no llevan área de respaldo: `area:null`, `evidence:null` y motivo explícito.

El `subjectVersion` del padrón es el hash del **resultado histórico completo**, incluyendo intervalo y evidencia. Es distinto de `history.evidence.sourceVersion`, que identifica el recorte documental usado por ese resolver.

## Revisión y composición pendientes

Las cuatro fuentes candidatas empiezan con una excepción incondicional y terminan en `ROLLBACK`. **No son instaladores.** Sus manifiestos identifican bytes originales, funciones y dependencias, y declaran `sqlExecuted=false` y `sqlEngineValidated=false`.

Claude recibe código, comando reproducible y ruta de pantalla para revisar y probar en su sandbox, incluido Chromium a 320/390 px. Las pruebas DOM no sustituyen esa revisión visual. La validación de sintaxis PostgreSQL, privilegios reales, triggers, concurrencia y cierre de dependencias queda en el laboratorio autorizado antes de que Codex componga e instale. No se otorga EXECUTE automáticamente a ningún helper ni a las nuevas fachadas.

Los tres puntos entregan fuentes verificables para el productor por área. El cierre diario de T4 todavía debe componer las jornadas con las asignaciones/horarios aprobados, justificaciones y evidencia de cobertura del período, en un mismo corte. La fuente conserva `PERIOD_COVERAGE_UNCONFIRMED`; este cambio no habilita notificaciones, descuentos, horas pagables ni conversiones de tardanzas. Los parámetros pendientes siguen bloqueando. Producción y operación de relojes permanecen en el carril de Codex.

## Verificación reproducible

```sh
node --test tests/attendance-expected-devices-api.test.js tests/attendance-expected-devices-model.test.js tests/attendance-expected-devices-panel.test.js tests/attendance-expected-devices-sql.test.js tests/attendance-area-api.test.js tests/attendance-area-history.test.js tests/attendance-area-workdays-source.test.js tests/app-routes.test.js tests/internal-capability-gate-ux.test.js tests/build-published-imports.test.js
node scripts/build-attendance-area-authority-manifest.mjs --check
node scripts/build-attendance-expected-devices-source-manifest.mjs --check
node scripts/build-attendance-area-workdays-candidate.mjs --check
git diff --check
```

El comando ejecuta JavaScript con fixtures sintéticos, pruebas DOM y controles estáticos/reproducibles de fuentes; no ejecuta PostgreSQL.
