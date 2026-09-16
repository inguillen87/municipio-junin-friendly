# Catálogo propio de auxiliares vigentes · 066

## Operación incorporada
Parámetros mantiene la preparación y revisión anteriores y agrega una sección de valores vigentes por período. Una propuesta aprobada puede revisarse y activarse expresamente por el perfil revisor, distinto de quien la preparó. La vista de impacto muestra el valor anterior y el nuevo por convenio.

La activación crea una revisión persistente e inmutable en Neon. No modifica la propuesta original ni sus indicadores históricos. Los valores posteriores no sustituyen una consulta realizada con una revisión anterior. Una vigencia futura no se aplica a períodos previos. La revisión cero y los valores faltantes permanecen vacíos, no se convierten en cero.

El catálogo ofrece Excel, PDF y CSV desde la revisión consultada, con una nueva lectura de esa misma revisión antes de descargar. La pérdida de confirmación se resuelve consultando el intento original, sin duplicar la activación.

## Alcance de esta entrega
Auxiliares documentados 88/clase 6-D, 90/clase 3-A y 88/clase 13-I por 1,50, con sus convenios admitidos. No es todavía el maestro completo de conceptos, el motor de liquidación, un cierre, un pago ni un archivo fiscal homologado. El motor futuro deberá guardar la revisión del catálogo que utilizó.

No se habilitan activaciones retroactivas de meses anteriores ni autoaprobación. No se cambian roles, legajos, PM, claves del colector, fichadas ni haberes. No se generan propuestas ni activaciones municipales de ejemplo.

## Validación realizada
120 pruebas focales de contratos, API, importes y exportadores aprobadas localmente. 42 comprobaciones SQL aprobadas en un esquema sintético aislado dentro de una transacción revertida de una rama QA existente: vigencias, historial, permisos, aislamiento por municipio y fuente, duplicados, conflictos, reintentos e integridad. No se modificó la función de autorización real; el doble de autorización estuvo limitado al esquema sintético.

El navegador ejecutó las ocho regresiones existentes de Parámetros. En una sesión de navegador separada, con todas las APIs interceptadas, se comprobó el montaje sin consultas anticipadas, catálogo vacío, vista de impacto, cancelación sin escritura, activación explícita y recuperación del acuse perdido con un único POST sintético. Cero errores JavaScript. No equivale a una activación con una sesión municipal real.

Las verificaciones adicionales de histórico/exportación/móvil del catálogo no se completaron en navegador; esos contratos sí tienen pruebas de modelo y SQL. El workflow existente se conserva sin añadir jobs o previews.

## Base de datos y reversión
Migración aditiva: scripts/migrations/066-payroll-effective-auxiliary-catalog.sql. SHA-256 comprobado en QA y al instalar: 61bf29b0fa0e84b0b8a71c80c97296212a4cfbb5bb3df96ae4b2a797c83e2899. Tabla con seguridad por filas y funciones de acceso controlado; el rol de aplicación no tiene escritura directa ni acceso al proyector interno.

La reversión de la interfaz no debe borrar el catálogo ni sus revisiones. No se requieren restauraciones de haberes. Mantener el esquema aditivo y corregir hacia adelante cualquier incidencia de publicación.

## Cierre local e instalación
La suite completa y la compilación finalizaron con 3.165 pruebas aprobadas, cero fallos y cero omisiones. La migración 066 se instaló en la base de producción contrastando sus bytes con el SHA de QA, en una transacción atómica. La comprobación posterior encontró cero activaciones creadas, seguridad por filas habilitada y acceso del rol de aplicación limitado a las funciones autorizadas. No se activó ninguna escala municipal como parte de las pruebas.
