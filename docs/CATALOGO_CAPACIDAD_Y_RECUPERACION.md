# Catálogo de encuadres: espacio y recuperación

El catálogo completo se prepara en **Personas → Catálogo de encuadres**. Una propuesta conserva todas las opciones y sus declaraciones de uso; enviarla no modifica contratos ni habilita automáticamente nuevas altas. La decisión sigue requiriendo otra persona autorizada.

Cuando el almacenamiento no alcanza, la pantalla informa la causa y conserva las opciones y el motivo para continuar después de corregirla. Un conflicto de almacenamiento no se presenta como un cambio del catálogo. Los errores desconocidos nunca muestran texto SQL ni mensajes privados del servidor.

Si hay otra operación en curso o no se confirma la respuesta, queda disponible **Consultar confirmación**. Si esa consulta no encuentra el envío, **Reenviar el mismo intento** utiliza exactamente el cuerpo y la clave anteriores. No se genera otro guardado automáticamente; tampoco se permite cambiar el contenido de un intento pendiente. La sesión, el ámbito municipal y los permisos siguen comprobándose en cada operación.

## Corrección técnica SQL168

La función privada de capacidad conservaba un techo de 496 MiB, derivado del presupuesto anterior de 512 MiB. El proveedor aumentó el almacenamiento gratuito a 1 GB por proyecto el 2 de octubre de 2026: [anuncio oficial de Neon](https://neon.com/blog/neon-free-plan-1-gb-per-project). El anuncio no sustituye comprobar el presupuesto efectivo de cada proyecto.

El protocolo exige evidencia reciente de los dos proyectos existentes y un presupuesto exacto de 1.073.741.824 bytes. Ajusta únicamente el techo de `native_employment_catalog_capacity_v1(integer)` a 1.056.964.608 bytes. Conserva el margen de 16 MiB, la reserva por escritura de 256 KiB, el bloqueo de capacidad y la comprobación del tamaño de todas las bases. Mantiene los límites de opciones, contenido y propuestas, y la independencia de las decisiones.

La instalación comprueba el destino, la versión de PostgreSQL, la función y sus metadatos previos. Conserva todas las filas, permisos, índices y demás funciones. Un cambio del cuerpo previo o del presupuesto aborta. La repetición verifica el resultado instalado; no vuelve a modificarlo. No crea tablas, funciones nuevas ni registros municipales, y no cambia el plan comercial de Neon.

`scripts/prepare-catalog-storage-capacity-installation.mjs` genera un lote desde un commit limpio y evidencia del proveedor de menos de 24 horas. No conecta ni ejecuta SQL. La instalación revisada se ensaya con rollback, primero en la copia PG18 y después en la operativa PG17, con lectura durable y conservación comprobada en cada destino. No se aplica a la rama principal distinta de la operativa PG17.

## Verificación

`scripts/verify-catalog-storage-capacity.mjs` utiliza sólo la base local o CI de pruebas y fixtures sintéticos. Conserva las verificaciones anteriores de encuadres, alta nativa, parámetros y cálculo propio. Reproduce el techo anterior; verifica el lote exacto, su repetición, el rechazo de cantidades inválidas y que el rol de aplicación no pueda ejecutar directamente la función privada.

El recorrido HTTP guarda y recupera una propuesta de 289 opciones sin duplicación, preserva los empleados y rechaza la aprobación por su autor. El navegador usa el producto compilado y el handler real aislado: comprueba el motivo y las opciones conservados, ausencia de reintentos automáticos, recuperación del mismo envío, y accesibilidad en escritorio y pantallas de 390 y 320 píxeles.

La prueba sintética acredita el comportamiento técnico. La preparación, revisión y adopción del padrón municipal, la aprobación del maestro salarial y la aceptación de una liquidación real son decisiones y comprobaciones separadas.
