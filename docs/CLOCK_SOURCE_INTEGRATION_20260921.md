# Recepción y consulta de fuentes de relojes

## Alcance

Este incremento conecta el contrato de captura `zk40-delivery.v1` con la base dedicada `municontrol_clocks` mediante `/api/clock-source-ingest`, un remitente separado y una consulta privada en la pantalla existente de relojes. No cambia las conexiones del sistema contable ni el receptor PM10. La configuración de fuentes es optativa y queda apagada hasta completar su enrolamiento real.

La confirmación `clock-source-receipt.v1` se entrega sólo después de confirmar la transacción. Certifica bytes originales guardados, no identidad de agentes, asistencia, horas extras ni cálculo de nómina. Una respuesta perdida se recupera reenviando la misma parte: conserva el recibo y rechaza conflictos de contenido. Las copias originales permanecen en el colector.

## Integración

- `001-source-store.sql` queda congelada. `002-source-integration.sql` comprueba su huella y agrega el vínculo al inventario y la lectura agregada. **Después de 002 y de habilitar logins no se vuelve a ejecutar 001** como actualizador.
- El vínculo exige equipo, punto, tenant y membresía reales, huella del binding certificado y evidencia del dispositivo. No se crean equipos, personas, membresías o credenciales de ejemplo con la migración.
- `CLOCK_SOURCE_WRITER_DATABASE_URL` usa únicamente `clocks_source_ingest_app`; `CLOCK_SOURCE_READER_DATABASE_URL`, `clocks_source_reader_app`. Ambos se crean mediante SQL sin privilegios administrativos y sin acceso directo a tablas. Heredan, respectivamente, `clocks_source_runtime` y `clocks_source_reader` con `INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE`. No usar roles administrativos creados por el proveedor ni sustituir `ACTIONS_DATABASE_URL`.
- El receptor sólo acepta la credencial de su conector. El tenant proviene del enrolamiento. El cliente no selecciona base ni tenant. Credenciales revocadas no pueden reenviar recibos anteriores.
- La consulta usa autorización municipal vigente `attendance.read`, binding certificado e inventario actual; revalida autorización e inventario después de leer las fuentes. Es una consulta compuesta entre bases, no una transacción distribuida. Ante error o revocación se retiran los resultados.
- El panel consulta manualmente para evitar despertar la base por cada apertura de página. Muestra partes, registros originales, envíos completos/pendientes y último acuse, sin nombres, DNI, bytes crudos ni claves.
- El remitente conserva acuses propios en `delivery-source`, con tenant y equipo comprobados. Usa ventanas compartidas y envío serial; no mezcla sus acuses con los del receptor canónico. La configuración y las credenciales permanecen privadas fuera del paquete publicado.

## Gates de habilitación

1. Revisión y CI del commit exacto, incluyendo SQL desechable en PG17 y PG18, permisos efectivos, aislamiento, revocación, integridad, replay y navegador. Ninguna prueba sintética deja datos municipales persistentes.
2. Instalar 002 únicamente en la base dedicada; comprobar definición del receptor sin cambios, roles, permisos y lectura sin datos nominales. No instalar el esquema de relojes en las bases principales PG17/PG18.
3. Crear accesos mínimos y variables nuevas después de los controles, conservando todos los destinos existentes.
4. Enrolar sólo equipos reales ya respaldados por inventario autorizado y captura de identidad. En este corte se comprobó que el inventario core tiene PM10; los otros cinco equipos capturados aún necesitan alta gobernada. La presencia de una cola no reemplaza esa inscripción.
5. Promover el commit, esperar Vercel success y verificar los assets y las restricciones reales del despliegue. Probar un primer envío real completo antes de habilitar el grupo.
6. Instalar y verificar el servicio municipal con acceso administrativo válido al sistema operativo. La cuenta de GRH no se presume una cuenta SSH/Windows. Mantener los procesos actuales hasta aceptar el traspaso.
7. Una marcación física nueva debe llegar a la base y a la consulta con la PC personal apagada. Hasta entonces, la autonomía física sigue pendiente.

El incremento de almacenamiento y recepción no libera automáticamente espacio del core ni completa el motor salarial. La aprobación funcional del usuario y la conciliación laboral mantienen su evidencia independiente.
