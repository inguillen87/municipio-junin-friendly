# Plataforma estable y mantenimiento - 18/09/2026

## Alcance

Esta entrega moderniza dependencias y herramientas de prueba. No migra datos, no cambia reglas salariales y no modifica variables de conexion, permisos municipales, planes ni cuotas. Los relojes y el Node global de Windows permanecen intactos.

| Componente | Base anterior | Version seleccionada |
| --- | --- | --- |
| Node para pruebas locales y CI | 24.15.0 local; 22/24 mezclados en CI | 24.21.0 LTS, fijado en .nvmrc |
| Node para Vercel | 24.x en configuracion del proyecto | 24.x explicito en package.json; parche administrado por Vercel |
| npm de la herramienta aislada | 11.12.1 global | 11.19.0, incluido en Node 24.21.0 |
| React / React DOM | 19.2.8 | 19.3.0 / 19.3.0 |
| @neondatabase/serverless | 1.0.2 permitido por rango | 1.1.0 exacto |
| Playwright | 1.62.1 permitido por rango | 1.63.0 exacto |
| checkout / setup-node | v4 | v7.0.1 / v7.0.0, fijados por SHA de commit |

El registro npm consultado tambien confirmo las versiones ya usadas de esbuild 0.28.2, pdfjs-dist 6.3.289, fflate 0.8.3, read-excel-file 9.3.10, tesseract.js 7.0.0 y Leaflet 1.9.4. No se reemplazaron por betas. Leaflet conserva su version y ahora tiene declaracion exacta, sin ^.

Los 29 workflows existentes leen la misma .nvmrc. Se conservan disparadores, permisos, condiciones, concurrencia y pasos funcionales; no se crea otro workflow de compilacion. Las revisiones de checkout/setup-node provienen de las etiquetas oficiales verificadas. No se actualizo el resto de acciones auxiliares en esta entrega.

## Instalacion reproducible y control

El archivo oficial node-v24.21.0-win-x64.zip se verifico contra SHASUMS256.txt publicado por nodejs.org: SHA-256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`. La copia aislada no sustituye el runtime global ni reinicia otros proyectos.

`verify-platform-baseline.mjs` se ejecuta antes de npm test: exige Node estable de la rama 24, motor 24.x, dependencias directas exactas, lockfile v3 coherente, integridad SHA-512, registro npm aprobado y React/React DOM alineados. Es un control local sin red ni acceso a bases; no afirma que una version siga siendo la ultima en futuras fechas. Vercel puede utilizar un parche distinto al fijado para CI porque administra los parches de su runtime.

Dependabot queda configurado con propuestas mensuales de npm y GitHub Actions, un PR de version abierto por ecosistema y cambios menores/parches agrupados. Las versiones npm nuevas tienen siete dias de espera; las actualizaciones de seguridad tienen grupo separado y dependen de la habilitacion de esa funcion en GitHub. No se configura fusion automatica. Node, PostgreSQL y cambios de version mayor requieren una nueva revision y pruebas, no una promocion ciega.

## Evidencia de esta entrega

- Instalacion limpia mediante npm ci con Node 24.21.0 y npm 11.19.0: correcta. npm audit: cero vulnerabilidades reportadas en la consulta, no garantia de ausencia de vulnerabilidades desconocidas.
- Regresion final: 3.697 pruebas aprobadas; cero fallos, omisiones o cancelaciones. Compilacion aprobada. Se corrigieron conversiones locales CRLF y la expectativa de la declaracion exacta de Leaflet; no se eliminaron pruebas ni se relajaron controles de red o permisos.
- Navegador local con Playwright 1.63.0: parametros salariales 8 controles, licencias 6, catalogo de reportes 7 y registro juridico 17: 38 controles en total. Interfaces y parser reales; autenticacion y respuestas municipales sinteticas. Se verificaron escritorio, 320/390 px, recuperacion de respuestas perdidas, conflictos, permisos y preservacion de borradores. No se enviaron escrituras municipales.
- Driver Neon 1.1.0 real, usando transacciones RepeatableRead y readOnly, probado contra origen PostgreSQL 17.11 y ambos destinos PostgreSQL 18.6. Seis comprobaciones por destino: suma decimal exacta, redondeo positivo/negativo, aniversario bisiesto, zona horaria de Mendoza y preservacion de importe en JSON. Los importes son datos sinteticos de la consulta, no haberes reales.

`verify-neon-platform.mjs` comprueba proyecto, rama, version y modo de solo lectura. Una base incorrecta, resultado monetario distinto o transaccion escribible impide aprobar el chequeo. La credencial se recibe por variable de entorno y no se imprime ni se guarda en Git.

Estas pruebas NO restauraron el esquema completo ni certifican una liquidacion. Los dos destinos siguen sin tablas publicas y sin conexion productiva. El origen conserva PostgreSQL 17; el cambio a 18 requiere restauracion integral, comprobacion de todos los objetos, conciliacion de septiembre y continuidad de operaciones nativas. La verificacion de Node/driver no sustituye esos pasos.

La publicacion y el SHA se comprueban por separado en GitHub/Vercel. Las evidencias locales de navegador son sinteticas y no se agregan al repositorio en este incremento.

## Referencias primarias consultadas

- Node, politica LTS: https://nodejs.org/en/about/previous-releases
- Node 24.21.0: https://nodejs.org/en/blog/release/v24.21.0
- Vercel, seleccion de Node y parches administrados: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- PostgreSQL, soporte y versiones: https://www.postgresql.org/support/versioning/
- React, version estable 19.3: https://react.dev/versions
- Playwright 1.63: https://playwright.dev/docs/release-notes
- Dependabot: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference

PostgreSQL 19 sigue en beta y Node 26 figura como Current en las fuentes consultadas; no se eligieron para produccion. La seleccion es la version estable soportada apropiada, no el numero mas alto disponible sin validacion. El mantenimiento futuro sigue siendo necesario.
