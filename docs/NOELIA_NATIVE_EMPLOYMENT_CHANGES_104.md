# Rectificación del encuadre de un legajo propio — 104

Personal puede preparar una corrección de convenio, categoría, sector, repartición y cargo en un legajo creado en MuniControl. Otra persona habilitada compara los valores anteriores y propuestos y decide aprobar o rechazar. Aprobar aplica el encuadre actual; proponer o rechazar conserva el vigente. Este incremento continúa la autonomía de Personal después del catálogo propio 103.

## Alcance y recorrido

Desde Personas, abrir un legajo propio y la sección «Rectificar encuadre». Consultar las opciones vigentes, preparar el cambio, indicar el documento que lo respalda y explicar el motivo. La comparación muestra los cinco campos. Una persona diferente revisa la propuesta; la decisión conserva quién intervino, cuándo y sobre qué versión. La misma persona con otra membresía sigue siendo la autora y no puede autoaprobar.

El cambio se limita al encuadre administrativo actual. No rectifica nombre, DNI/CUIL, jurisdicción, número de legajo, fechas del contrato ni el comprobante original del alta. No cambia importes, fórmulas, conceptos, haberes, novedades, licencias o pagos. No introduce vigencias retroactivas o futuras. No completa baja, reingreso ni el motor salarial; esas etapas mantienen su propio alcance en la matriz de Noelia.

La interfaz identifica el contrato por UUID y vuelve a consultar su identidad, permisos y versiones. Sector corresponde a `organizationId`; Repartición a `sectorCode`, como en el alta existente. La categoría pertenece al convenio seleccionado. Los nombres y códigos se obtienen del catálogo vigente y quedan conservados con la propuesta.

## Conservación y concurrencia

Las propuestas y decisiones son registros inmutables. El contrato cambia únicamente dentro de una aprobación válida, con coincidencia exacta del registro anterior y del registro resultante. La autorización del cambio queda vinculada a la misma transacción de la revisión; no se habilita mediante una variable de sesión ni por presentar un identificador histórico. Una decisión que no aplique exactamente el cambio no puede confirmarse.

La revisión de base incorpora el registro completo y su número de revisión: volver a valores anteriores no convierte una propuesta antigua en vigente. Si cambia el encuadre o el catálogo antes de aprobar, se requiere volver a revisar. Rechazar una propuesta desactualizada no aplica sus valores. La recuperación de un envío confirmado devuelve su comprobante original, sin ejecutar otro cambio.

Ante una respuesta perdida, la página conserva temporalmente el mismo contenido y clave de intento, incluso al cerrar y reabrir el legajo en esa página. Primero consulta la confirmación. No guarda estos datos en almacenamiento persistente del navegador. Cambiar de persona o ámbito invalida ese borrador; revocar la lectura retira la información de pantalla. Los errores conservan el trabajo que corresponde a la misma identidad y explican cómo continuar.

Se usan las capacidades existentes `employee.record.propose` y `employee.record.approve`, además de `workforce.employee.read`. No se crean usuarios ni se amplían roles. Las escrituras requieren una persona operadora vinculada y una sesión municipal vigente. Las tablas no conceden escritura directa al usuario de aplicación.

## Validación y publicación

Base del incremento: `7285166dea8400e755982a720b2056d7f3fa87b6`, catálogo 103 publicado. Este documento describe el circuito y sus gates; no sustituye el recibo del release ni acredita una rectificación municipal real.

- Modelo/API: datos cerrados, códigos, identidad y ámbito, permisos, respuestas asociadas al mismo contrato, reintentos y lectura íntegra de solicitudes JSON.
- Navegador: preparar, comparar, aprobar/rechazar, cambios de sesión, respuestas tardías, conservación del borrador, escritorio y móvil. APIs interceptadas con datos sintéticos, sin escrituras municipales.
- PostgreSQL 17/18 descartables: autoridad, revisión independiente, inmutabilidad, aplicación exacta, conflictos, concurrencia, preservación de 067/093/095/101/102/103 y reversión de las pruebas.
- Release: CI del commit exacto antes de Neon; instalación y verificación independiente en PG18 y PG17; preservación de datos municipales y permisos; promoción a master; Vercel correcto y comprobación de recursos publicados.

La primera rectificación real debe corresponder a un pedido municipal verdadero y a su revisión independiente. No se fabrica un legajo, una resolución o una aprobación para completar una prueba.
