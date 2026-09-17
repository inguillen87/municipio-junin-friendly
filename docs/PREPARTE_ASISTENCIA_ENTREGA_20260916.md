# Preparte de asistencia a Novedades · 16/09/2026

## Alcance del incremento
Novedades incorpora una sección plegable para consultar el mes completo de Edificio Viejo / PM-10, revisar por legajo el tiempo extra reconstruido, declarar horas reconocidas y tope, generar un Excel y trasladar filas a la planilla existente. Usa la fuente continua ya implementada; no instala agentes ni cambia la configuración de relojes.

La consulta hace una sola lectura acotada del origen antes de agrupar y paginar. Un mes sin marcas no significa ausencia. Jornadas incompletas, solapamientos o identidades pendientes impiden proponer tiempo desde esas filas. El corte se vuelve a comprobar antes de exportar o transferir; una nueva recepción sin cambios sustantivos no invalida por sí sola la revisión.

## Reglas de preparación
- Tabla mensual aportada por Noelia como referencia, no como homologación normativa: sin conversión semanal ni interpolación automática.
- Horas ingresadas en HH:MM, no decimales; no pueden superar el tiempo extra reconstruido.
- Porcentajes 3–95 se proponen en el concepto 44; el 100% se propone en el 95 sólo con 120:00 horas reconocidas. Excepciones se tramitan por separado.
- Tope individual y documento de Personal obligatorios; nunca se supera el tope declarado. Este dato requiere revisión humana: no acredita que exista un tope registrado en un catálogo efectivo.
- La transferencia no inserta importe manual ni marca una novedad como forzada. Conserva el circuito normal de validación y creación de lote, y la revisión independiente.
- Una operación agrega todas las filas seleccionadas o ninguna; conserva las anteriores y reconoce alias numéricos con ceros iniciales para evitar duplicar 44/95 por legajo.
- La planilla queda vinculada al mes y tipo mensual hasta vaciarla o completar su creación. La referencia al período se verifica también al preparar el envío.

## Interfaz y permisos
Los filtros y la paginación no recortan el Excel ni borran decisiones. La actualización conserva sólo decisiones editadas/seleccionadas, no valores predeterminados de filas que se mostraron. Si cambian evidencias de una fila, se desmarca para revisión. No se utiliza almacenamiento persistente del navegador para datos personales.

El bootstrap de Novedades agrega `sourceFeatures.attendancePreparte` calculado desde el principal completo del servidor. No utiliza la proyección de permisos exclusiva de nómina para deducir permisos de asistencia. Este indicador habilita la interfaz, no autoriza por sí solo: el endpoint de consulta vuelve a exigir `attendance.read`, `workforce.employee.read` y `payroll.novelty.prepare`, sesión administrada y fuente certificada. No se asignan nuevos permisos a usuarios.

El Excel incluye Preparte, Control y Referencia; exporta todas las filas del corte con fecha y huella de evidencia. Nombres y observaciones se escriben como texto, no como fórmulas. Editar ese archivo no reimporta ni altera automáticamente datos de MuniControl.

## Verificación y publicación
`npm run build`; `verify-attendance-preparte-browser.mjs`; `verify-novelty-sheet-057.mjs`; `verify-continuous-workdays-browser.mjs`; `verify-native-employee-browser.mjs`. Los recorridos visuales interceptan las API con datos sintéticos, incluido el único envío de lote de prueba: no crean novedades municipales.
La verificación productiva reutiliza el runner de Novedades; compara JS/CSS y HTML compilado, exige denegación anónima real y recorre la interfaz publicada con respuestas sintéticas. Una prueba visual no certifica una operación con una sesión municipal real.

Reversión: revertir únicamente este commit de aplicación, sin deshacer trabajos concurrentes. No hay migraciones ni datos que restaurar. Permanecen pendientes liquidación autónoma completa, topes oficiales versionados, integración de otros puntos, tardanzas y ausencias con turnos y permisos homologados.
