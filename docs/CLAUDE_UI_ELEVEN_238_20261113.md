# Integración de once parches de Claude y catálogo IAM 238

## Resultado

Candidato sobre el commit productivo 3d59c5278151de0df4cd08aa73a0c8e833ab5d35. Integra once parches revisados de Claude, ajustes del importador y el catálogo asignable 238. No modifica la cabeza de PR274 ni instala SQL automáticamente.

## Comportamiento

- Selectores, revisiones, decisiones, anulaciones e imputación muestran nombres sin perder códigos. Se conservan importes exactos, códigos desconocidos y los campos de procedencia.
- La campanita cuenta avisos accionables por circuito y decisiones no vistas; un circuito sin respuesta no se representa como cero.
- La ficha «Ver acceso» obtiene evidencia SoD para la membresía y versión abiertas, incluso con el filtro «Plataforma completa». Los conflictos nuevos siguen bloqueados.
- El catálogo 238 publica todas las capacidades de alcance tenant, incluidas las que ningún rol contiene. La interfaz respeta scopeKind; conserva compatibilidad con las respuestas anteriores sin ese campo. El catálogo no concede permisos.
- La importación de entidades admite coma decimal y las longitudes cortas documentadas. Conserva ceros explícitos por defecto. Omitir filas con cantidad e importe cero y preferir el menor legajo requieren opciones expresas, reiniciadas al elegir otro archivo. Los empates de legajo numérico siguen ambiguos. No se reproduce la pérdida de precisión flotante de GRH.

## Comprobación de esta entrega

| Alcance | Resultado |
| --- | --- |
| Unitarias de importación, campanita y acceso |26/26 |
| Build Windows con dependencias del lockfile |PASS |
| Navegador: importación de entidades |19/19 |
| Navegador: ficha de acceso |14/14 |
| Navegador: campanita |26/26 |
| Transporte catálogo 238 + SoD integrado |12/12 |
| SQL 238 en PostgreSQL 17.12 |23/23 |
| SQL 238 en PostgreSQL 18.7 |23/23 |

La UI fue comprobada en el árbol 65884d9afef6aa2332a2d68f0f431319a38852dd antes de agregar los ocho archivos nuevos de 238 y esta documentación. La integración 238 no cambia fuentes UI; sus pruebas SQL y API se documentan en ADMIN_CAPABILITY_CATALOG_238_20261113.md. El recibo de navegador contiene los hashes de los 40 archivos UI y confirma que no cambiaron durante la ejecución.

Los primeros ocho parches ya tenían 135 unitarias y seis verificaciones de navegador sobre el árbol 81dc7a21512277a80c54f7128a64a7cd0391f75a: decisiones 27, anulación 15, mensual nativo 41, revisión056 22, controles 8 e imputación 413. Son evidencia anterior acotada a ese árbol; no se presentan como repetidas sobre esta integración.

El primer build Windows encontró dependencias ajenas sin ECharts en una junction existente. Se eliminó sólo la junction del checkout aislado y se ejecutó npm ci según su lockfile. El build final y los tres navegadores pasaron; no se modificaron dependencias compartidas ni el producto para ocultar ese fallo.

## Instalación

El SQL 238, sus pre/postflight, rollback y hashes están en su contrato adjunto. Este PR no instala el SQL ni modifica datos de usuarios. Puede componerse con 237/239 conservando sus contratos y comprobando el árbol combinado antes de publicar.

