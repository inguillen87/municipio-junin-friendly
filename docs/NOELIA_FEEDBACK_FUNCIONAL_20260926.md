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

## Acceso: diagnóstico real, corrección no aplicada

La lectura de configuración detectó un perfil operativo activo con capacidades simultáneas de preparación y revisión en conflicto. Esto corresponde a la autorización municipal, no a un plan comercial. Las funciones instaladas coinciden con las versiones revisadas: `school_certificate_context_v1` transforma excepciones no enumeradas, incluida la de separación de funciones, en `SCHOOL_CERTIFICATE_SESSION_INVALID`. Por eso el mensaje de sesión vencida no permite distinguir ese fallo de configuración.

El intento de generar una corrección de autorización fue bloqueado por los controles de la herramienta. Se retiró el borrador incompleto; no se aplicó ninguna migración, excepción de acceso, modificación de rol ni alternativa para saltar el bloqueo. Tampoco se publicó un cambio de texto como si hubiese habilitado agregar hijos o preparar parámetros. El diagnóstico detallado quedó privado, fuera de Git y de los archivos públicos.

## Pendientes funcionales que no deben perderse

| Caso | Estado de este incremento | Criterio de cierre que falta |
| --- | --- | --- |
| Agregar hijo/a y registrar certificados | Acceso diagnosticado; no desbloqueado | Perfil/contexto correctos, alta y reapertura del vínculo, persistencia e idempotencia comprobadas. |
| Parámetros salariales | Conflicto real de funciones diagnosticado; no desbloqueado | Lectura/preparación y revisión independiente conforme al perfil aprobado, sin autoaprobación por otra cuenta de la misma persona. |
| Tiempo desde ingreso | Implementado | Acreditar publicación y aceptación del recorrido; no sustituye antigüedad salarial reconocida. |
| Estructura módulo 10 | Entrada documental visible | Incorporación nominal gobernada y conciliación con presupuesto anual; el reporte detallado ya existente no se presenta como conciliación terminada. |
| Concepto 638 AMARU / TXT | Pendiente | Confirmar el formato de salida real y su alcance. La captura corresponde a **analizar una fuente externa**, no a exportar un TXT; no cambiar extensión de un CSV para simularlo. |
| Módulo 7: anular, confirmar/liquidar y cerrar | Pendiente de circuito completo | Operaciones reales con estados, revisión independiente, idempotencia, preservación de historial y aceptación municipal. No se agregaron botones que aparenten liquidar. |

Las capturas refuerzan estas prioridades por encima de mejoras accesorias. El candidato del 22/09, la revisión nativa de las 27 tablas y los restantes módulos mantienen sus estados anteriores. El expediente de proveedores continúa diferido hasta la autonomía.

## Verificación

Pasaron **19 pruebas unitarias nuevas** y las seis regresiones del modelo de fuente. El build local terminó con **5.341 aprobadas, cero fallos y dos omitidas**. La aceptación visual pasó **10 recorridos de ficha** y **12 de estructura documental**, con APIs y PDF sintéticos. Se revisaron las capturas de escritorio y 390 píxeles; la prueba documental conserva nombres y legajos sintéticos en el PDF detallado y los omite en el simple.

Estas pruebas no son una sesión real de Noelia. Los resultados del CI, la paridad de archivos publicados y el commit final se registran al cerrar el despliegue. No hubo escrituras de negocio, modificaciones salariales, cambios de permisos ni promoción de fuentes en esta entrega.

## Cierre de navegación entre módulos

La entrada de Estructura apunta a **Centro de reportes → Estructura de cargos**, mediante la ruta canónica `/reportes#estructura-presupuestaria`; no a un ancla inexistente en la página agregada. La revisión final corrigió esa ruta y amplió la prueba: extrae el enlace del HTML construido, resuelve la página real y abre el módulo documental dentro del Centro de reportes.

La aceptación integrada del Centro de reportes pasó **22 recorridos**, incluida la entrada nominal, denegación sin las dos capacidades de lectura, apertura de un PDF sintético con su worker real y conservación del detalle al cambiar de pestaña. La prueba aislada del documento conserva sus **12 controles**; ya no se utiliza su montaje aislado para acreditar una navegación entre páginas.

Este ajuste de ruta se publica en un commit posterior, sin reescribir el commit anterior. La versión final y su CI se acreditan con el despliegue exacto. No cambia el alcance pendiente de ocupación nominal persistente, presupuesto anual, permisos ni liquidación.
