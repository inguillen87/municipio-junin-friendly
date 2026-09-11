# Continuidad operativa municipal: separar operación, origen y recuperación

## Relojes
Una instantánea manual almacenada no es una conexión continua. Activar un registro de conector tampoco instala el proceso que lee el equipo. Cierre necesario: host municipal siempre encendido, ruta autorizada a PM-10, servicio con lectura autenticada, cola durable, reintentos limitados, comprobante persistido y monitoreo de última recepción. No depende de la computadora del desarrollador ni de mantener una página abierta. No abrir el reloj directamente a Internet. Meta inicial propuesta: consulta cada 60 segundos, validada bajo carga y sin bloquear al colector anterior. Las faltas de recepción no se convierten en ausentismo.

## Nuevo respaldo de GRH
Conservar el archivo original y su hash fuera del repositorio. Inspeccionar sin ejecutar los DROP del dump. Las fechas de archivo, período de nómina y estado administrativo son distintos. Un snapshot de una corrida no es un censo de activos. Comparar diferencias de identidades, contratos, conceptos, fórmulas y cierres antes de publicar un nuevo origen.

Ruta de incorporación: recepción privada → manifiesto → staging aislado → conteos y relaciones → conciliación de períodos → aprobación de origen → disponibilidad en MuniControl. No sobrescribir novedades, licencias, decisiones, documentos emitidos o fichadas propias al actualizar un origen GRH. Las referencias de legajo deben conservar empresa y fuente; cada tabla operativa mantiene su identidad propia y restricciones de relación.

## Capacidad y recuperación
Verificar uso contra cuota antes de ampliar el histórico o duplicar fuentes; no solucionar falta de espacio borrando evidencia. No modificar la facturación automáticamente. Mantener migraciones versionadas y distinguir la rama conectada a producción del nombre que pueda tener en el proveedor.

La recuperación dentro del proveedor, la copia independiente y el ensayo de restauración son controles distintos. Plan propuesto: una política de restauración en el tiempo adecuada al riesgo municipal; exportación cifrada a destino privado independiente; verificación de huella e integridad; restauración de prueba con medición de RPO/RTO. Los objetivos no están certificados hasta realizar la prueba. Una rama de QA no es por sí sola un respaldo independiente.

## Próximo circuito completo
Días ART por fuente/regla aprobada y período; normalización F/M desde dato explícito; base 993+995; control de jurisdicción y población; revisión de Noelia; salida exacta del formato receptor. Mantener la base de trabajo separada de una presentación lista. Aplicar el mismo criterio a bancos, OSEP/Mutual y F.931, sin rellenar campos por suposición.
