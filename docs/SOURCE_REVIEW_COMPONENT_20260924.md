# Revisión sucesora: componentes verificados, integración pendiente

## Estado de esta rama

Base: `673f219fb26ea0d6072750df885a5742fe11b27e`. Esta rama agrega componentes y pruebas; no modifica la pantalla instalada, el constructor web, permisos, funciones SQL ni datos. No debe anunciarse como una actualización operativa ni como promoción del respaldo del 22/09.

La edición del archivo de integración no pudo aplicarse con las herramientas disponibles en esta ejecución. Se conservaron los componentes, sus pruebas y los resultados por separado; no se sustituyeron los controles de acceso ni se intentó una carga alternativa de datos.

## Componentes

`grh-successor-review-model.js` valida el informe agregado multiliquidación ya existente. Exige cinco conjuntos completos, conteos consistentes, huellas, claves fuente, evidencia de varias asignaciones por contrato y cierres por tipo. No interpreta la regeneración del ID fuente como alta o baja y no convierte una liquidación de vacaciones cerrada en cierre mensual.

`grh-successor-review-ui.js` presenta esa revisión con las cifras separadas, fuentes, pendientes y una tabla de cierres. Usa texto literal y tablas desplazables. El componente sólo recibe un informe ya validado; no consulta APIs, no incorpora registros y no autoriza operaciones.

`grh-curated-review-model.js` define y valida los contratos agregados de quince artefactos de personal y su combinación con el núcleo salarial. Exige que ambos informes describan exactamente los mismos respaldos de base y candidato. Esta rama **no genera ni demuestra la comparación real de esos quince artefactos**; sus pruebas usan datos sintéticos.

`local-review-session.js` valida metadatos de sesión y la capacidad de trazabilidad. Distingue sesión vencida de falta de permiso y detecta cambios de usuario, institución, membresía o rol. Está probado como función independiente y **todavía no se conecta al formulario existente**.

## Verificación

`node --test tests/grh-successor-panel.test.js tests/local-review-session.test.js`

`node scripts/verify-successor-review-component.mjs`

El segundo comando utiliza una página aislada con agregados sintéticos: no es el recorrido instalado ni una sesión municipal. Verifica representación repetida sin duplicados, diferencia entre contratos y asignaciones, cierres por tipo, ausencia de consultas externas y navegación móvil sin desbordamiento global. Produce evidencia bajo `verification/successor-review-component/`, excluida de Git.

## Criterios para el cierre pendiente

Conectar el nuevo contrato al panel existente manteniendo compatibilidad de los dos formatos anteriores; conservar el permiso de trazabilidad, cancelación, limpieza al cambiar de contexto y ausencia de envíos del archivo. Incluir los componentes en el constructor y ejecutar el recorrido completo en la página real antes de publicar. La comparación curada real, la publicación coordinada y la aceptación de Noelia siguen siendo hitos distintos.
