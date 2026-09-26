# Feedback operativo de Noelia · antigüedad, acceso y cargos

## Base de esta entrega

Se partió de GitHub `master` en `d01aac201537291210ca2390e22f12e4dd14abdb`, igual a la copia limpia de trabajo. La referencia son las capturas de la ficha, parámetros, análisis externo y estructura recibidas de Marcelo, no funciones supuestas de otros productos.

## Implementado: tiempo desde el ingreso

La ficha conserva el bloque y el menú rápido de **Antigüedad informada por GRH al corte**. Ahora presenta por separado una referencia de **Tiempo desde el ingreso**, en años y meses completos. Para ingreso 01/07/2013 y corte 10/09/2026 muestra **13 años y 2 meses**, sin convertir el cero del padrón en un dato corregido.

Se usa exclusivamente el corte verificado del mismo contrato y lote. El instante del corte se interpreta en Mendoza; no se toma el día actual del navegador, otra nómina ni otra persona. Si hay egreso anterior al corte, se limita el intervalo al egreso. Sin fechas válidas o con ingreso posterior al corte no se inventa un resultado.

La convención es meses calendario completos, ajustando el aniversario al último día del mes cuando ese día no existe. No reconoce antigüedad salarial, no agrega servicios anteriores y no deduce interrupciones no informadas. Se indica si coincide numéricamente, difiere o no puede compararse con los componentes de origen. Los originales, incluso cero o meses fuera de rango, siguen visibles.

Los módulos se descargan en paralelo al abrir la ficha y el cálculo es local sobre los datos ya autorizados: no agrega peticiones de nómina ni de empleados. El menú de secciones que Noelia validó no fue reemplazado.

## Implementado: entrada visible al detalle documental de cargos

Estructura incluye una entrada destacada a **Abrir detalle nominal de cargos**, que lleva al módulo documental existente. Allí se procesa el reporte PDF detallado para buscar cargos, legajos y nombres, ordenar y exportar. El archivo se procesa en el navegador bajo los controles existentes.

Esto corrige la dificultad para encontrar ese circuito, **no incorpora automáticamente el PDF a Neon ni crea una nómina nominal desde los agregados**. El módulo 10 sigue exigiendo cotejar cargos liquidados con cargos presupuestados del ejercicio y producir el informe detallado. La agrupación por organización no se declara equivalente a ese presupuesto ni se interpreta Cant 0 como vacante.

## Acceso: corrección aplicada; aceptación real pendiente

La lectura de configuración detectó que el perfil `MUNICIPIO_ADMIN_OPERATIVO` ya poseía las capacidades necesarias, pero una pareja de catálogo (`employee.catalog.approve / employee.catalog.propose`) todavía no estaba reconocida por la regla de responsabilidades revisadas. Eso bloqueaba tareas no relacionadas y certificados lo presentaba como si la sesión hubiese vencido.

La regla instalada en Neon ya reconoce esa pareja y `school_certificate_context_v1` separa conflicto de perfil, sesión inválida y falla del servicio. El perfil operativo conserva **89 capacidades** y la comprobación posterior informa **0 pares SoD sin revisar**; no se amplió la membresía ni se eliminó la protección de autoaprobación. Falta la aceptación final con una sesión real de Noelia: abrir Hijos/Certificados y Parámetros, efectuar una alta controlada y reabrir el vínculo.

## Pendientes funcionales que no deben perderse

| Caso | Estado de este incremento | Criterio de cierre que falta |
| --- | --- | --- |
| Agregar hijo/a y registrar certificados | Gate de perfil corregido en Neon; aceptación real pendiente | Alta y reapertura del vínculo con sesión de Noelia, persistencia e idempotencia comprobadas. |
| Parámetros salariales | Gate de perfil corregido en Neon; aceptación real pendiente | Lectura/preparación con Noelia y revisión independiente conforme al perfil aprobado, sin autoaprobación por otra cuenta de la misma persona. |
| Tiempo desde ingreso | Implementado | Acreditar publicación y aceptación del recorrido; no sustituye antigüedad salarial reconocida. |
| Estructura módulo 10 | Entrada documental visible | Incorporación nominal gobernada y conciliación con presupuesto anual; el reporte detallado ya existente no se presenta como conciliación terminada. |
| Concepto 638 AMARU / TXT | Implementado y publicado | Homologación final contra un archivo aceptado por AMARU si el Municipio dispone de uno; el contrato aplicado es Formato Junin / amaru.txt. |
| Módulo 7: anular, confirmar/liquidar y cerrar | Implementado en código y esquema 109 aplicado | Confirmación final del despliegue del commit y aceptación municipal; conserva maker-checker, idempotencia e historial. |

Las capturas refuerzan estas prioridades por encima de mejoras accesorias. El candidato del 22/09, la revisión nativa de las 27 tablas y los restantes módulos mantienen sus estados anteriores. El expediente de proveedores continúa diferido hasta la autonomía.

## Verificación

Pasaron **19 pruebas unitarias nuevas** y las seis regresiones del modelo de fuente. El build local terminó con **5.341 aprobadas, cero fallos y dos omitidas**. La aceptación visual pasó **10 recorridos de ficha** y **12 de estructura documental**, con APIs y PDF sintéticos. Se revisaron las capturas de escritorio y 390 píxeles; la prueba documental conserva nombres y legajos sintéticos en el PDF detallado y los omite en el simple.

Estas pruebas no son una sesión real de Noelia. Los resultados del CI, la paridad de archivos publicados y el commit final se registran al cerrar el despliegue. No hubo escrituras de negocio, modificaciones salariales, cambios de permisos ni promoción de fuentes en esta entrega.

## Cierre de navegación entre módulos

La entrada de Estructura apunta a **Centro de reportes → Estructura de cargos**, mediante la ruta canónica `/reportes#estructura-presupuestaria`; no a un ancla inexistente en la página agregada. La revisión final corrigió esa ruta y amplió la prueba: extrae el enlace del HTML construido, resuelve la página real y abre el módulo documental dentro del Centro de reportes.

La aceptación integrada del Centro de reportes pasó **22 recorridos**, incluida la entrada nominal, denegación sin las dos capacidades de lectura, apertura de un PDF sintético con su worker real y conservación del detalle al cambiar de pestaña. La prueba aislada del documento conserva sus **12 controles**; ya no se utiliza su montaje aislado para acreditar una navegación entre páginas.

Este ajuste de ruta se publica en un commit posterior, sin reescribir el commit anterior. La versión final y su CI se acreditan con el despliegue exacto. No cambia el alcance pendiente de ocupación nominal persistente, presupuesto anual, permisos ni liquidación.

## Actualización P0 · perfil operativo y TXT 638 AMARU

La comprobación posterior del destino operativo confirmó que el perfil `MUNICIPIO_ADMIN_OPERATIVO` mantiene **89 capacidades** y ya no presenta pares de separación de funciones sin revisar. Las dos membresías operativas activas pasan `tenant_iam_assert_no_sod_conflict`. La pareja que originaba el bloqueo, `employee.catalog.approve / employee.catalog.propose`, está incluida en la regla revisada y `school_certificate_context_v1` distingue conflicto de perfil, sesión inválida y falla de servicio. Esto resuelve el bloqueo de autorización en la base; la aceptación final sigue requiriendo abrir una sesión real de Noelia y ejecutar alta/reapertura de hijo y acceso a Parámetros.

Para **638 AMARU** se dejó de inferir el archivo desde CUIL/nombre. La evidencia del respaldo GRH vigente define `idformato=1`, **Formato Junin**, archivo **amaru.txt**, con dos campos: DNI en posición 5 longitud 8 e importe en posición 44 longitud 11. El exportador nuevo toma únicamente versiones aprobadas del concepto 638 del período y exige el mismo snapshot consultado. Los 55 bytes se completan con espacios fuera de esos campos; no incluye CUIL ni nombre. El separador CRLF sin terminador final es una convención técnica de MuniControl: el respaldo fija campos y posiciones, pero no documenta el fin de línea del receptor.

La función privada `payroll_fixed_registry_junin638_v1` está instalada en Neon con ese contrato y sólo queda expuesta al rol runtime existente. No agrega capacidades ni modifica nómina. Las pruebas de navegador usan datos sintéticos; antes de presentar el TXT a AMARU debe cotejarse al menos un archivo aceptado por el receptor si se dispone de él.

El analizador de **Migración y controles externos** conserva su función: validar un archivo local sin importarlo. Ahora ofrece el mismo layout de Formato Junin como previsualización y enlaza explícitamente al exportador de Novedades fijas; deja de sugerir que esa pantalla genera el descuento.
