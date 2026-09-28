# Módulo 10 · estructura presupuestaria de cargos y ocupantes

## Requerimiento operativo de Noelia

La fuente funcional es el reporte **10º MÓDULO ESTRUCTURA PRESUPUESTARIA DE CARGOS** y la actualización **ESTRUCTURA PRESUPUESTARIA DE CARGOS AL 23.09.2026**. El objetivo indicado es controlar los cargos liquidados contra los presupuestados de cada ejercicio y disponer del detalle en PDF. La versión actualizada del reporte agrega las filas nominales de legajo y nombre dentro de cada estructura.

## Implementación

El PDF se procesa localmente en el navegador: no se sube al servidor. MuniControl conserva cada estructura, el valor literal **Cant**, clasificación, estado, vacante, página fuente y sus ocupantes nominales.

El operador selecciona una corrida concreta ya incorporada a MuniControl. El backend del cotejo devuelve únicamente los números de legajo de esa corrida; no expone nombres, DNI, CUIL ni importes. Sobre esas dos evidencias se construyen cuatro estados:

- **En documento y corrida**: el legajo figura en el detalle presupuestario y en la corrida elegida.
- **Sólo en documento**: figura como ocupante en el PDF pero no aparece en esa corrida.
- **Sólo en corrida**: la corrida contiene el legajo pero ningún cargo del PDF lo menciona.
- **Referencia repetida**: el mismo identificador no puede asignarse inequívocamente y queda para revisión.

La pantalla muestra resumen por cargo y, debajo, el **detalle nominal** con cargo/estructura, Cant, legajo, nombre según PDF, presencia en la corrida y página fuente. Se puede buscar por cargo, legajo o nombre y cambiar entre todos los ocupantes y sólo diferencias.

## Exportaciones

Se mantienen PDF/CSV de resumen y se agregan **PDF detalle nominal** y **CSV detalle nominal**. Cada descarga vuelve a autorizar al operador y vuelve a leer la corrida exacta antes de emitir. Un cambio de fuente o pérdida de permiso retira el resultado y bloquea el archivo.

El detalle exportado usa los nombres del PDF local. Para legajos sólo presentes en nómina muestra “No provisto por este cotejo”; no completa un nombre desde otra fuente.

## Límite técnico y corrección de evidencia del 27/09

El endpoint publicado de este cotejo devuelve sólo la presencia del legajo en una corrida. Que employment_contract.position_source_id esté vacío no demuestra ausencia de cargo histórico en GRH.

La revisión posterior encontró cargo, estructura y detalle en histolegajo. El extractor existente los conserva y el importador ya dispone de payroll_snapshot_assignment.role_name/budget_structure/budget_detail. La consulta agregada de Neon confirmó 854 snapshots de agosto (801 con esos tres campos) y 847 de septiembre (794 con ellos), sin consultar ni publicar identidades individuales.

Todavía no está acreditada la unión exacta entre esos snapshots y la corrida del catálogo documental: la comprobación por huella del respaldo, base, empresa, fecha, período, mes y tipo no encontró coincidencia de fuente. No se unen registros sólo porque compartan legajo o mes, ni se presenta el cargo del padrón actual como cargo liquidado histórico.

El control publicado continúa siendo **cargo presupuestario del PDF → ocupante nominal → presencia en la corrida seleccionada**. El siguiente incremento debe reconciliar la identidad de los respaldos o incorporar la nómina derivada del mismo respaldo ya verificado, y luego extender el contrato de lectura con esa evidencia. No corresponde solicitar nuevamente un campo que ya existe en los archivos recibidos.

La fuente anual aprobada por cargo y vigencia sigue siendo una evidencia separada: la fecha de emisión del PDF y su campo Cant no se convierten automáticamente en el ejercicio ni el cupo legal. No se promovió un respaldo nuevo, ni se cambió una nómina, un cierre o un pago.

## Verificación

- Pruebas unitarias cubren coincidencia exacta y numérica, ocupantes, legajos sólo en nómina, filtro de diferencias, búsqueda y ausencia de datos financieros/personales adicionales.
- El navegador sintético verifica búsqueda, filtros, cuatro exportaciones, reautorización, cambio de fuente, cancelación, pérdida de permiso y responsive a 390 px.
- En la aceptación sintética: 35 filas nominales del documento + 1 legajo sólo en nómina = 36 filas completas; 33 referencias quedan en el modo sólo diferencias.
- El PDF sintético nunca sale del navegador y no hubo escrituras de negocio.

## Criterio de cierre

Este incremento cierra la visualización y exportación nominal pedida por Noelia y deja explícita la limitación de la fuente para afirmar “cargo liquidado”. No modifica presupuesto, cargos, legajos ni liquidaciones.

La aceptación municipal con el PDF real del 23/09 y una corrida elegida por Noelia sigue siendo una validación operativa separada; no se sustituye con el fixture sintético.
