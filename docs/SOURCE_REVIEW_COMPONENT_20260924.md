# Revisión sucesora: integración en la página operativa

## Entrega

Los componentes desarrollados en `132aaa3` se conectan ahora al panel existente **Integración de datos → Revisar un respaldo antes de incorporarlo**. Se conserva el permiso `lineage.read` y el procesamiento local de informes agregados. No se modifica ninguna función SQL, credencial, rol, permiso de escritura ni selección de fuente.

La página acepta los tres formatos: revisión de siete tablas, comparación del núcleo y comparación sucesora multiliquidación. Al cambiar de formato o limpiar, retira las tablas, cifras y huellas del informe anterior. El constructor incluye los dos nuevos módulos de presentación para que no dependan de archivos omitidos en producción.

## Funciones integradas

`grh-successor-review-model.js` exige los cinco conjuntos completos, conteos coherentes, huellas y evidencia de varias asignaciones por contrato. Diferencia cambios de contenido de cambios exclusivos de evidencia original.

`grh-successor-review-ui.js` presenta diferencias, contratos y asignaciones por separado, así como cierres por tipo de liquidación. Una corrida de vacaciones cerrada no se transforma en cierre mensual. La última mensual cerrada permanece no informada cuando el informe no la especifica.

La vista usa texto literal, tablas con encabezados y regiones desplazables en móvil. No sube el archivo, no consulta filas nominales y no emite autorizaciones de incorporación, pago, alta o baja.

## Validación de la página real

`node --test tests/grh-source-review-integration.test.js tests/grh-backup-review.test.js tests/grh-core-review.test.js tests/grh-successor-panel.test.js`

`node scripts/verify-grh-backup-review-browser.mjs`

El recorrido abre `integracion-datos.html` del build e incluye 27 comprobaciones de los tres formatos, rechazo de campos nominales y cifras inconsistentes, reintento, cancelación, limpieza, compatibilidad con permisos de trazabilidad y navegación móvil. Las respuestas de la API son sintéticas: no acredita una sesión real de Noelia.

La misma prueba puede cotejar los bytes publicados mediante `BACKUP_REVIEW_PUBLISHED_ORIGIN=https://municipio-junin-friendly.vercel.app`. Los GET públicos no envían credenciales; las solicitudes de API del navegador de prueba continúan simuladas. CI conserva evidencia y capturas. La publicación sólo se confirma después de verificar el despliegue.

## Pendientes explícitos

El contrato agregado de quince artefactos curados y `local-review-session.js` continúan como componentes independientes, no activados por esta entrega. No se declara ejecutada la comparación real de esos quince artefactos ni el control adicional posterior a la lectura. La página mantiene sus controles de sesión existentes.

La actualización del respaldo del 22/09 requiere una publicación coordinada de núcleo y datos de personal, preservación de operaciones nativas y aceptación de capacidad y restauración. Esta integración de interfaz no modifica la fuente activa ni reemplaza esos pasos. El original de Noelia, los PDF nominales y los respaldos privados no se incluyen en Git ni en el despliegue.
