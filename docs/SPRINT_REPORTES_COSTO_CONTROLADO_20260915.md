# Reportes: navegación compacta y entrega agrupada

## Alcance
Continuación de los módulos 1–2 de la matriz de Noelia. Se agregan Lista compacta y cuatro accesos rápidos: Mutuales, Bancos, Escolaridad y Recibos. Usan los destinos existentes; no incorporan liquidaciones, formatos oficiales ni permisos. Cambiar de vista mantiene filtros; volver desde una tarea conserva el contexto en la página. Restablecer filtros no cambia la presentación. Ninguna preferencia se persiste en almacenamiento del navegador.

No se modifican el motor, las APIs, los datos, los relojes ni los nueve paneles de trabajo. Las doce tarjetas y la biblioteca de respaldo mantienen sus destinos.

## Integración y recursos
Este incremento conserva íntegramente la corrección concurrente 4b9039a3bc0bdaad152ddc6aa146e1652c8af419 (#39): política de red, pruebas, documentación y consolidación del workflow. La actualización contra una base anterior fue rechazada sin force-push ni despliegue. La entrega se recompone sobre la nueva base y agrupa todas las mejoras en un único envío; no necesita una rama de preview ni cambia la configuración global de Vercel.

El workflow mantiene un solo job, instalación npm, build e instalación de Chromium. Se agregan tres líneas: dos rutas de disparo y una comprobación de sintaxis. No se añaden workflows, jobs ni instalaciones. Los recorridos de lista y atajos se ejecutan dentro del verificador ya existente, tanto en --local como sobre Vercel.

## Comprobación online
La causa del fallo anterior era el bloqueo de /friendly-data.json, requerido por el catálogo público; no una necesidad de abrir permisos. Se conserva la corrección de #39 y su allowlist exacta. Todas las APIs privadas siguen interceptadas con respuestas sintéticas. No se afirma haber validado una sesión municipal real ni datos operativos.

## Validación
Antes del envío: 29 pruebas focales locales aprobadas, cero omitidas; sintaxis JSX y scripts comprobada. Las copias locales de los dos archivos concurrentes se cotejaron contra sus SHA de blob antes de extenderlos. La suite completa y los recorridos de navegador quedan en el workflow del commit. La publicación se certifica comparando los bytes públicos y completando la prueba online, no sólo por la existencia de un commit.

Reversión: revertir este incremento, conservando #39, sin restaurar bases ni eliminar documentos. Mantener agrupadas las siguientes entregas y priorizar pruebas locales sobre previews por ajuste.
