# Documentos individuales: lectura móvil y acceso por teclado

## Problema reproducido y corrección
Base revisada: master `52a75232dc0adb34294bceee41c40178e6a3652b`.
Con una fuente y un nombre largos pero admitidos por el modelo, un teléfono de 320 px terminaba con una página de 1.845 px. El texto y las acciones quedaban fuera del ancho del dispositivo.

Se corrigieron los saltos de línea, límites del panel, encabezado, tarjetas y columnas. El mismo ensayo conserva todo el contenido y devuelve una página de 320 px, sin truncar nombre, fuente, conceptos o importes. Las tablas mantienen desplazamiento interno para sus columnas, sin ampliar el documento completo.

Las tablas de conceptos y conciliación ahora se pueden enfocar y desplazar con teclado; tienen nombres accesibles, foco visible y encabezados de columna. En móvil se explica cómo llegar a cantidades e importes. Cerrar el detalle conserva la devolución de foco al botón original.

## Alcance y límites
No se modifican consultas, permisos, modelos, generación de PDF/Excel, fuentes, importes ni recibos. El trabajo del Módulo 9 en su otro worktree y los borradores de períodos permanecen separados. Esta entrega mejora un visor existente, no agrega emisión masiva, fecha de pago, firma ni descarga individual autenticada de cada agente.

En la inspección también se reprodujo que una respuesta sintética de otra fecha/período/tipo, conservando datasetId, puede mostrar importes y botones de exportación. La propuesta de validación fue bloqueada antes de guardarse. `assets/payroll-detail-model.js` permanece sin cambios y ese problema NO se declara corregido. La reproducción está en `verification/detail-period-baseline.json`; no usa una sesión ni datos municipales.

## Aceptación
El nuevo recorrido `scripts/verify-payroll-detail-layout.mjs` comprueba contenido habitual y cadenas largas a 320, 390, 768 y 1.440 px; amplitud de página, texto completo, tamaño de botones, desplazamiento por teclado, importes completos, exportaciones y devolución de foco. Utiliza exclusivamente datos sintéticos y no llama APIs municipales.

El modo publicado coteja release-info.json y los cuatro archivos del visor con el build del commit integrado antes de repetir el recorrido con API sintética. El workflow existente de UX incorpora estas comprobaciones sin quitar las regresiones previas. La evidencia de build, CI y producción se registra en la PR al cerrar.

## Resultados locales
Construcción completa: 5.513 pruebas aprobadas, cero fallos y dos omitidas. Navegador: 14 comprobaciones nuevas de lectura/accesibilidad, 13 del detalle existente, 15 de selección por rangos y 20 de biblioteca paginada, todas aprobadas. El PDF sintético resultante conserva tres páginas sin texto fuera de página. Estas cifras son controles distintos y no acreditan una sesión personal de Noelia ni emisión de recibos firmados.
