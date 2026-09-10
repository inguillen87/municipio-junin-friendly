# Relojes: primera recepción operativa en MuniControl

## Entrega

Se agrega un espacio de consulta autenticada en `relojes-marcaciones.html`, enlazado con cada punto del mapa existente. Usa `GET /api/internal-attendance?resource=clock-operations` y la función `attendance_clock_operations_v1`. No existe un nuevo endpoint público nominal, ni datos de empleados en estos archivos.

- Período de hasta 93 días, punto y paginación acotada.
- Marcaciones, identidades observadas, vinculaciones y pendientes. No se calculan ausencias por falta de datos.
- Hora de captura, recepción en el sistema y última marcación interpretable separadas.
- Observaciones con fecha original, sin corrección automática de años.
- Nombres y legajos sujetos a `workforce.employee.read`, además de `attendance.read` y sesión/binding vigentes.
- CSV de la página visible, identificado como tal. No se presenta como exportación de todo el período.
- Refresco de CONSULTAS cada 60 segundos con página visible. No dispara descargas del reloj.

## Persistencia y límites

La migración 045 es aditiva. Conserva el binario original y su SHA-256 en tablas sin SELECT para el rol de aplicación. Las filas seudonimizadas conservan ordinal, secuencia de origen, fecha y códigos. Los eventos normalizados utilizan las tablas canónicas existentes, con revisión pendiente.

La primera carga es una operación de mantenimiento autorizada a partir de una descarga verificada. El conector de esa carga permanece suspendido: no se declara un agente automático activo. La función auxiliar owner-only empleada para el bootstrap no está expuesta a HTTP ni al rol de runtime.

`operator_snapshot` NO implica cobertura mensual, método biométrico certificado, jornada completa ni liquidación. Los códigos de dirección/verificación permanecen sin homologar. El registro de un empleado no puede emparejarse por nombre. El DNI sólo participa del cruce interno por fuente municipal, persona y contrato por fecha.

## Pruebas

`node --test tests/attendance-clock-operations.test.js tests/internal-attendance-api.test.js` verifica consultas parametrizadas, contexto municipal, rechazo de sesiones/queries inválidas, supresión de campos privados y compatibilidad de la API. Las pruebas de navegador utilizan exclusivamente fixtures sintéticas; no prueban MFA ni una sesión real de producción.

La integración de tres archivos existentes se genera de forma determinista con `scripts/integrate-clock-operations.mjs`, se prueba y se guarda en Git antes de promover el commit. El helper no usa datos ni credenciales. En producción el sitio utiliza los archivos ya integrados, no ejecuta el helper.

## Pendiente siguiente

Instalar el agente continuo en un host municipal con acceso al reloj y salida HTTPS. Mantener la credencial local, una conexión por equipo, reintentos acotados, cola persistente y heartbeat. Antes de habilitarlo, conciliar eventos USB/red y la identidad HMAC del bootstrap con el contrato de ingesta continuo. No llamar en vivo a una descarga histórica.

No se alteran fórmulas salariales, recibos, MFA, configuración del reloj ni la base municipal GRH.
