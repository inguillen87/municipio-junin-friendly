# Planilla bancaria desde las liquidaciones incorporadas

El Centro de reportes incorpora la tarea **Planilla bancaria**. El usuario elige una liquidación, filtra por banco, jurisdicción, tipo de cuenta informado o persona, y descarga Excel o PDF con todas las filas del filtro. Este recorrido no requiere cargar archivos.

La consulta combina el neto conservado en el concepto 999, validado como NETO A PAGAR, con datos bancarios del mismo respaldo GRH. La fuente bancaria se incorpora una vez mediante una operación técnica fuera del sitio. El archivo privado nunca se incluye en Git, CI ni en los archivos públicos del despliegue.

## Procedencia y límites

- La liquidación y las cuentas deben coincidir en municipio, vinculación certificada, empresa, base de origen y SHA-256 del respaldo.
- Las cuentas conservan sus ceros iniciales. Los alias de CBU discordantes y los datos inválidos quedan observados; no se elige un valor arbitrario.
- La jurisdicción usa el historial correspondiente al período, fecha y tipo de esa liquidación. La falta de ese historial se informa sin completarla con una repartición actual.
- Los códigos TCTA se conservan. Su significado no se presume caja de ahorro ni cuenta corriente. Sólo se muestran opciones verificadas.
- El neto proviene de la liquidación incorporada; este módulo no calcula haberes, ordena transferencias ni acredita pagos. La exportación bancaria de pago requiere su formato y población validados.
- La fecha de corte de la fuente permanece visible. Un reporte histórico no acredita actualización al día de la consulta.

## Acceso y reversión

La API exige una sesión municipal vigente y ambos permisos `payroll.read` y `workforce.employee.read`. La función de base verifica nuevamente sesión, versión, fuente certificada y ámbito. Los datos nominales no se almacenan en caché. Cada descarga vuelve a consultar el permiso y la huella del reporte.

La migración `060-payroll-bank-source-report` agrega un almacén privado inmutable y un registro de consultas. No cambia las liquidaciones anteriores. Su aplicador verifica destino, copia restaurada, permisos, huella de funciones y ledger; por defecto ensaya y revierte. El importador exige hashes exactos y admite repetición sin duplicados.

Revertir la publicación a la versión anterior deja el almacén aditivo preservado e inaccesible desde la interfaz anterior. No se eliminan ni se restauran tablas financieras para revertir esta pantalla. Los despliegues y la evidencia de cada ejecución se anotan en el checkpoint privado de continuidad.

## Verificación

Las pruebas cubren filtros completos, precisión decimal, XLSX legible, PDF completo, respuesta tardía, error transitorio, fuente cambiada, sesión revocada y ausencia de permisos. Los ensayos de PostgreSQL se ejecutan en la restauración local existente; sus fuentes y salidas nominales permanecen privadas. Los fixtures de CI son sintéticos.
