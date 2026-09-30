# Revisión nativa de novedades · componente independiente, no corte productivo

## Resultado implementado
`lib/native-payroll-import-review.js` resuelve filas contra una revisión de padrón y conceptos propios: municipio, UUID interno de persona/contrato, número de legajo, DNI, fechas, estado y revisión. No importa consultas SQL, no requiere `source_system`, lote migrado, binding, respaldo o servidor anterior. Rechaza esos campos extra en el contrato de entrada en lugar de hacerlos obligatorios. La procedencia documental debe conservarse separada, no convertirse en autorización.

Una persona creada sólo en MuniControl utiliza el mismo contrato de revisión que una ya incorporada al padrón operativo desde una migración. Esto se demuestra con registros sintéticos, incluidos UUID opacos del estilo de los migrados. No se ha promovido el padrón municipal real a este contrato en este incremento.

Se controlan todas las filas y sus líneas originales, sin reducir el conjunto a la página visible. Se distinguen persona desconocida, varias identidades con el mismo DNI, contratos múltiples de una sola persona, concepto fuera de vigencia y destino repetido. La elección explícita sólo puede seleccionar un contrato de la misma identidad y período. El resultado es inmutable. Cantidad, importe, signo, cero y ausencia permanecen separados; no hay cálculo de haberes.

## Formato como adaptador de borde
`lib/native-entity-import-preview.js` utiliza el lector estructural existente exclusivamente para el Formato Junín 55 con importe decimal explícito. El nombre heredado del archivo del lector no supone acceso a GRH: es código de interpretación de bytes. A continuación entrega datos neutrales al dominio nativo.

El adaptador no habilita OSEP, Mayor/Full, escalas implícitas ni agrupaciones pendientes de homologar. El caso de 759 registros de esta prueba es **sintético en Junín 55**, no el archivo real de OSEP. Los perfiles adicionales y el guardado de más de 500 filas siguen pendientes en la aplicación actual.

## Revisión y cambios posteriores
La huella une bytes originales, opciones expresas, revisión completa del padrón/conceptos y resultado. Cambiar una persona, un contrato, vigencia, concepto o versión invalida la revisión, aun si la cantidad de filas sigue igual. Reordenar el catálogo sin cambiar sus datos no produce una modificación de negocio. Retirar una vista elimina y sobreescribe su copia privada de bytes; las referencias del consumidor al resultado nominal deben descartarse por separado.

Esta revalidación **no es una transacción de guardado ni una autorización**. El lector del padrón debe estar autorizado en servidor. La persistencia futura debe revalidar y bloquear su versión dentro de la misma transacción; no debe confiar en un registro enviado libremente por el navegador ni sustituir el control atómico por esta comparación en memoria.

## Evidencia ejecutada
115 pruebas nuevas aprobadas. Casos completos de 1, 12, 14, 500, 501, 759 y 2.000 filas; 2.001 se rechazan. Se prueban registros ausentes, identidad ambigua, elecciones inválidas, cruces de municipio, fechas inválidas, revisiones cambiadas, integridad de líneas y enteros más grandes que el rango exacto de Number.

`scripts/verify-native-import-independence.mjs` ejecuta 12, 14, 759 y 2.000 registros con las vías HTTP/TCP del proceso bloqueadas. En el ensayo local: todos resueltos, cero filas omitidas, cero intentos de red, cero conexiones de base, cero respaldos, cero registros municipales. El reporte conserva el tiempo de cada caso; no es una garantía de latencia de API o base de datos.

Construcción completa local: 6.065 aprobadas, cero fallos y dos omitidas. CI específico ejecuta el núcleo en Windows y Linux, además del build; su estado se registra después de finalizar. Ninguno de estos números certifica permisos, persistencia, liquidación o aceptación de Noelia en producción.

## Integración y bloqueo observado
Se inició un borrador de esquema propio y se bloqueó el append que contenía la continuación de revisión/preparación SQL. No se reintentó ese guardado por otra herramienta. El archivo parcial se retiró de `scripts/native-payroll/intake.sql` y quedó sólo en `verification/native-intake-schema.unvalidated.sql.txt`, excluido de Git. No se ejecutó SQL, no se crearon tablas ni permisos y no se promovió ningún padrón. No aplicar ni reconstruir ese borrador como una migración verificada.

El incremento permitido y completo es la revisión en memoria y su adaptador de bytes, no la persistencia bloqueada. No se modificaron APIs, interfaz publicada, configuración de Vercel, autenticación o escritor de lotes vigentes. Los módulos no están conectados aún al recorrido de Noelia; la aplicación publicada conserva su resolución anterior. Esta entrega no se anuncia como importación nativa operativa.

## Conexión exigida para el siguiente cierre funcional
El siguiente paso es alimentar esta revisión mediante un lector del padrón propio autorizado, y conectar un guardado atómico de archivo completo que funcione tanto para registros migrados como para altas propias. Después, el motor nativo debe consumir las novedades aprobadas y producir sus versiones de cálculo, anulación, recálculo, confirmación y cierre. Un lote validado no es una liquidación calculada.

No se tocó el trabajo paralelo de navegación en `Documents/Codex/MuniControl`, los worktrees de recibos o de las PR #50/#61/#64, los relojes ni la firma digital. El pedido original de módulos 1–10 se mantiene: los rangos y descarga de recibos del módulo 9 y el cotejo de cargos liquidados frente al presupuesto de cada año del módulo 10 no se consideran resueltos por este componente.
