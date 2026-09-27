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

## Límite técnico que no se oculta

En la población actual de Junín, `employment_contract.position_source_id` está vacío para los 2.452 vínculos y `grh_employees.cargo_code/cargo` tampoco aporta un cargo utilizable. Por lo tanto **la presencia de un legajo en una corrida no demuestra qué cargo presupuestario se liquidó**.

MuniControl no hace matching por semejanza de nombres ni asigna un cargo supuesto. El control defendible con las fuentes actuales es:

**cargo presupuestario del PDF → ocupante nominal del PDF → presencia del legajo en la corrida seleccionada**.

Cuando una futura fuente de nómina aporte cargo/posición por legajo, el contrato podrá extenderse a una conciliación cargo-a-cargo sin reinterpretar los resultados históricos.

## Verificación

- Pruebas unitarias cubren coincidencia exacta y numérica, ocupantes, legajos sólo en nómina, filtro de diferencias, búsqueda y ausencia de datos financieros/personales adicionales.
- El navegador sintético verifica búsqueda, filtros, cuatro exportaciones, reautorización, cambio de fuente, cancelación, pérdida de permiso y responsive a 390 px.
- En la aceptación sintética: 35 filas nominales del documento + 1 legajo sólo en nómina = 36 filas completas; 33 referencias quedan en el modo sólo diferencias.
- El PDF sintético nunca sale del navegador y no hubo escrituras de negocio.

## Criterio de cierre

Este incremento cierra la visualización y exportación nominal pedida por Noelia y deja explícita la limitación de la fuente para afirmar “cargo liquidado”. No modifica presupuesto, cargos, legajos ni liquidaciones.

La aceptación municipal con el PDF real del 23/09 y una corrida elegida por Noelia sigue siendo una validación operativa separada; no se sustituye con el fixture sintético.
