# Central de relojes · recepción adicional por equipo

## Decisión de arquitectura
Evolucionar MuniControl 4.1 con una aplicación común y procesos, identidad, credencial, cola y recuperación independientes por reloj. Edificio Viejo permanece con su supervisor existente durante la incorporación de los otros puntos. No ejecutar dos lectores sobre ese equipo ni reutilizar su token para otro dispositivo.

## Este incremento
Endpoint adicional `POST /api/attendance-zk40`, token independiente por conector y cabecera `x-clock-connector`. La base exige enrolamiento previamente autorizado con correspondencia de municipio, punto, dispositivo, serie, conector, perfil de protocolo y evidencias. No existe descubrimiento de red ni autoalta a partir de una IP.

La migración 070 conserva íntegra la función PM10 existente y verifica su huella antes de derivar el nuevo receptor. Conserva bytes originales y hashes, controles de tamaño/formato/fecha, acuses idempotentes por parte, bloqueo ante conflicto, separación entre dispositivos y revisión de identidad. Recibir fichadas no aprueba jornadas ni modifica haberes. Los registros con identidad no interpretable se conservan como observaciones; no se adivina un legajo.

`attendance_clock_fleet_v1` prepara la consulta agregada para el panel común, con sesión y permisos de asistencia. Un acuse confirma una recepción anterior, no que el reloj esté conectado actualmente. Las tablas fuente anteriores ya están separadas por municipio/dispositivo/conector; su nombre histórico no cambia en esta entrega.

## Límites de la entrega
Publicar el receptor no instala ni activa los cinco colectores locales. Faltan enrolamiento auditado por equipo, credenciales privadas, siembra de capturas completas, confirmación inicial y supervisión automática en la computadora municipal. No existe aún una nueva vista de flota publicada en este commit. El panel y el supervisor se conservan en la rama local de trabajo.

Las primeras capturas completas de cinco puntos están en almacenamiento privado; una transferencia inicialmente incompleta de Galpón se repitió exitosamente. Nunca usar el archivo parcial para la cola. Las direcciones, series nuevas, credenciales y fichadas no forman parte de este repositorio.

La validación SQL se ejecutó en la rama de pruebas, aplicando el prerrequisito 055 y el receptor 070 dentro de una transacción revertida: 17 comprobaciones, dos equipos sintéticos, sin escrituras productivas. Los 36 controles nuevos de transporte/contrato complementan las pruebas originales de PM10, que no se sustituyen. La suite completa y build del candidato se ejecutan antes de promoverlo.

## Continuidad
La computadora utilizada quedó fuera de línea antes de instalar los trabajadores nuevos. El colector anterior no se detuvo ni se alteró en esta intervención. Al recuperar acceso: reconciliar master con el worktree local, completar el panel de flota y su prueba de permisos, aplicar la configuración privada, sembrar únicamente fuentes completas verificadas y comprobar acuses de cada equipo antes de habilitar recurrencia. No certificar ejecución con la sesión cerrada o el equipo apagado.

Las mejoras de continuidad del formulario Jurídico (cambios reales, filtros y foco de errores) permanecen en su copia de trabajo; no están incluidas en este commit. Mantener issues #37, #40 y #41: autonomía salarial y gestión Jurídica–Legislativa continúan por etapas, sin sustituirlas por esta integración de dispositivos.
