# Noelia · registro y revisión de novedades fijas

Este incremento responde al apartado 5.4 del pedido original. Desde Novedades → Novedades fijas permite proponer un registro individual con alta y vencimiento, revisar por otra persona, corregir mediante una propuesta nueva y anular administrativamente conservando la historia. La publicación y la instalación se acreditan con los resultados del release; este documento describe el alcance del código.

## Qué conserva el circuito

El legajo se consulta de forma exacta antes de proponer. El servidor vuelve a verificar el contrato, la persona y la fuente certificada; si cambiaron, no traslada la novedad al nuevo titular. Concepto y centro de costo son referencias informadas por el operador, no una certificación de elegibilidad. No se introduce una regla automática para el concepto 80 ni se completa 31/12/2050 por defecto.

Cantidad e importe se mantienen separados. Importe ausente no es cero. Fechas de vigencia, momento de propuesta y momento de revisión son distintos. El final sin informar permanece visible como tal. Una vigencia que toca parte del mes se muestra como parcial, sin prorratear cantidades ni dinero.

La última versión aprobada se conserva mientras una corrección está pendiente o fue rechazada. Aprobar exige otra membresía y otra persona efectiva: proponente y revisor necesitan un vínculo laboral vigente que permita comprobar esa separación. No se crean vínculos ni se amplían permisos para simularla. Cada propuesta y decisión conserva autor, motivo y versión.

Las propuestas usan versión esperada e idempotencia. Ante una respuesta incierta se conserva el mismo contenido y la misma clave. Una consulta de intento que responda 404 no autoriza a crear otro envío: el anterior podría continuar en curso. Las revisiones concurrentes se rechazan y exigen consultar nuevamente. La aprobación impide solapamientos de vigencias del mismo vínculo, concepto, centro y tipo.

## Consulta y salidas

La consulta por período incluye los registros cuya propuesta o versión aprobada intersecta el mes. La interfaz permite distinguir pendientes, aprobadas, rechazadas y anuladas, abrir el historial y comparar una corrección con el registro aprobado. La búsqueda y la página visible no recortan el conjunto de origen.

Excel y CSV son documentos de control de versiones aprobadas vigentes. El servidor vuelve a verificar identidad, permisos y la huella de la consulta completa antes de devolverlos. No se genera un archivo a partir de un resultado obsoleto. Los textos se exportan sin fórmulas ejecutables.

## Límites que siguen vigentes

La aprobación tiene efecto `control_export_only`: no genera novedades mensuales automáticamente, no aplica fórmulas, no liquida, no paga, no modifica GRH y no revierte una liquidación anterior. El consumo por el futuro motor propio conserva su etapa de implementación y aceptación. Esta entrega no cierra el módulo 5 completo, la corrección/anulación masiva 5.5 ni los módulos 4, 6 y 7.

No se incorpora proveedor, plan, conexión o fuente activa nueva. El formulario no persiste datos nominales en el navegador. Las pruebas de navegador interceptan todas las API privadas y las de PostgreSQL usan una base desechable; ninguna representa una sesión real de Noelia o una aprobación municipal.

## Compatibilidad con la entrega anterior

La entrega del 8 de septiembre (`3ba78a8`, migración 044 de la rama `codex/art-report-prod-20260904`) había publicado un registro del concepto 80. Esa rama no es antecesora del master actual y su API e interfaz no están en este checkout, pero sus tres tablas y 24 funciones siguen instaladas. La comprobación del 21 de septiembre encontró cero filas en las tres tablas, en PG17 y PG18. No se considera inexistente ni se sobrescribe ese trabajo.

El primer intento transaccional de 092 detectó una firma incompatible y se revirtió completamente. La versión compatible usa exclusivamente funciones `payroll_fixed_registry_*_v1`, conserva las funciones, permisos y tablas anteriores y exige los permisos dedicados ya existentes `payroll.fixed.prepare` y `payroll.fixed.approve`. No concede autoridad nueva por tener permiso de carga mensual.

Si existen registros en el circuito anterior, la instalación y las operaciones del nuevo registro se detienen hasta conciliarlos. No hay importación automática, borrado ni mezcla silenciosa de ambas historias. La verificación de instalación compara las huellas de todas las funciones previas, políticas, vínculos y fuentes antes y después.

## Entrega y verificación

La migración 092 es aditiva y conserva las novedades mensuales existentes. Tablas privadas, eventos inmutables, restricciones y fachadas con permisos mínimos forman parte del mismo commit que la API, la interfaz y los verificadores. Se verifica PostgreSQL 17 y 18 antes de instalar en Neon. La instalación comprueba capacidad disponible, versión de servidor, destino exacto y ausencia de registros de prueba.

Después de CI verde e instalación idéntica en ambas bases, se promueve el commit a master, se espera Vercel exitoso y se compara la compilación con los archivos publicados. Se verifica además rechazo de acceso anónimo y el flujo de navegador con respuestas sintéticas.

El próximo alcance es 5.5: corrección y anulación masiva auditadas. Debe distinguir borradores, lotes aprobados y archivos ya exportados, preservar originales y relacionar sustituciones sin fingir una reversión salarial.

Referencias: [matriz de aceptación](MATRIZ_ACEPTACION_NOELIA.md), [estado integral](ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md), [contrato técnico](NOELIA_FIXED_NOVELTIES_CONTRACT.md) y [plan integral](PROYECTO_INTEGRAL_JUNIN_20260919.md).
