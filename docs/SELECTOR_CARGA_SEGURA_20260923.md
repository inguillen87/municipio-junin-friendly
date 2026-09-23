# Consultas de legajos: carga segura y sin reinicios duplicados

Base revisada: `74d814aefb620b39e88066e9ae1d83f04a092f08`.
Este incremento es de interfaz y regresión; no migra datos ni cambia permisos, conexiones, planes o reglas salariales.

## Problema reproducido y corrección

El selector compartido por las cargas de novedades reiniciaba una lectura pendiente al repetir el envío del mismo formulario. En la prueba sintética, una búsqueda inicial, veinte envíos repetidos y Enter producían 22 solicitudes; la versión corregida produce una. Esto mide solicitudes duplicadas en ese escenario, no el tiempo de una consulta de producción.

Se reutiliza únicamente la solicitud pendiente de la misma búsqueda y página, dentro de la misma instancia. No se guardan respuestas en caché, disco ni almacenamiento del navegador. Una búsqueda distinta cancela la anterior; una consulta explícita después de terminar vuelve a leer el servidor.

El botón informa que está buscando y el formulario comunica su estado ocupado. Escribir otra búsqueda vuelve a habilitar el envío. La procedencia de un resultado anterior se oculta y limpia al iniciar otra consulta o ante un error: no debe acompañar una respuesta fallida como si acreditara su cobertura.

Antes de consumir la respuesta y después de leer su cuerpo se comprueba nuevamente el acceso local de la carga y la cancelación. Las comprobaciones del servidor siguen siendo la autoridad; este control adicional de interfaz no autentica ni concede capacidades. Se conservan los rechazos 401/403, la invalidación por cambio de fuente, los límites de selección y la validación estricta de respuestas incompletas.

## Evidencia y entrega

`node scripts/verify-employee-picker-loading.mjs` ejecuta 16 escenarios en Chromium con el módulo real y respuestas sintéticas en memoria. Comprueba duplicados, paginación, respuestas tardías, red, cancelación, expiración, permisos antes/después del cuerpo, datos incompletos, fuente, selección, cierre y foco. Bloquea toda petición de red y no usa una sesión municipal.

El escenario de duplicados falla con los bytes originales de la base revisada (22 en lugar de 1). Los 16 escenarios pasan localmente con el candidato, Node 22.16.0 y Chromium 144. El CI debe repetirlos con la versión Node del repositorio, ejecutar la batería completa/build y el recorrido existente de novedades individual/ágil/planilla.

Orden: CI del commit exacto, promoción sin sobrescribir otros cambios, Vercel correcto y verificación de recursos publicados. El recibo de CI/despliegue se consulta por separado. Este documento no declara realizada una prueba autenticada en producción ni una importación completa.

## Continuidad de Noelia y octubre

La fuente de requisitos sigue siendo `MATRIZ_ACEPTACION_NOELIA.md`; este incremento no reemplaza ni cierra por sí solo sus módulos:

| Módulo | Cierre que debe conservarse |
|---|---|
| 1. Datos del municipio | Datos institucionales versionados, alcance y procedencia verificados. |
| 2. Reportes | Misma población/período en consulta y salida; formatos bancarios y de organismos homologados. Un control Excel/PDF no equivale a un envío bancario ni a un recibo oficial. |
| 3. Importación de novedades | Cantidades, importes opcionales, conceptos y perfiles validados; no sustituir importe ausente por cero. |
| 4. Sueldo–GAF | INSUTACO/INSULEGA, mapeos e imputación conciliada; no confundir un reporte de conceptos con contabilización. |
| 5. Novedades | Conservar 093/101 y la revisión independiente; 101 nativo sigue individual/mensual. Corrección/anulación masiva 5.5 y consumo por cálculo propio requieren cierre separado. |
| 6. Parámetros | El catálogo administrativo 103 no sustituye conceptos, fórmulas, auxiliares y escalas salariales aprobadas. |
| 7. Liquidación | Cálculo propio reproducible, reglas aprobadas, conciliación, confirmación, cierre y salidas coherentes; distinguir aprobación, cierre y pago. |

La matriz de la base revisada registra cierre técnico de 101/102; la aceptación municipal real y el catálogo aprobado de 103 se acreditan por separado. Rectificación, baja, reingreso y licencias de contratos nativos mantienen sus propios pendientes.

PM10 continúa dentro del parque único de relojes: conservar identidad, colas y protocolos, sin duplicarlo ni convertir sus recibos. Ver `CLOCK_FLEET_UNIFIED_20260923.md`. El corte de octubre requiere operación nativa aceptada por dominio y backups propios restaurables; no consiste en dejar de actualizar la fuente histórica antes de reemplazar sus funciones.
