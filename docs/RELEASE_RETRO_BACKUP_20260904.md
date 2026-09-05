# Incremento publicado: RETRO y respaldo de cierre

## Producción comprobada

- Alias: https://municipio-junin-friendly.vercel.app
- Despliegue: `dpl_BXaowo8DGhy4hbyyzAWFc3zreW25`.
- URL inmutable: https://municipio-junin-friendly-m787862w7-marcelos-projects-c26aa499.vercel.app
- Estado: **READY**, target **production**.
- Commit informado por Vercel: `31a2c207013c80f81ca577062bd2003b75b85136`.
- Rama: `codex/art-report-prod-20260904`.
- Framework: Other, shell multipágina JavaScript; Node 24.x.
- Compilación informada: 16 segundos. Construcción remota desde fuentes; no se usó un artefacto precompilado anterior.
- API, contratos, permisos y migraciones sin cambios frente a `92d5511`, la base anterior de Producción. Se conservaron las reversiones previas ajenas a este incremento.

## Funcionalidad entregada

1. **Novedades → Carga masiva → TXT RETRO**: archivo original, concepto explícito, período/tipo de liquidación y previsualización. Bloquea filas inválidas o duplicadas, conserva el contenido ante errores y utiliza el circuito existente de preparación/aprobación. No calcula la garantía ni escribe en GRH.
2. **Nómina → cierre mensual aprobado → Descargar carpeta de respaldo**: PDF existente, conciliación CSV, inventario CSV de fuentes y LEEME de la misma corrida y versión. Reconsulta el detalle y los permisos antes de descargar. No es el archivo mensual completo de Noelia, una presentación oficial ni un PDF firmado.
3. UX: etiqueta de previsualización legible en móvil y detalle de cierre a todo el ancho cuando el perfil no prepara cierres; la ayuda técnica y PDF secundario quedan plegados.

## Verificaciones y sus límites

- Suite local de la rama de Producción: 1.583 aprobadas, cero fallos.
- Suite de compilación en Vercel: 1.582 aprobadas, una omitida, cero fallos.
- Pruebas de interacción RETRO: nueve aprobadas; una captura opcional se ejecutó separadamente junto con el caso móvil.
- Visual: 1280×900 y 390×844, antes/después de descargar, sin desbordes. Fixtures sintéticos, no liquidaciones reales guardadas para probar.
- Muestra autorizada RETRO de agosto: 68/68 filas aceptadas localmente por el lector, sin preparar un lote ni subir el original.
- Seis respuestas públicas HTTP 200, sin redirecciones: las dos URLs limpias y cuatro módulos de la mejora. Comparación byte a byte contra `public/` y transformación canónica de rutas sin `.html`.
- `/novedades-nomina` y `/nomina-control`: `private, no-store, max-age=0`. Módulos: `public, max-age=0, must-revalidate`.
- Consulta de errores del nuevo despliegue desde la última hora: no devolvió registros. Es una comprobación puntual con tráfico limitado, no prueba de ausencia de errores futuros. Drains/monitorización continua no se auditaron.
- No se realizó en esta comprobación un nuevo recorrido autenticado de los tres usuarios reales ni se aprobaron o prepararon registros productivos. Publicación estática y pruebas aisladas no equivalen a certificación completa de esas operaciones.

## Huellas del contenido servido

| Recurso | SHA-256 |
|---|---|
| novedades-nomina | `3c0f35085373286a768eec79d64711b3b03c187f2cfe4837698ebc4d3905ed16` |
| nomina-control | `69b504490fe693e108fd3ee37f6dc494061621cdd87d044bc3501fe16dc53024` |
| payroll-novelty-retro-import.js | `c641b5a966675ad45e75609b0a2ec93d128d6c3e59e98b6bfc6badef596e3a4f` |
| payroll-monthly-close-folder.js | `2367fc5ee85ef6cc29890be9a366a7412f0b020275234dad7b9946f2aeaed518` |
| payroll-novelty-workbench.js | `7b3d0226e4e96103594635aee0807f6d2973ede873ff48d0a3f69a05ef5b4d18` |
| payroll-monthly-close-workflow.js | `1d6870e4a14cf8c1aaabd20a4b6e5f3fa9c76d60cd2ae65ba78cb8b863c7b8b3` |

## Continuidad operativa

Se detuvo temporalmente OneDrive con autorización del usuario ante el agotamiento reiterado del disco C:. No se borraron archivos de trabajo. Los originales de Noelia no se incluyeron en el despliegue y `tmp/` quedó excluido. Quedan archivos temporales locales de transcripción y QA; no se declara liberado ese espacio. OneDrive puede volver a abrirse cuando haya espacio suficiente.

El nuevo catálogo de GRH antiguo se documenta en `GRH_OLD_FORMAT_EXPORT_20260904.md`. Los requisitos contables ImsuTaco/ImsuLega están en `NOELIA_ACCOUNTING_REQUIREMENTS_20260904.md` y todavía no se implementaron como una integración GAF.
