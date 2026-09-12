# Sprint 059 · recepción autónoma y monitor PM-10

## Alcance
Recepción cloud autenticada + cola municipal cifrada + monitor de sincronización. No es una declaración de instalación física, presencia laboral o liquidación automática.

Se conserva la captura manual original y sus 11.111 registros. El nuevo flujo escribe en attendance_collector_record y en los hechos canónicos pendientes de revisión; no modifica la captura ni reemplaza sus gráficos por cifras de origen distinto. Los duplicados reconocidos en la captura original y en recepciones previas no generan otro hecho. Clave de idempotencia por solicitud y por hash del registro original.

## Base y permisos
Tres tablas nuevas: política del colector (habilitación separada y última señal), comprobantes de lote, evidencia binaria de registro. Funciones con alcance por conector/serie/municipio/fuente certificada; el servicio no recibe credenciales de PostgreSQL. Revisión de formato, calendario, fecha de inicio, correspondencia de serie y hashes en el servidor. Observaciones preservadas aparte de los hechos normalizados. Tablas privadas sin lectura/escritura directa del rol de la aplicación. Función de monitor requiere sesión municipal y attendance.read; no devuelve documentos ni nombres.

El conector queda suspendido y la política deshabilitada. No se habilitan servicios, cuentas o dispositivos desde el navegador. Las nuevas asociaciones de empleados que no tengan un vínculo vigente quedan para revisión, sin asignación por nombre.

## Instalación
Paquete versionado en services/pm10-collector; Linux/systemd recomendado y plantilla Windows LocalService. No requiere npm de la plataforma. Credenciales externas, permisos locales restrictivos, bloqueo de instancia, cola AES-GCM y comprobación antes de eliminar cada lote confirmado. Read-only del dispositivo; no Telnet, búsqueda de claves, cambio de hora, altas, bajas, huellas o rostros. La instalación real exige host municipal permanente y acceso autorizado a la LAN. Ver README del servicio.

## UX
Nueva tarjeta antes del historial: contacto del servidor, última lectura declarada y último lote confirmado; cantidades guardadas, normalizadas, observadas y pendientes locales. Últimas 20 recepciones, estado de identidad sin nombres, códigos originales. Refresco de pantalla cada 60 s visible; eso no ejecuta una descarga del reloj. Errores limpian los valores anteriores; una señal de vida aislada no significa reloj online. Teclado, móvil y preferencia de movimiento reducido.

## Puertas de aceptación
Pruebas de lector TCP sintético, reinicio y cola, comprobantes, token/serie/fecha, permisos, deduplicación y revisión de UI; pruebas PostgreSQL en rama QA, todas las filas sintéticas y habilitación temporal revertidas. Sin sesión real de funcionario, sin acceso físico al reloj. La aceptación final requiere reinicio del host y recuperación de cola sobre la infraestructura municipal.

## Pendiente de puesta en servicio
Designar servidor/VM, SO y responsable; verificar TCP4370 y HTTPS443, CommKey ya validada y secreto de servicio; revisar capacidad y recuperación; instalar, habilitar coordinadamente y demostrar una marca nueva con la PC de Marcelo apagada. No se completa esa fase con un deploy de Vercel.
