# Seis puntos: evidencia de conexión, almacenamiento y pendientes de unificación

## Estado comprobado, no objetivo declarado como terminado

La inspección actual conserva el escenario de cinco colectores adicionales con captura local y PM-10 con recepción en Neon. La instrucción del propietario es que los seis queden bajo el mismo supervisor y circuito, sin una prioridad especial para PM-10. El orquestador se intentó desarrollar en esta intervención, pero la herramienta bloqueó su escritura antes de crear el archivo. No se detuvieron las tareas existentes ni se instalaron controladores incompletos. La unificación NO queda terminada por esta entrega.

La compatibilidad con los lotes/acuses anteriores debe preservarse internamente al migrar; no es motivo para tener políticas de operación o permisos diferentes. Cada reloj necesita identidad/serie y cola propias dentro de un único supervisor, para que un punto sin conexión no detenga los otros cinco ni duplique eventos ya confirmados.

## Inspección de hardware ejecutada con CommKey 0

Se amplió el lector con una operación explícita de sólo metadatos: CONNECT, una autenticación con la clave conocida, comprobación de serie, lectura de versión del firmware, nombre del equipo y EXIT. No lee fichadas en ese modo, no consulta usuarios ni plantillas y no cambia hora/configuración o datos del reloj. Usa el bloqueo de la cola y la comprobación de ruta municipal antes de contactar el destino de la configuración aprobada.

La operación real usó exactamente la clave proporcionada **0** para los cinco equipos adicionales; sus respuestas confirmaron autenticación y serie. Resultados:

| PM | Punto | Modelo devuelto | Firmware devuelto |
|---|---|---|---|
| PM-02 | Compras y Suministros | SF300/ID | Ver 6.60 Apr 27 2017 |
| PM-03 | Galpón Municipal | K20 Pro/ID | Ver 6.60 Apr 13 2022 |
| PM-05 | Delegación La Colonia | No disponible en esta operación | No conservado en el resultado |
| PM-06 | Polideportivo La Colonia | K20 Pro/ID | Ver 6.60 Sep 19 2019 |
| PM-14 | Edificio Nuevo | K20/ID | Ver 6.60 Sep 19 2019 |

PM-05 aceptó la autenticación, confirmó su serie y respondió al comando de firmware, pero rechazó la consulta de nombre de modelo con código 4999. El lector sólo materializa ambos datos cuando finalizan ambas respuestas; por eso no se inventa ni se da por conocido el firmware de PM-05. Se registró la necesidad de conservar resultados parciales, pero el intento de aplicar/repetir esa mejora fue bloqueado; no se utilizó otra vía para ejecutarla. Esto no demuestra fallo de captura de marcaciones. PM-10 no fue interrogado de nuevo ni se cambiaron sus acuses en esta inspección.

Las trazas y datos de red están en una carpeta privada, fuera del repositorio. La herramienta de inspección es operativa, no un servicio de sincronización o una pantalla nueva. La captura automática instalada continúa con su versión previa mientras no se complete la transición del supervisor.

## Cambios efectivos en Neon: capacidad sin eliminar historia

Se ejecutaron y confirmaron dos reconstrucciones de índices en la rama productiva correcta. Cada una exigió definición exacta del índice, espacio temporal y reserva suficientes, bloqueo NOWAIT de la tabla, tiempo máximo acotado y verificación de cantidad/huella de todas las filas antes y después. No se cambió la definición de las claves ni se eliminaron filas.

| Índice reconstruido | Tamaño anterior | Tamaño posterior | Filas preservadas |
|---|---:|---:|---:|
| grh_absences_legajo_date_idx | 1.597.440 B | 1.007.616 B | 31.572 |
| payroll_monthly_fact_date_idx | 2.170.880 B | 1.564.672 B | 214.164 |

La reducción conjunta de esos índices es **1.196.032 bytes (aproximadamente 1,14 MiB)**. La lectura del conjunto de bases de las 18:17:33 UTC dio **515.874.816 B**, frente a un límite real `neon.max_cluster_size=512MB` (536.870.912 B). El tamaño del clúster cambia con las escrituras normales; no es correcto atribuir toda variación posterior a estos dos índices. Las huellas de los registros quedaron iguales en ambas transacciones.

La primera invocación de mantenimiento falló antes de ejecutar por agrupar varios SET en una sentencia preparada. Se corrigió separándolos; no fue necesario desactivar restricciones, cambiar un rol o subir cuotas. Las dos operaciones posteriores terminaron correctamente. No se ejecutó VACUUM FULL ni un borrado de históricos. Referencia técnica: https://www.postgresql.org/docs/17/sql-reindex.html .

## El corte salarial todavía no cambió

La lectura de Neon de las 18:17:33 UTC conserva GRH del **06/08/2026, importación 3**, y PERSONAS del mismo corte de agosto. No se seleccionó el respaldo del 10/09. La API de proyecto confirmó `free_v3` y límite de rama de 536.870.912 B; ninguna cuota, facturación o tamaño de cómputo fue modificado.

El delta de septiembre y las marcas históricas de otros cinco relojes no pueden declararse aptos para carga sólo por liberar 1,14 MiB. Mantener el objetivo de diez años de detalle con archivo recuperable, pero no confundir compactación, cambio de plan o archivo con activación de datos. Para operar sin seguir al límite se recomienda resolver la capacidad productiva de forma explícita; el precio de almacenamiento no representa por sí solo el coste total del servicio.

## Circuito de negocio a conservar

Objetivo: seis puntos bajo un mismo supervisor, seis identidades y colas trazables, captura concurrente acotada, envíos con reintento/acuse e idempotencia por equipo y conciliación transversal de cada legajo. Una cola independiente no es una prioridad especial: evita que un reloj averiado detenga al resto. El origen/versión del formato anterior de PM-10 puede mantenerse como adaptador de compatibilidad sin conservar un trato operativo privilegiado.

Los resultados de llegada, tardanza, ausencia y mayor dedicación deben convertirse en propuestas de novedades para Personal/Contaduría, con jornada esperada, licencia/justificación, regla vigente, tope individual y detalle de cálculo. No basta con interpretar primera/última marca como jornada válida. Las reglas de Noelia/Hugo, los permisos y la revisión contable siguen siendo condiciones del cálculo propio; esta entrega no agregó importes a un recibo ni aprobó descuentos.

Mariano mantiene el plan de expedientes, actuaciones, responsables y obligaciones vinculados al registro normativo. La firma digital remota de PDF sigue separada de la corrección de los cálculos y de la habilitación institucional del circuito de firma. No se publicaron esos módulos adicionales por este incremento.

## Aceptación del código

El lector de inspección se versionó como 4.1.2 y se actualizó el manifiesto de integridad para los archivos realmente cambiados. La lectura automática instalada no se reemplazó por esta versión. Los borradores de conservación parcial de firmware y orquestación unificada no están integrados ni deben incluirse como si hubieran aprobado su ejecución.

La regresión cerró con **3.663 pruebas de aplicación aprobadas** y compilación correcta. La suite de agentes tiene **312 pruebas: 307 aprobadas y cinco omitidas por condiciones de plataforma**. Las cuatro pruebas nuevas usan un servidor de reloj sintético en loopback: clave 0, serie previa a metadatos, ausencia de comandos de fichadas/configuración, negativa por serie distinta y límites de respuesta. La prueba real fue únicamente la inspección privada descrita arriba.

El utilitario de inspección se ejecutó antes de publicar y no fue instalado como tarea periódica. No se generó un nuevo programa que ya envíe los seis equipos, no se promovió septiembre y no se calculó una liquidación nativa con estos cambios. El registro de commit y su estado productivo se agregan en el seguimiento del proyecto al verificarse.
