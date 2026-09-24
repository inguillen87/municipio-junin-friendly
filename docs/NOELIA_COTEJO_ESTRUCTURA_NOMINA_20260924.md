# Noelia · cotejo documental de estructura con una corrida de nómina

## Objetivo y alcance de este incremento

El módulo 10 entregado por Noelia pide controlar cargos liquidados contra los presupuestados del ejercicio y obtener el detalle en PDF. La captura de la segunda página distingue vista simple/detallada, activos Sí/No/Todos y orden por legajo/alfabético. La estructura de referencia del 23/09/2026 es un reporte documental de 51 páginas; no se convierte su columna Cant en cupo anual aprobado.

Este incremento añade al Centro de reportes → Estructura de cargos un **cotejo agregado de presencia de legajos** entre el PDF local completo y una liquidación concreta conservada en MuniControl. No prueba que el cargo/clase de esa liquidación sea el correcto ni que exista plaza presupuestaria autorizada. Es un paso verificable hacia el módulo 10, no su cierre total.

## Funciones incorporadas

La consulta de liquidaciones es manual y muestra fecha, tipo y población del conjunto. Abrir el PDF no dispara una lectura de nómina. Seleccionar una corrida no implica sumar todas las liquidaciones del mes; el catálogo informa cuando tiene un límite de resultados.

Se muestran cuatro resultados: referencias presentes en ambas fuentes, sólo en el documento, sólo en la corrida y referencias repetidas que requieren revisión. La tabla agrupa por estructura original y conserva Cant y cantidad de filas del detalle por separado. La coincidencia no se hace por nombre.

La comparación predeterminada conserva el texto exacto del número, incluidos sus ceros. Existe un modo numérico elegido explícitamente que conserva los números originales y deja las colisiones sin resolver. Una referencia en varias estructuras no se asigna arbitrariamente a una de ellas. Los recuentos de referencias no equivalen a personas únicas, vacantes ni cargos aprobados.

El cotejo siempre usa el documento completo. La búsqueda del visor superior no modifica silenciosamente esa población. La tabla de cotejo muestra hasta 20 estructuras por página; el PDF y el CSV agregados incluyen todas las estructuras. El visor documental mantiene sus exportaciones originales simples/detalladas.

## Lectura y protección de datos

Dos recursos internos, `budgetpayrollcatalog` y `budgetpayrollroster`, requieren las capacidades existentes de estructura, legajos y nómina, además del acceso municipal y la vinculación de fuente certificada. Reutilizan los lectores de catálogo y padrón de nómina; no añaden un acceso propietario a tablas, roles nuevos ni migraciones SQL.

La respuesta nueva de población contiene solamente números de legajo y metadatos de la corrida. No devuelve nombres, DNI, CUIL, sexo, cuentas, conceptos o importes. El cotejo agregado no añade otra tabla nominal. El PDF original sigue procesándose localmente: no se sube ni persiste en el navegador.

Antes de exportar se reautoriza la sesión y se relee el conjunto exacto. Si cambian sus hashes, población, institución o contexto, no se exporta el resultado anterior. Cancelar o retirar el PDF invalida respuestas tardías y limpia el cotejo. La rutina reutilizada mantiene su auditoría habitual de lecturas; no se modifican cargos, contratos, conceptos ni liquidaciones.

## Verificación de este incremento

En el árbol de trabajo aislado, `npm run build` terminó con 4.782 pruebas aprobadas, cero fallos y dos omitidas. Las 71 pruebas existentes de estructura y padrón también aprobaron. Son controles de regresión; no se presentan como pruebas nuevas de todos los casos del modelo.

`node scripts/verify-budget-cotejo-browser.mjs` aprobó nueve recorridos con un PDF nativo y respuestas API sintéticas: carga bajo demanda, comparación del documento completo, exportación íntegra, PDF leído nuevamente, fuente cambiada sin descarga parcial, móvil de 390 píxeles, cancelación, limpieza y pérdida de acceso. `node scripts/verify-budget-structure-browser.mjs` aprobó los once recorridos del visor original.

La versión de producción y su CI se acreditan con el commit y el estado del despliegue. Estas pruebas no acreditan una cuenta real de Noelia operando datos municipales ni su aceptación funcional.

## Pendientes que no se cierran con este cotejo

El módulo 10 aún necesita la fuente aprobada del ejercicio, su versión y vigencia; el vínculo cargo/clase/jurisdicción con la asignación exacta de la corrida; diferencias justificadas y aprobación funcional. El filtro de activos no se infiere del PDF ni del estado actual de un contrato histórico. La presencia en nómina no equivale a validación de un cargo.

El módulo 9 conserva el pedido de rangos de legajos y reparticiones, período, fecha de acreditación/pago, tipos, PDF, firma digital y descarga por cada agente. Este incremento no emite recibos, no aplica firmas y no acredita pagos. Continúan también los cierres de módulos 1–8 y la integración contable.

Relojes, Hugo, Mariano y superadministración mantienen el plan `PLAN_TIEMPO_AUSENTISMO_OPERACION_20260924.md`. Se encontró otro árbol con cambios sin confirmar de la flota y se dejó intacto: este trabajo usa `municontrol-budget-reconcile-20260924` desde `eafb852`. No se alteraron servicios, inscripciones ni colas de relojes. La promoción del respaldo del 22/09 tampoco se realizó aquí.

## Comandos de reproducción

- `npm run build`
- `node scripts/verify-budget-cotejo-browser.mjs`
- `node scripts/verify-budget-structure-browser.mjs`

Los archivos y capturas bajo `verification/` son evidencia sintética de prueba y no forman parte del contenido municipal publicado. Los documentos originales nominales se mantienen fuera del repositorio.
