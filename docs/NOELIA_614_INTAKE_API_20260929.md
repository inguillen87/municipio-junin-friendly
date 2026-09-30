# Noelia · prioridad de importación 614 y procesamiento posterior

## Lo que precisan los nuevos audios
Los adjuntos de 19:44:52, 19:46:24, 19:47:35 y 19:50:14 coinciden por SHA-256 con las copias transcritas localmente. Se conserva la transcripción automática y su revisión terminológica; no se usa un número dudoso como definición de concepto.

Noelia prioriza elegir TXT y formato, importar descuentos completos, revisar la cantidad de registros y luego **anular y procesar la liquidación**. Propone empezar por el 614. Los catorce registros del audio son un ejemplo de igualdad entrada/resultado, no una cantidad fija del sistema. El TXT original de agosto disponible tiene doce registros. En el respaldo del 22/09, dos de esos DNI tienen más de un contrato candidato: eso no prueba el estado actual de la base, ni habilita elegir el primero.

En el audio de 19:47 corrige la referencia del archivo de devolución: sale de **Exportación de descuentos** en GRH. Ese TXT, el Excel y los comprobantes para las mutuales son salidas posteriores al procesamiento; no se confunden con el archivo que se importa. En el último audio deja esas salidas para después y reitera la urgencia de importar, anular y procesar.

## Código añadido a esta rama
`lib/internal-grh-import.js` implementa la revisión del archivo original Formato Junín (DNI/importe explícito, 55 posiciones) y preparación mensual. El concepto y período son explícitos; no se deducen del nombre del archivo. El servidor lee las identidades de la fuente certificada para el municipio/empresa/período y conserva todas las filas. Ausentes, duplicados y ambigüedades impiden una carga parcial. Cuando hay varios vínculos, la elección debe ser uno de los candidatos del mismo DNI en la fuente consultada.

El acceso exige las capacidades existentes de lectura de novedades, preparación, acceso nominal y personal; exige además sesión y vínculo operativo. Se reutiliza el lector corporativo para consultas de sólo lectura, y las fachadas existentes para identidad y escritura. No se añadieron funciones SQL, permisos, tablas ni otra credencial. El borrador 114 anterior sigue fuera de las migraciones activas.

`grhPreview` y `grhPrepare` quedaron conectados al handler existente `/api/internal-payroll-novelties`, con sus controles de origen, JSON, tamaño, sesión y datos certificados. **Es conexión en código de rama, no publicación en producción.** El preview enlaza bytes, concepto, período, fuente, destino y decisiones con una huella. Preparar vuelve a leer todo; no acepta los legajos enviados libremente por el navegador.

`lib/grh-import-prepare-sql.js` combina la fachada de preparación vigente con comprobaciones de identidad antes y después, dentro de una sentencia. Se verifican filas completas, contrato de cada fila y todos sus valores. Un fallo de la condición posterior aborta la misma operación: no se conserva un lote aparentemente correcto con otra identidad o menos registros. La idempotencia y las reglas de revisión/aprobación del escritor original siguen vigentes. No se cambia la leyenda de cancelar lote por anular liquidación.

El acuse conserva la huella de bytes y devuelve el lote; la observación guardada contiene una huella lógica que no depende de los finales de línea. No se afirma almacenamiento del TXT original completo en una nueva bóveda de archivos. No hay cálculo, pago, aprobación automática o modificación de GRH.

## Alcance deliberadamente limitado
Este adaptador guarda únicamente Formato Junín mensual, hasta el límite actual de 500 filas. La lectura estructural puede revisar 2.000; una entrada de 501 NO se divide ni guarda parcialmente. Los perfiles OSEP y Mayor/Full, escalas sin punto, agrupación, forzada y vencimiento de fijos no quedan habilitados por este adaptador. OSEP de 759 y la liquidación integral siguen abiertos.

## Interfaz y estado de entrega
Se añadió un modelo de cliente que comprueba coincidencia del archivo, cantidades, destinos y recibo. La primera escritura de `assets/payroll-grh-import-panel.js` fue rechazada y una comprobación inmediata confirmó que el panel y la página no existían. No se reintentó esa creación por otra herramienta. Una relectura posterior encontró tres archivos locales de interfaz (panel, CSS y HTML) que no se atribuyen a esa operación bloqueada: se preservaron y se registraron sus hashes, pero quedan fuera de este incremento, de su commit y de la publicación. No se ejecutó el parche de navegación/build que dependía de ellos. El modelo de cliente tampoco está incluido en los assets públicos.

Por ello la PR debe seguir en borrador. No se instruye a Noelia a usar esta importación como terminada. Falta la interfaz operativa, prueba autenticada del circuito completo y el motor de anulación/reproceso; las opciones actuales de lotes no los sustituyen. La firma digital y los worktrees de recibos, informes y presupuesto permanecen separados.

## Verificaciones ejecutadas
139 pruebas focales de contrato, HTTP, comprobación cliente, perfiles y regresiones, todas aprobadas. Incluyen un recorrido HTTP sintético de doce filas desde preview hasta acuse, rechazo de otra identidad/período/fuente, capacidades/origen/JSON/idempotencia y negativa a guardar 501 filas parcialmente. No constituyen una sesión personal de Noelia.

En PostgreSQL 17 local se ejecutaron las fachadas reales heredadas: siete comprobaciones de preparación, recibo, repetición e idempotencia y tres del guardado de doce filas en un solo lote. Una prueba introduce deliberadamente otro legajo en el escritor: la condición posterior revierte tanto lote como auditoría. No se sustituyó ese escritor con un stub. El andamiaje de IAM/SoD y las personas son los fixtures sintéticos documentados del proyecto; se conservaron las 359 regresiones heredadas.

Otros quince controles SQL comprobaron la consulta de candidatos por empresa, municipio, fuente, DNI, estado, fechas y ambigüedad, incluida una identidad mal formada que no debe provocar un cast numérico. Todos los esquemas y registros de QA se revirtieron; no se ejecutaron estas escrituras sobre Neon ni GRH.

El workflow GRH original TXT intake vuelve a ejecutar contratos/build y las pruebas SQL en PostgreSQL 17 y 18. Su resultado, el identificador del commit y el estado de publicación se registran en la PR, sin equiparar CI a aceptación municipal.

Construcción completa al cierre: **5.904 pruebas aprobadas, cero fallos y dos omitidas**, seguida de build estático correcto. La primera construcción detectó las anotaciones de versión que faltaban junto a los SHA ya fijados de actions/checkout y setup-node; se añadieron esas anotaciones conforme al contrato del proyecto, sin modificar las pruebas. Los hashes del código se verificaron antes y después del ensayo. La comprobación del build confirmó que ni la página de importación ni el nuevo modelo de cliente se publican desde este incremento.
