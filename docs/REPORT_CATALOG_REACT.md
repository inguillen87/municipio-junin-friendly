# Biblioteca de reportes en React

El Centro de reportes conserva sus doce destinos y permite buscar por nombre,
descripción o área. La búsqueda ignora mayúsculas, acentos y espacios externos;
informa cuántos reportes coinciden y permite limpiar el filtro conservando el foco.
La biblioteca usa la estética existente. Sus nueve áreas de trabajo siguen
conservando sus controles, archivos seleccionados, filtros y exportadores.

## Integración

La aplicación ya tiene APIs Node en `api/` y acceso gobernado a la misma base
Neon. Este cambio sólo migra el catálogo público de `assets/report-centre.js`.
No agrega servidor, base, endpoint ni capacidades. Las descripciones de tarjetas
son los únicos datos entregados al componente; no recibe respuestas nominales.

Se recupera el patrón de compilación de Civitas, commits
`8824165773cacb79abd96cc7bc35e706b1818fbd` y
`8d116869ca0ea968a4c727e91eb84e88d89f29bc`, adaptado a la pantalla actual.
No se incorpora su antiguo controlador de cuatro paneles. React y React DOM
quedan fijados en 19.2.8 y esbuild en 0.28.2, sin incorporar otras dependencias
de aquel trabajo. La instalación de estas dependencias informó cero
vulnerabilidades en npm audit; no es una certificación permanente.

`scripts/build-react-islands.mjs` compila un módulo ESM local con nombre derivado
del contenido y lo referencia únicamente desde el controlador de reportes. El
build verifica un máximo de 90.000 bytes gzip, produce avisos de licencia y no
publica sourcemaps. Medición inicial: 61.379 bytes gzip incluyendo React.

`mountReportCatalog(host, {cards})` administra únicamente
`#mc-report-catalog-root`. El montaje espera que el controlador existente cree
su contenedor; conserva la búsqueda y el foco si ya se usó la alternativa
inicial. La misma raíz devuelve el mismo controlador para evitar montajes
duplicados. Su método `unmount()` libera la raíz y el listener `pagehide`;
cualquier futuro código que retire ese contenedor debe invocarlo primero.
La navegación con bfcache conserva el estado. No agrega listeners de rutas:
los enlaces, `taskWorkspace`, los hashes y el historial siguen su curso actual.

Si la descarga del módulo falla, queda operativo el catálogo anterior. La
procedencia agregada es hermana del contenedor React y las herramientas privadas
siguen fuera de él. React no solicita APIs, escribe almacenamiento del navegador
ni cambia sesiones, aprobación, liquidaciones o límites de exportación.

El patrón sigue la documentación primaria de
[incorporación gradual](https://react.dev/learn/add-react-to-an-existing-project)
y [propiedad y liberación de raíces](https://react.dev/reference/react-dom/client/createRoot).

## Verificación

- `node --test tests/report-catalog-build.test.js`: compilación real, hash
  reproducible, licencia, tamaño y controlador circundante intacto.
- `node scripts/build-friendly.mjs` y
  `node scripts/verify-report-catalog-browser.mjs`: Chrome/Chromium real sobre el
  build; búsqueda, doce enlaces, nueve paneles, certificados, banco, resumen
  mensual, historial, teclado, archivo externo conservado, escritorio/móvil,
  montaje único, foco previo, bfcache, desmontaje y fallback sin bundle.
- Todas las APIs se interceptan con respuestas sintéticas de sesión denegada;
  las capturas y datos de prueba no usan registros ni sesiones municipales.
- En Windows puede usarse `CATALOG_BROWSER_CHANNEL=chrome` si no está instalado
  el Chromium de Playwright. Evidencia local en `verification/`, fuera de Git.
- Suite general después de integrar: 2.777 pruebas aprobadas. El gate de
  contención y el build también aprobaron. La publicación se verifica aparte.

El catálogo normaliza sus destinos con `MuniControlRoutes.canonicalHref` antes
del montaje, tanto en el fallback como en React. Personal y Relojes enlazan a
`/personal#legajos` y `/relojes`; los diez destinos locales conservan sus hashes.
La migración de este catálogo no sustituye ese contrato ni cambia su autoridad.

El workflow `pm10-continuity.yml` ejecuta el navegador React y la regresión del
Centro de reportes después del build. Publica únicamente el informe y las dos
capturas sintéticas del catálogo. En la última ejecución local ambos recorridos
aprobaron: siete grupos de comprobaciones React y veinte controles del Centro
de reportes, incluidos sus exportadores y rechazo de sesión/datos desactualizados.
La expectativa antigua de nueve tarjetas se sustituyó por la lista exacta de los
doce nombres y destinos vigentes, sin quitar comprobaciones.
