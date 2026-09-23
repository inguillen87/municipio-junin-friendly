# Noelia: ampliación trazable de módulos 9 y 10

Los originales privados fueron recibidos y leídos. No pedirlos nuevamente ni subir los PDF nominales al repositorio público. Este documento amplía, no sustituye, MATRIZ_ACEPTACION_NOELIA.md, NOELIA_MODULO_8_INFORMES_20260923.md y ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md. Registrar por separado implementación, instalación, publicación y aceptación municipal.

## Fuentes

- 9º MODULO RECIBOS DE HABERES.pdf: una página; SHA-256 329cc8f9ad59c0e16c9c5d73a686b4551a92f49903c4b46a876936e98c0b8249.
- 10º MODULO ESTRUCTURA PRESUPUESTARIA DE CARGOS.pdf: dos páginas; SHA-256 425ec77eb4430ca445c6cfe962177758d3ce9b92acd5db2d693cc1bfd644626d.
- ESTRUCTURA PRESUPUESTARIA DE CARGOS AL 23.09.2026.pdf: 51 páginas, emitido 23/09/2026 12:20; SHA-256 b6cff5ce5986b7436b80c2323c50636560d40a9f4444e831afc59d1e2fad25dd.

## 9. Recibos

Pedido literal de la página 1: rangos desde/hasta legajo y repartición; período; fecha de acreditación o pago; tipos de liquidación; PDF; firma digital; descarga por cada agente. La captura también muestra convenio desde/hasta, leyenda opcional y datos del último depósito. No confundir esas fechas con la fecha de incorporación del backup.

Estado de este incremento: mejora de consulta individual en la biblioteca existente. Renderiza hasta 24 tarjetas por página; los filtros siguen examinando todos los metadatos recibidos (hasta el límite explícito del servidor). Conserva filtros y página al actualizar; recupera el foco al cerrar detalle; cancela lecturas/exportaciones de una selección reemplazada. Se mantienen PDF/Excel informativos y controles de autorización/origen.

No queda implementada por ello la emisión masiva desde/hasta, la acreditación de pago, la firma digital ni el autoservicio. Una imagen de firma no satisface automáticamente el pedido de firma digital. La emisión debe quedar vinculada a un resultado inmutable y a permisos de emisión, firma y entrega separados. Criterio de aceptación: misma población y conceptos en consulta y PDF; ningún recibo de otro agente o municipio; reautorización al descargar; entrega auditable; fecha de pago procedente de una fuente aprobada, no inventada.

## 10. Estructura presupuestaria de cargos

La página 1 identifica el objetivo: controlar cargos liquidados contra los presupuestados de cada año y obtener el detalle en PDF. La captura de la página 2 pide visualización simple/detallada, legajos activos sí/no/todos y orden por número de legajo/alfabético.

El reporte de referencia contiene Id, JUR, REG, AGR, TRAM, SUBT, CARGO, Denominación, Cant, Clas, Estado, Vacante y, en detalle, LEGAJO/NOMBRE. Conservar ceros iniciales y textos de origen. La página 49, entre otras, conserva filas con Cant=0 junto a Estado=Ocupado y Vacante=Titular: no convertirlas automáticamente en cargos vacantes ni en presupuesto autorizado cero. Tampoco deduplicar personas por nombre: los vínculos presupuestarios se concilian por claves de legajo y corrida.

Pendiente funcional: catálogo presupuestario anual versionado; cupos aprobados con evidencia; cruce por cargo/clase/jurisdicción con la población exacta de la liquidación; diferencias explicadas; selección simple/detallada y activos; PDF completo con agrupaciones que continúan entre páginas. El reporte fuente es evidencia de comparación, no una autorización para sobrescribir asignaciones nativas.

## Dependencia urgente: backup 22/09

Ver BACKUP_20260922_PREFLIGHT.md. El snapshot nuevo contiene varias cohortes y cierres por tipo diferentes. El control de cargos no puede usar cantidad de filas como cantidad de legajos únicos, ni tratar una corrida de vacaciones cerrada como cierre de la mensual. Primero adaptar el contrato fuente y sus consumidores, conciliar y probar en base aislada; después promover el lote exacto. La operación nativa y sus backups propios se conservan.

## Continuidad

PM10 sigue siendo un reloj de la flota común, no un módulo separado. No se alteran enrolamiento, colas ni protocolos en este incremento. Las mejoras pendientes de Hugo, Mariano y superadministración conservan sus matrices previas; no se declaran resueltas por paginar la biblioteca.
