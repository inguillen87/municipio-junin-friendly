# Módulo 6.2 — escalas explícitas de referencia

Una entrada `scale_reference` permite usar una clase salarial distinta de la clase del empleado. Declara el convenio, código y clase de la escala de origen; el convenio de la regla sigue siendo explícito y puede ser diferente. La pantalla ofrece únicamente las escalas del catálogo propio aprobado, sin seleccionar una por defecto o convertir una etiqueta como «6-D» en un código supuesto.

El módulo 6 de Noelia describe 88 con 6-D y 90 con 3-A para convenios1/4/6, y88 con13-I×1,50 para2/7/11. Es evidencia del procedimiento; las imágenes históricas no certifican importes, vigencias o redondeos actuales. Este incremento habilita la fuente requerida. No instala fórmulas o importes municipales, no homologa todos los códigos y no declara el módulo completo aceptado.

Cada fuente debe ser única, monetaria, aprobada y cubrir todos los meses de cada regla que la usa. La clase exacta se comprueba en el modelo compartido y en PostgreSQL: otra clase no completa un hueco. Una escala ausente o inactiva bloquea; cero sólo es un valor explícito aprobado. Un coeficiente se introduce como operación tipada, conservando unidad, respaldo y redondeo; nunca se deduce de un código.

La copia de una fórmula conserva el convenio y clase de referencia declarados, aunque cambie el convenio de destino. La comparación completa muestra ambas dimensiones. La propuesta requiere revisión independiente del programa completo. No modifica ni reenmarca contratos.

Los tipos anteriores conservan exactamente sus ocho campos y el significado de `scale` —clase del empleado—. Sólo el tipo nuevo agrega `sourceAgreementCode` y `sourceCategoryCode`. Cambiar de fuente invalida la revisión; otro convenio/código requiere elegir de nuevo la clase. Los intentos pendientes conservan el cuerpo y la clave originales; ocultar la pantalla o retirar permisos retira las vistas privadas. No se guarda el programa en almacenamiento del navegador.

El cálculo propio toma la escala de la aprobación capturada, con convenio, código, clase y vigencia exactos en la referencia de entrada. Las versiones de catálogo/programa y las fuentes originales permanecen dentro de la captura inmutable. Cambiar el catálogo exige aprobación compatible del programa antes de otro cálculo; no recalcula recibos o corridas previas.

SQL131 adapta sólo `own_program_definition_v1(jsonb,jsonb)` deSQL122. Comprueba cuerpo y metadatos previos, conserva OID, propietario, ACL y configuración, y coteja huellas de todas las tablas/filas, funciones restantes, secuencias, roles, permisos, triggers, vistas y esquemas antes/después. No agrega tablas, funciones, fachadas, roles o capacidades; no propone/aprueba/calcula haberes. La instalación y la comprobación durable son transacciones independientes, sin reintento automático ante COMMIT incierto.

Las regresiones sintéticas recorren la pantalla construida, las APIs reales y PostgreSQL17/18: programa desde cero, referencia a otra clase/convenio, aprobación independiente, cálculo exacto, variantes rechazadas, móviles, revocación y recuperación de respuesta perdida. Los datos y cuentas sintéticos no constituyen aceptación municipal.
