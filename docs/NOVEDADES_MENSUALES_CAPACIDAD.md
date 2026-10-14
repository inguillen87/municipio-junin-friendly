# Capacidad para corregir y anular novedades mensuales

La propuesta y la revisión de correcciones o anulaciones conservaban un techo de 496 MiB. Al crecer la base podían rechazar una operación aunque la rama de Neon tuviera un presupuesto de 1 GiB. SQL170 adapta los dos comandos existentes al presupuesto verificado y mide todas las bases de la rama.

Se mantiene el margen de 16 MiB y la reserva de 2 MiB por operación, además del espacio del conjunto cuando corresponde. No cambia el límite de 100 lotes o 5.000 filas, la comparación completa, los nulos, los decimales, la identidad, las versiones, los bloqueos, la revisión independiente ni la recuperación con el cuerpo y la clave originales.

La instalación técnica exige cuerpos y atributos exactos de ambas funciones. Una mezcla de versiones, un presupuesto sin verificar o un cambio de permisos abortan antes de adaptar ninguna. Compara todos los datos y objetos anteriores, verifica durabilidad en otra transacción y admite sólo una repetición verificatoria. No agrega tablas, funciones o permisos, ni ejecuta correcciones o anulaciones municipales.

Las pruebas conservan el circuito anterior completo y añaden almacenamiento físico por encima del techo antiguo y del nuevo presupuesto. Ejecutan las funciones reales contra actores y datos sintéticos en PostgreSQL 17 y 18, con revisión por otra persona y conservación de los comprobantes previos. La instalación usa REPEATABLE READ; las operaciones administrativas conservan READ COMMITTED.

Esta mejora no anula liquidaciones de haberes: corrige la capacidad de los circuitos administrativos de novedades ya aprobadas. Tampoco homologa el código 95, adopta el padrón o cambia el límite de 500 registros del importador. Implementación, pruebas, instalación, publicación y aceptación municipal se acreditan por separado.
