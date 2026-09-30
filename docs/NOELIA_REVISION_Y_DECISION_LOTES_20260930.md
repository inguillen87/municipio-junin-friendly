# Noelia · revisión completa y decisiones sobre lotes guardados

Incremento local de los módulos 3 y 5. El detalle del lote guardado mostraba una tabla sin los controles de revisión disponibles en la previa. Las decisiones usaban la consulta anterior, y una lectura tardía podía reemplazar el detalle elegido más recientemente.

## Comportamiento implementado

- El lote guardado reutiliza la revisión existente: búsqueda, concepto exacto, páginas de 25/50/100 filas, importes ausentes/cero/negativos, forzadas, mes de ajuste y campos completos. Añade filtros de observaciones y bloqueantes del servidor.
- Los controles aritméticos y por concepto incluyen todas las filas. No se mezclan unidades ni se presenta una suma como neto salarial. Las cifras grandes conservan precisión entera; los importes históricos v1 admiten su rango int64 sin ampliar el límite de los borradores nuevos.
- Cada decisión relee las capacidades y el lote completo. Una diferencia de ámbito, permiso, estado, versión, identidad, fila u observación impide enviar la decisión anterior. El operador recibe la revisión vigente antes de volver a decidir.
- La confirmación identifica lote, período, tipo y cantidad completa, incluyendo filas fuera del filtro. La autorización definitiva, separación de funciones, versión esperada e idempotencia siguen en el servidor.
- Las respuestas tardías no restauran un lote cerrado, sustituido u oculto. Al ocultar la página se retiran los datos consultados y se exige actualizar el acceso. Un intento incierto conserva en memoria cuerpo, clave y versión; el regreso desde la caché de navegación no lo convierte en un envío nuevo. Recargar o cerrar completamente la página sigue perdiendo la memoria local, con el aviso existente antes de salir.
- La consulta guardada no incorpora una descarga alternativa de borradores: las exportaciones existentes mantienen aprobación y permisos. La previa conserva su CSV de control y sus identificadores originales.

## Verificación y estado

Base local `a9b7149dd62a4e7f444f33c4129c417a91c6a4cc`, rama `work/codex-autonomy-20260930`. Se conservaron el reporte de incidencias, el enlace al lote guardado y los cambios externos de rutas.

Antes de editar: 62 pruebas focales aprobadas. Resultado final ampliado: **327 aprobadas, 0 fallos, 0 omitidas**, con **50 regresiones nuevas** del modelo, componente, decisiones y ciclo de página. Se mantuvieron las comprobaciones existentes; el doble del lector anterior recibió el nuevo estado de página sin retirar sus aserciones.

Las pruebas usan datos sintéticos, funciones reales y dobles de DOM/API/SQL. No constituyen una nueva prueba con PostgreSQL real, navegador, sesión municipal ni aceptación de Noelia. Sintaxis JavaScript y `git diff --check` aprobados. Build completo y navegador permanecen pendientes: no se reintentó la denegación previa de esbuild ni se ejecutó el verificador compartido del frente de rutas aplazado. No hubo commit, push, merge ni deploy de este incremento.

## Continuidad reconciliada

Durante esta ejecución GitHub confirmó la integración de PR #67 en `b630731acedc5126ab655b08ba59734b33f2626d`. Su núcleo de revisión nativa es un avance distinto, sin interfaz ni persistencia nativa completa. No se copió ni se reconstruyó aquí, y no se acredita su despliegue por haber consultado GitHub. El checkout local conserva su HEAD y sus cambios.

El guardado nativo del archivo completo y su lector autorizado siguen pendientes; la continuación SQL rechazada no se reintenta. OSEP homologado, cálculo salarial propio y límite del escritor no se resuelven con este detalle. Relojes/cloud, las reglas de Personal de Hugo, firma/recibos y los pendientes jurídicos de Mariano mantienen sus criterios de cierre y no fueron operados en esta entrega.
