# Mapa de relojes: referencia de origen y disponibilidad

El 15/09/2026 se verificó que `/relojes` publicado devolvía `Referrer-Policy: no-referrer`. Leaflet 1.9.4 heredaba esa política para las imágenes y usaba el patrón antiguo con subdominios `{s}.tile.openstreetmap.org`. La [política oficial de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) exige una referencia válida para páginas web y la URL canónica `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. La configuración encontrada contradice esos requisitos y explica el bloqueo informado.

## Corrección acotada

- Se conserva `no-referrer` global. Sólo las imágenes del mapa usan `referrerPolicy: 'strict-origin'`: el navegador envía el origen real de la aplicación sin ruta, query ni fragmento. Leaflet documenta expresamente esta [opción por imagen](https://leafletjs.com/reference.html#tilelayer-referrerpolicy).
- Se utiliza el host canónico, atribución visible enlazada y `crossOrigin: 'anonymous'`. No se cambió de proveedor, creó un proxy, falsificó una identidad ni agregó una credencial.
- Las imágenes conservan la caché normal del navegador y cargan al terminar de mover la vista. No hay descarga masiva, uso offline, precarga regional ni reintento automático.

Se hizo una única solicitud **HEAD**, identificada como auditor de MuniControl, sin descargar una imagen: respondió 200, `Access-Control-Allow-Origin: *`, sin `Timing-Allow-Origin` y con `Cache-Control: max-age=527979, stale-while-revalidate=604800, stale-if-error=604800`. Es evidencia puntual de soporte CORS del proveedor, no una garantía de disponibilidad ni una prueba de la página corregida en producción.

## Fallback y compatibilidad

Una imagen válida puede disparar `load` aunque su respuesta HTTP sea 403. Se comprobó con una respuesta sintética. Por eso se mantiene `tileerror` y se observa además `PerformanceResourceTiming.responseStatus` cuando el navegador lo expone. [MDN documenta](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus) su disponibilidad limitada y que el estado cross-origin depende de CORS; un valor cero es desconocido. No se necesita `Timing-Allow-Origin` para este campo.

Sólo un estado HTTP de error efectivamente visible causa el fallback; cero, ausencia del campo o ausencia de `PerformanceObserver` no rechazan imágenes válidas. Los recursos iniciados antes del intento actual se ignoran para evitar que un error tardío oculte un mapa recuperado.

Al fallar un tile o vencer 25 segundos de carga se retira la capa base, se conservan los marcadores y se abre el listado accesible. El título pasa a **Mapa base no disponible**, el estado deja de anunciar carga exitosa y aparece **Reintentar mapa**. El reintento vuelve a consultar el inventario autorizado. El acceso al listado permanece disponible también cuando funciona el mapa. Si no carga Leaflet, el listado conserva sedes, direcciones y coordenadas.

En navegadores sin estado HTTP visible, una imagen de error válida no se puede distinguir de un tile sólo por `load`; no se usa OCR ni comparación de píxeles. La corrección principal de referencia sigue siendo válida y el listado permanece accesible. No se declara compatibilidad comprobada con Safari o Firefox: la prueba ejecutada usó Chrome 153.

## Verificación

```text
node scripts/build-friendly.mjs
node scripts/verify-clock-map-browser.mjs
node --test tests/showcase-integration-ux.test.js tests/attendance-device-browser-verifier.test.js
```

En Windows puede usarse `CLOCK_MAP_BROWSER_CHANNEL=chrome`. `CLOCK_MAP_BUILD_DIR` permite verificar otra compilación preparada. El script rechaza una compilación cuyo bloque del mapa difiera del fuente actual.

Resultado local: 8 controles de navegador y 14 pruebas existentes aprobados. Se comprobaron referencia exacta sin ruta/query, privacidad global, atribución y caché, 403 con imagen válida, error 500, interrupción de red, timeout, reintento, respuesta tardía, compatibilidad sin datos de estado, ausencia de Leaflet y escritorio/móvil de 390 px. Las capturas distinguen éxito, fallback y recuperación.

Las API, Leaflet y **todos los tiles de las pruebas de navegador** están interceptados. No se usó sesión municipal ni se escribieron datos. Los artefactos sintéticos quedan en `verification/clock-map/`, excluidos de Git. La verificación posterior de la publicación corresponde a una vista humana normal; no se automatizan recorridos contra los servidores de OpenStreetMap.
