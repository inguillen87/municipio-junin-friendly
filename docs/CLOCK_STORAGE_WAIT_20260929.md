# Relojes: espera recuperable por capacidad, sin liberar bloqueos de seguridad

## Incidente y alcance
La recuperación operativa del 28/09 encontró seis capturas detenidas por DISK_SPACE_LOW y un lock de remitente incompleto. Los estados previos y las colas se conservaron; los lectores existentes recuperaron 1.417 registros reales y sus remitentes obtuvieron acuses. Ese incidente quedó documentado en #37. Esta entrega previene la detención permanente por **falta de capacidad detectada antes de conectar**; no elimina ni recupera automáticamente locks incompletos.

## Cambio
PM10 y el lector multirreloj distinguen la comprobación inicial de capacidad de las operaciones posteriores. Sólo DISK_SPACE_LOW emitido por esa comprobación entra en `storage_wait`: conserva última captura, cola, identidad, acuses y contadores de errores; programa otra comprobación local en un intervalo acotado de 60 a 900 segundos. No lee credenciales ni abre conexión al reloj mientras no alcance el mínimo configurado más la reserva de una captura completa.

Al recuperar capacidad sigue el recorrido habitual: ruta municipal, credencial autorizada, serie, protocolo, transferencia completa y almacenamiento deduplicado. No usa datos sintéticos, no crea marcas y no importa un respaldo para reanudar. La fecha del próximo intento persiste entre arranques; reiniciar no anticipa la consulta.

Los bloqueos ya persistidos quedan intactos, incluso los antiguos DISK_SPACE_LOW. Los errores de autenticación/serie, cola llena/corrupta y los fallos de escritura o falta de espacio **después** del preflight siguen exigiendo revisión. No se bajaron los umbrales, no se borran colas/acuses, no se alteraron formatos de registro ni contratos de entrega.

Los paneles locales identifican la espera por almacenamiento, la incluyen en los puntos que requieren atención e indican liberar espacio fuera de las colas. Los acuses anteriores mantienen sus fechas; un envío confirmado no se presenta como una captura nueva. Se conserva la distinción respecto de asistencia aprobada y nómina.

## Verificación del código
- 25 pruebas nuevas con colas y capacidad sintéticas: insuficiencia exacta de un byte, varios ciclos, reinicio/plazo, recuperación al umbral, deduplicación, cierre voluntario y rechazo de estados incompatibles.
- Se prueban por separado los errores de capacidad del lector frente a los del almacenamiento local; la marca de reintento no permite eludir una falla de identidad o integridad.
- Suite de agentes en Windows: 519 aprobadas, cero fallos, siete omitidas por plataforma; suite de aplicación: 5.725 aprobadas, cero fallos, dos omitidas; build correcto.
- 14 controles del panel en navegador, sin acceso de red, con vistas de 320/390 px inspeccionadas. Manifiesto de PM10: 57 archivos verificados.
- El workflow de parque unificado ahora se ejecuta también sobre PR para verificar Windows y Linux antes de integrar.

La instalación real, el commit integrado, CI y las capturas posteriores se registran al cerrar la entrega. Las pruebas de falta de espacio no llenan el disco de operación y no detienen los relojes municipales para simular la incidencia.

## Pendientes separados
La recuperación por capacidad no completa la VPN/colector en Oracle, los ocho puntos sin captura verificada, la normalización de originales adicionales ni las reglas de asistencia y liquidación. La firma digital queda en el trabajo de Hugo y Noelia. No se cambian los módulos de nómina, la fuente GRH, los permisos ni la base municipal en esta entrega.
