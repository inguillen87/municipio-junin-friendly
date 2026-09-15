# Direcciones públicas estables — 14 de septiembre de 2026

Incremento de presentación sobre los mismos shells y APIs. No migra autenticación,
no agrega capacidades, no modifica datos y no sustituye la aplicación por React.

| Dirección | Pantalla conservada |
| --- | --- |
| `/acceso` | Ingreso |
| `/inicio` | Vista general pública, como el alias histórico |
| `/personal` | Portal interno |
| `/reportes` | Centro de reportes y planilla bancaria |
| `/relojes` | Control horario |
| `/nomina` | Control de nómina |
| `/novedades` | Novedades de nómina |
| `/acciones` | Centro de acciones |
| `/seguridad` | Seguridad de la cuenta |
| `/administracion` | Administración de plataforma |
| `/integracion` | Integración de datos |
| `/tiempo` | Fuentes temporales |
| `/comparativa` | Comparación de gestiones |
| `/ausentismo` | Ausentismo |
| `/licencias` | Licencias |
| `/ayuda` | Centro de ayuda |

Las restantes direcciones están declaradas en `assets/app-routes.js`. Los aliases
públicos históricos con secciones (`/hacienda`, `/presupuesto`, `/servicios`, etc.)
conservan su significado. `/` conserva la vista general y el alcance de la PWA.

`vercel.json` mantiene `cleanUrls:false`: las redirecciones finitas evitan aplicar
normalización global a funciones API. Los archivos `.html` y aliases anteriores
redirigen a su destino en un salto **307 temporal**, para que un rollback no deje
redirecciones permanentes almacenadas en navegadores. Los rewrites conservan los
shells originales y los nuevos destinos privados declaran `private, no-store`.

El build incluye el contrato de rutas antes de la compuerta de capacidades y
convierte los enlaces HTML. Normaliza únicamente los retornos literales al login
de la propia pantalla y el prefijo de acceso; conserva consulta y ancla del destino.
El login acepta archivos anteriores y aliases, conserva su allowlist por contexto
y rechaza esquemas, otros orígenes, rutas desconocidas, segmentos `..` y rutas con
codificaciones ambiguas. Un destino rechazado vuelve al portal del contexto,
nunca a la vista pública. MFA, invitaciones y comandos de identidad no cambian.

La guía y la comparación de nómina resuelven el archivo lógico desde el mismo
contrato. La compuerta aplica las capacidades previas a todos los aliases, también
antes de resolver la sesión. El service worker agrega sólo el contrato público de
rutas y excluye explícitamente los nuevos destinos privados del caché.

## Verificación y límite pendiente de plataforma

- 33 pruebas focales de rutas, capacidades, identidad y PWA verdes.
- El primer build de Vercel dev ejecutó 2782 pruebas generales sin fallos; pruebas
  posteriores agregan el retorno completo y la política 307 temporal.
- `scripts/verify-clean-routes-browser.mjs` comprueba HTTP y Chrome sin credenciales,
  sin fixtures de autenticación y sin escrituras. Las APIs reales de autenticación,
  asistencia y banca respondieron 401 con `private, no-store` a la sesión vacía.
- Vercel CLI 58.4.4 local reproduce dos limitaciones que **no se certifican como
  correctas**: un redirect desde `/login.html?next=...` pierde la query, y un rewrite
  de `/acceso` o del alias preexistente `/activar-cuenta` omite los headers privados
  del config. Los recursos directos y APIs sí conservan sus headers. No se agregan
  opciones fuera del esquema de Vercel para ocultar esta diferencia.
- `--local-dev` permite recorrer los demás casos y emite `ok:false` con la lista
  de comprobaciones de plataforma pendientes. Sólo se admite en loopback. El modo
  predeterminado es estricto: cualquier query perdida o header incorrecto falla.
- Antes de Producción se exige ejecutar el modo estricto contra la **Preview del
  commit exacto** y verificar enlaces con consulta/ancla, retorno al acceso,
  `/inicio` público, assets y denegación anónima real en desktop y móvil.

Ejemplo de ejecución (con Chrome instalado):

```powershell
$env:CLOCK_BROWSER_CHANNEL='chrome'
$env:CLEAN_ROUTES_BASE_URL='https://PREVIEW-EXACTA.vercel.app'
node scripts/verify-clean-routes-browser.mjs
```

La comparación de publicación debe usar `public` generado desde ese commit: ahora
hay transformación de rutas y compilación de la isla React. Comparar sólo archivos
fuente o reconstruir únicamente marca/PWA ya no acredita equivalencia del build.

Referencias oficiales: [configuración de redirects/rewrites](https://vercel.com/docs/project-configuration/vercel-json),
[comportamiento documentado de consultas en redirects](https://vercel.com/kb/guide/how-do-i-perform-vercel-redirects-based-on-query-strings).
