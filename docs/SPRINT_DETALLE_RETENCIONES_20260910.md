# Detalle de haberes y retenciones — incremento 048

Estado: candidato a validación y promoción. El estado productivo se acredita con el commit desplegado, recibos de importación y comprobaciones, no con esta descripción.

## Resultado operativo
Desde cada período del legajo: **Ver conceptos y descuentos**. Consulta todas las líneas del período autorizado, inicialmente filtradas por descuentos. Categorías: haberes, descuentos, contribuciones patronales y totales/bases. PDF multipágina y Excel con Detalle/Totales/Control parten del mismo contrato; al exportar se revalida la sesión y se fija la versión de fuente.

Cada concepto conserva código, descripción de origen, cantidad, importe y convenio. Los grupos usan `concepto.TOTA_15`; 990–999 son controles separados. No inferir porcentajes, bases ni entidades a partir de cocientes. Una descripción abreviada de origen no se expande por conjetura. Las sumas se hacen en centavos enteros y no se ajustan diferencias para cerrar. Las contribuciones patronales no se descuentan del neto por segunda vez. Un valor ausente no se convierte en cero.

## Fuentes y convivencia
El extractor local lee `concepto`, `histocal` y `calculo` del respaldo autorizado, con empresa y ventana explícitas. No ejecuta el SQL ni se conecta al GRH operativo. El detalle nuevo y el resumen mensual anterior pueden corresponder a cortes distintos: se mantienen separados, comparando sus totales sin sobrescribir `payroll_monthly_fact`. No es un nuevo motor salarial ni prueba de pago.

## Ingesta de mantenimiento sellada
El propietario SQL preautoriza exclusivamente un payload cifrado exacto, con tenant/binding/hashes/contadores/expiración/actor. La fachada valida el hash antes de descifrar, comprueba fuente y límites, y genera un dataset inmutable. El runtime no puede registrar trabajos ni leer claves. Al consumir el trabajo se elimina la contraseña efímera. Reenvíos no duplican datos.

La ruta de entrega no es un formulario para RRHH ni un importador general: sólo acepta bytes previamente autorizados. Rechaza solicitudes Origin de navegador, trabajos desconocidos/vencidos/revocados, cifrado diferente y cuerpos grandes. Devuelve conteos, nunca contenido. No altera sueldos, corridas, cierres ni órdenes de pago.

La lectura operativa exige sesión activa y `workforce.employee.read` más `payroll.read`, vinculada al municipio/fuente. Auditoría de lectura sin nombres/importes y permisos execute-only. No habilita autoservicio del empleado ni lectura transversal.

## Documentos y firma
Detalle informativo sin firma. DOC-01 conserva el circuito de futura emisión autorizada con firma privada/versionada. No aplicar la firma de Noelia desde una cuenta técnica. TXT bancarios/fiscales no cambian. Los ejemplos CI usan personas y fuentes sintéticas.

## Verificaciones
Extracción reproducible; conteos por corrida y separación de cortes; importes exactos, nulos, negativos, códigos y descripciones; permisos de contrato/tenant/binding; hash/expiración/reenvío; PDF completo sin cortes; XLSX numérico y fórmulas; navegador escritorio/móvil. No declarar importación ni publicación sin recibo verificable.

Este incremento no modifica el colector, los saldos de licencias, las fórmulas por convenio ni las aprobaciones salariales.
