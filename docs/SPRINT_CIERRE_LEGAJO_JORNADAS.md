# Cierre de sprint: jornadas, legajos y documentos

## Alcance

Integra el motor K20 0–5 y la consulta autenticada. Reconstruye la ventana completa con contexto antes de filtrar y paginar. Sustituye el mapa semanal de volumen por Jornadas y tiempos con detalle de tramos, pausas e incidencias. Las duraciones son registradas, no pagables.

Agrega CSV y Excel del filtro completo de jornadas y descarga PDF de resumen por período desde el legajo. Traduce confidencialidad, evidencia, cálculo y estados de licencias sin cambiar permisos ni solicitudes.

## Documentos y firma

El PDF es un resumen de totales, no un recibo final. La firma aportada no se aplica ni se publica en código. DOC-01 conserva el detalle obligatorio de cada descuento: código, denominación e importe, conciliado con retenciones y neto. No reconstruir conceptos de un agregado mensual. Ver FEATURE_FIRMA_EMISION_DOCUMENTAL_20260910.md.

## Validación

La workflow legajo-release.yml integra fuentes, comprueba idempotencia, instala dependencias bloqueadas, ejecuta todo npm test, construye y prueba el navegador con personas sintéticas. Sólo después registra los fuentes generados. La publicación debe comprobar los bytes servidos y denegación sin sesión con scripts/verify-legajo-production.mjs.

La consulta SQL 047 requiere QA y permisos comprobados antes de producción. No cambia fichadas, aprobaciones, haberes ni solicitudes. Las pruebas sintéticas no son una sesión real de Noelia, firma auténtica ni lectura física del reloj.

## Próximos cortes

DOC-01: perfil privado, emisor autorizado y recibos completos. Colector municipal permanente instalado en infraestructura municipal. Turnos actuales, cantidades autorizadas y valoración por convenio/vigencia. No equiparar códigos 4/5 del reloj con conceptos salariales 44/95.
