# MuniControl · plan de cierres funcionales

Base contrastada el 30/09 en esta conversación: master y producción en `47117de7060f9c2f50b841f69c215ad2af4eef4a`, PR #70. Este plan conserva los diez módulos de Noelia y los circuitos de Hugo, Mariano, Marcelo, administrativos y empleados. No reemplaza sus criterios de aceptación ni declara el reemplazo integral de GRH terminado.

## Entregas que se conservan

PR #68: incidencias CSV de la previa completa, enlace al lote, revisión de lotes y correcciones del preparte. PR #69: recuperación voluntaria del acceso al importador, con el intento incierto intacto. PR #70: comparación y revisión completa de novedades fijas. Todas tienen resultados locales/CI/publicación separados de la aceptación humana.

También se conservan alta municipal propia, ficha, hijos/escolaridad, catálogo administrativo de encuadres, novedad mensual individual propia, biblioteca de recibos y reportes, reconstrucción/preparte de asistencia y ciclo administrativo de nómina. Sus límites siguen vigentes: crear un legajo no crea una cuenta, y un control aprobado o exportado no acredita cálculo salarial.

## Alta propia verificable · entrega conservada

La confirmación compara los datos disponibles en el recibo con el formulario revisado. El municipio y la membresía se obtienen del acceso autenticado existente; el intento se vincula a ese ámbito. Antes del primer envío se releen permisos y catálogo. Si cambia el catálogo, se conservan los datos personales y se exige revisar el encuadre nuevamente. La previa incluye nacimiento, sexo informado y función, además de los campos anteriores.

Una respuesta incierta conserva en memoria el cuerpo y la clave. Una negativa posterior o un 404 no habilitan otra alta. Ocultar, cerrar el diálogo o retirar permisos elimina los datos visibles; comprobar acceso y recuperar el intento son acciones distintas. El servidor comprueba el ámbito fijado antes de leer el cuerpo o abrir la conexión de escritura. No se amplían permisos ni se agregan migraciones.

PR #71 integrada y producción contrastada en `c809790769de9dab97fd25c3ad883d4a5f686978`. Esto refuerza el alta existente; todavía no agrega rectificación, baja, reingreso o licencias propias.

## Incremento del 01/10: padrón propio consultable y descargable

[Consulta y exportación del padrón propio](PADRON_PROPIO_CONSULTA_EXPORTACION_20261001.md): filtros por identidad informada, situación, jurisdicción y encuadre; cantidades separadas de contratos/personas; ficha por UUID; Excel/CSV de todas las páginas del filtro. Una consulta lee los registros propios y sus cantidades sin reconstruir vistas GRH. Se conserva el validador de acceso nativo y el binding certificado existente. Las descargas releen el conjunto y requieren revisión si cambió. No crea movimientos de Personal ni declara completa la fase 1. Pruebas/publicación se acreditan en su resultado.

## Fases siguientes y aceptación

| Fase | Resultado a cerrar | Evidencia necesaria y límite |
|---|---|---|
| 1. Padrón propio operativo · módulos 1/5 | Alta → ficha/familia → novedades; después rectificación, baja, reingreso y licencias sobre el contrato propio | Identidad por UUID explícito, historial, permisos, versiones y recuperación sin duplicados. Comprobar todo con un legajo inexistente en GRH; no confundir el catálogo de altas futuras con cambios a contratos existentes. |
| 2. Novedades completas · módulos 3/5 | Manuales y masivas propias, otros diseños, OSEP y corrección/anulación auditada del conjunto | Archivo completo, sin recorte ni partición silenciosa; identidad/contrato explícitos y lote reproducible. El escritor publicado sigue en 500 y el núcleo en memoria de PR #67 no es un escritor operativo. |
| 3. Parámetros y cálculo · módulos 6/7 | Reglas/vigencias aprobadas → población por legajo/convenio/repartición/todos y tipo → cálculo reproducible → diferencias → confirmar/cerrar/anular con versiones | Fuentes municipales homologadas, escala/unidad/redondeo explícitos y la misma selección en cada comando. `payrollCalculated:false` conserva su significado. No inferir fórmulas de una captura ni restaurar el evaluador rechazado. |
| 4. Personal y asistencia · Hugo/Mariano | Marcas originales completas → vínculo temporal → turnos/reglas → incidencias → revisión independiente → cantidades aprobadas para Noelia | Separar tiempo observado, computable, reconocido y pagable. Cobertura faltante no implica ausencia ni cero. Conservar correcciones aparte del reloj y entregar sin doble novedad. |
| 5. Operación continua de relojes | Un colector por identidad, cola/ACK durables, reinicio y desconexión recuperables, puntos restantes homologados | Prueba física de entrada/salida/pausa nueva con la PC de Marcelo apagada. La VM existente y un puerto alcanzable no acreditan autonomía. Su operación permanece separada del desarrollo de nómina. |
| 6. Salidas de la misma corrida · módulos 2/4/8/9/10 | Contabilidad conciliada, formatos de organismos, informes, recibos por agente y cargos liquidados frente al presupuesto de cada año | Misma población/período/tipo/revisión; archivos homologados por receptor. Cargo presente en un PDF no demuestra cargo liquidado. Firma continúa en el frente de Hugo/Noelia. |

Las fases describen dependencias y cierres, no una autorización para ejecutar en producción cálculos, pagos, cambios nominales, firmas o conexiones por una orden genérica. Cada incremento debe terminar con pruebas sintéticas, build y navegador cuando corresponda, CI y SHA de producción exacto; la aceptación de los responsables queda registrada por separado.

## Frentes que permanecen aplazados

Los siete archivos locales de rutas/publicación se conservan aparte, sin adopción ni ejecución sobre el build. El gate canónico del importador mantiene `PUBLISHED_ROUTE_MISSING`. No se reconstruyen el resolvedor nativo, el evaluador ni las migraciones operativas rechazadas. PR #61 documenta rechazo de integración/exportación multiperíodo: no se reintenta. PR #50 exige conciliación de fuente histórica con la misma corrida antes de adoptar el histórico; PR #64 quedó superada parcialmente por las entregas posteriores de importación. Su existencia no autoriza una fusión.

Fuentes: [criterios de los diez módulos](MATRIZ_ACEPTACION_NOELIA.md), [prioridades y brechas](NOELIA_PRIORIDADES_Y_BRECHAS_20260930.md), [asistencia de Hugo](ASISTENCIA_CALCULO_Y_APROBACION_HUGO_20260923.md), [tiempo y operación](PLAN_TIEMPO_AUSENTISMO_OPERACION_20260924.md). Los originales municipales, audios y respaldo del 22/09 permanecen privados y no se publican.
