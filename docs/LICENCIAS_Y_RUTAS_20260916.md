# Licencias y rutas profesionales · incremento 16/09/2026

## Alcance funcional
- Directorio de reglas de Licencias convertido progresivamente a un componente React independiente. Búsqueda por nombre, código, base normativa, condiciones y límites; insensible a tildes y orden de palabras. Filtros de calculabilidad combinables y contadores coherentes.
- Detalle desplegable conserva condiciones, límites, unidad y referencia informada, incluido cero. Los filtros no aprueban licencias, no calculan saldo y no crean novedades salariales.
- `official_local_*` ya no se muestra prematuramente como fuente oficial/verificada por el orden de condiciones de `normalizeStatus`. Conserva la clasificación de revisión prevista por la pantalla.
- Los enlaces insertados o actualizados por JavaScript se normalizan usando el contrato existente: `/nomina`, `/licencias`, `/relojes`, `/personal`, `/reportes`, etc. Conservan parámetros, anclas y restricciones de acceso. Descargas y enlaces externos quedan intactos. No hay interceptación de clics ni router nuevo.

## Integración incremental
Se reutilizan React, ReactDOM, esbuild y Node ya presentes. No se agregan dependencias, frameworks, proveedores IA ni una reescritura del sistema. El componente es JSX y su modelo es JavaScript; este incremento no declara una migración TypeScript completa.

La página mantiene su formulario de consulta, fuentes, mapeos y matriz original como respaldo. El bundle se carga después de recibir la respuesta normativa autorizada. Un fallo de carga mantiene visible la matriz anterior. Se invalidan importaciones tardías; los errores y la pérdida de sesión desmontan el componente. Actualizar conserva búsqueda y campos del formulario.

## Fuentes y límites
Revisado el paquete privado aportado por Marcelo, la reunión del 09/09 y las instrucciones de módulos. La matriz vigente `MATRIZ_ACEPTACION_NOELIA.md` conserva la precedencia de requisitos y pendientes. Los ZIP, muestras nominales, respaldos GRH, archivos bancarios y datos de conexión no forman parte del commit ni de `public/`.

No cambia fórmulas, haberes, impuestos, cierres, autorizaciones, permisos, esquema SQL ni datos municipales. No conecta relojes ni modifica PM: la lista de IP sigue siendo configuración privada de conexión y no un criterio de asociación automática.

## Pruebas y publicación
141 pruebas focales/regresión aprobadas localmente, incluido contrato de rutas, permisos de navegación, reglas y consultas de licencias, PWA y reportes. Compilación local aprobada. Revisión visual DOM sin red en 1440/390 px sobre el código compilado. La ejecución local de la suite completa excedió el tiempo disponible; no se da por aprobada a partir de esa ejecución.

El candidato debe superar la suite completa con Node 24 y recorridos de navegador antes de mover `master`. La rama técnica de preparación no debe integrarse a producción; mantiene Vercel deshabilitado sólo para esa rama. La publicación conserva el `vercel.json` productivo y usa un único avance fast-forward, sin sobrescritura forzada.

Se reutiliza el workflow de Noelia para la validación del lote: misma instalación, compilación y navegador para reportes/licencias. El verificador productivo contrasta HTML, JavaScript, licencia y contrato de rutas; comprueba redirecciones históricas y denegación anónima real. Las APIs de las pruebas visuales son sintéticas, incluso al usar los recursos estáticos publicados. No equivale a aceptación con sesión municipal.

## Reversión
Revertir únicamente el commit del incremento. No hay migraciones ni datos que restaurar. No revertir trabajos concurrentes. Base de desarrollo: `2f97b8394841dbea8e8c17099fc8b3d177bd9673`.
