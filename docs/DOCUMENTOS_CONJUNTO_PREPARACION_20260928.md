> Registro de la preparación inicial. La integración posterior está documentada en DOCUMENTOS_PDF_CONJUNTO_20260928.md; los límites históricos de esta nota no describen la versión final.

# Preparación local del PDF conjunto · pendiente de integración

## Alcance comprobado
Base: `9c23b9edd3bd9926ab72ad50a4606e67db8d09a5`. La firma digital sigue en el frente de Hugo y Noelia. No se modificó el trabajo paralelo del Módulo 9 ni se cambió la base municipal.

Se preparó un recolector puro que utiliza el contrato de los lectores existentes: recorre todas las páginas del rango, verifica la huella de la población completa, exige identificación única, lee todos los conceptos, compara la corrida exacta y relee cada documento antes de devolver un resultado. Una falta, cambio o cancelación no devuelve una colección parcial. El plazo máximo es cinco minutos, con hasta tres lecturas concurrentes y límites explícitos de tamaño.

La huella de población se recalcula con el mismo contenido del contrato: municipio, conjunto, padrón, filtros y filas ordenadas. La comprobación final previa a descargar está implementada como función separada que exige la misma selección; no constituye autorización independiente del backend.

El renderer del documento individual se separó internamente de la serialización PDF. El documento de prueba individual conservó exactamente sus bytes anteriores. El renderer conjunto genera una portada/índice por legajo y agrega cada documento con todos sus conceptos, conservando sus advertencias y referencia de origen. No acredita pago, no emite recibos y no aplica firmas.

## Pruebas locales
Se aprobaron 51 pruebas de recolección y opciones de mes/tipo. El caso de 55 agentes recorre ambas páginas del rango y relee los 55 documentos, sin limitarse a la página visible. Se rechazan fuentes cambiadas, filas manipuladas, identidades repetidas, ausencia de documentos, errores y cancelación.

El PDF sintético de tres agentes tiene diez páginas, índice con rangos correctos y cero texto fuera de los límites en la comprobación realizada. No se usaron datos municipales. Los cuerpos generados permanecen en verification/, ignorado por Git.

## Integración NO aplicada
La herramienta bloqueó la continuación del parche que conectaba generación y filtros al panel. El bloque no fue guardado ni ejecutado; la propuesta parcial de verification/wire-batch-workspace.mjs no modifica el panel por sí sola y no debe ejecutarse. No se incorporó un botón funcional de descarga conjunta ni se añadió el nuevo recolector al build.

Esta rama es preparación revisable, no una nueva funcionalidad publicada. Se conserva en borrador; no debe integrarse como si cerrara el Módulo 9. La fecha de acreditación/pago, emisión oficial, acceso propio del agente y firma siguen fuera de este código. El filtro por mes de fecha de liquidación no debe confundirse con el período de origen de una liquidación de ajuste.
