# Documentos: verificar la corrida antes de mostrar importes y exportar

## Coordinación y alcance
La firma digital está siendo cerrada por Marcelo con Hugo y Noelia, según su actualización en esta conversación. Se mantiene fuera de este sprint: no se modifican firma, certificados, permisos ni el trabajo paralelo del Módulo 9. No se presenta esa coordinación como una certificación ya terminada.

Base de trabajo: master `2a08dcd8ac653e8d216444ab89e37eb7b85c9156` (PR #54). Se corrige el pendiente de integridad identificado allí. El control de backend existente se conserva; el cambio refuerza la validación del cliente antes de renderizar o exportar. El ensayo es sintético, no evidencia de una liquidación municipal incorrecta.

## Reproducción y corrección
Una respuesta con el mismo datasetId pero fecha, período y tipo diferentes mostraba el detalle y dos botones de exportación. Se repitió la reproducción antes de modificar el panel: `wrongPeriodVisible=true`, `exportButtons=2`. Con la corrección: `wrongPeriodVisible=false`, `exportButtons=0`.

La selección se captura de forma inmutable antes de la primera petición. Se verifica la fecha de calendario completa, el período, el mes y el tipo; un identificador de dataset, cuando está presente, debe tener formato válido. Una selección inválida no dispara la consulta.

Una respuesta disponible debe coincidir con esos campos antes de construir el modelo, mostrar identidad/importes o habilitar PDF/Excel. No basta compartir el datasetId. El mensaje conserva la instrucción de actualizar cuando la fuente o la selección difieren.

La fecha conserva el día civil declarado por la fuente, sin convertir una hora tardía al día siguiente. No se deduce el período a partir de esa fecha: una liquidación de ajuste puede tener período distinto, siempre que sea el solicitado.

Al consultar desde un resumen sin dataset explícito, se fija el dataset de la primera respuesta válida. La reconsulta de exportación debe conservar también ese dataset, además del identificador de declaración, huellas y modelo ya revisados. No puede cambiar de fuente silenciosamente manteniendo los mismos importes o hashes.

## Pruebas locales
- 39 pruebas nuevas de selección: tipos, fechas imposibles, fecha civil con zona horaria, enteros de origen, rango de período/mes, captura inmutable, ausencia de dataset inicial, identificadores inválidos y discrepancias de respuesta.
- 82 pruebas focales al incluir las regresiones existentes de detalle/API.
- 21 recorridos nuevos de navegador: bloqueo inicial antes de mostrar importes, selección inválida sin peticiones, exportación de fuente distinta sin archivo, corrección tras reabrir y móvil a 320/390 px.
- Regresiones aprobadas: detalle individual (13), accesibilidad del visor (14), selección documental por rangos (15), biblioteca documental (13) y paginación (20).
- Construcción completa: 5.552 aprobadas, cero fallos y dos omitidas.
- PDF sintético verificado: tres páginas, sin texto fuera de página. El exportador no cambia; el detalle correcto conserva todos los conceptos al exportar.

## Publicación y pendientes separados
El nuevo módulo de validación y su dependencia de fecha civil se incluyen en el build y en los controles de paridad pública. El workflow de UX existente contempla las nuevas pruebas antes y después de integrar, sin retirar comprobaciones anteriores.

Los identificadores de PR, commit integrado, estado READY y resultados reales de CI/publicación se registran en el cierre de la entrega, no se infieren de la prueba local. Las pruebas de navegador usan respuestas y personas sintéticas; no se inició la sesión personal de Noelia ni se escribió en la base municipal.

No se cambia la emisión masiva, fecha de acreditación/pago, descarga propia del agente, los cargos históricos de PR #50 ni la homologación AMARU. La firma digital sigue en el trabajo coordinado con Hugo y Noelia y no es una tarea a duplicar aquí.
