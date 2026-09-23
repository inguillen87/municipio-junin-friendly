# Backup del 22/09/2026: lectura y bloqueo de importación incompatible

Fuente privada recibida: grh_junin.backup_2026092215_plataforma.sql.gz. No se ejecutó SQL del dump ni se escribió en ninguna base.

## Identidad comprobada

- Gzip: 44.912.593 bytes; SHA-256 6141e10765887ca60775731d9566620eb317861d1d10cf5becbecdfa07dc187b.
- SQL lógico: 779.676.197 bytes; SHA-256 8fd91c34e3757a19f3f772631f5734d4934050d4823bc6127b61220236155a8e.
- Marcador final: 2026-09-22T15:16:58, sin zona horaria declarada.
- Perfilador estructural existente: 257 tablas, 2.980 columnas, 6.630.905 filas contadas. Lectura gzip completa hasta el marcador; no es prueba de importación productiva ni de corrección semántica de todas las tablas.

## Resultado agregado de la nueva auditoría reproducible

`python scripts/audit-grh-snapshot-shape.py --input <archivo-privado> --sha256 <SHA256-gzip> --output <reporte-privado.json>`

La herramienta sólo produce metadatos y conteos; no conserva nombres, números de legajo ni importes en el reporte. Reutiliza la lectura completa, huellas separadas y detección de cambios del lector existente. Distingue una repetición de contrato entre corridas de una repetición inválida de la misma asignación. No autoriza promoción, aunque la forma sea compatible.

| Control del origen | Resultado |
|---|---:|
| Legajos históricos | 2.452 |
| Personas, perfil estructural | 2.351 |
| Legajos sin fecha de egreso | 876 |
| Filas histolegajo | 850 |
| Contratos distintos en histolegajo | 849 |
| Cohorte M, septiembre | 849 |
| Cohorte O, septiembre | 1 |
| Activos que no figuran en el snapshot | 27 |
| Contratos del snapshot inexistentes en legajo | 0 |

Para fecha fuente 30/09/2026, tipos M, O y P están abiertos; V tiene cierre informado. La última mensual M cerrada sigue siendo 31/08/2026. No confundir fecha futura informada, fecha del archivo, cierre por tipo y pago. Se conservaron seis incoherencias históricas de período/fecha y dos de mes/fecha sin corregir sus valores. Cinco fechas de corrida inválidas o fuera del alcance temporal se reportan por separado.

## Por qué no registrar este corte en el perfil importable antiguo

`extract_grh_core.py` en 521c61f2 asume un único snapshotCohort, rechaza una segunda fila del mismo contrato y espera un único estado de cierre para la fecha actual. El nuevo archivo incumple esas tres suposiciones. Omitir la fila adicional, cambiar el cierre global o activar allow-source-drift sería una pérdida o reinterpretación de evidencia.

La auditoría devuelve MULTIPLE_SNAPSHOT_COHORTS, REPEATED_CONTRACT_ACROSS_RUNS y MIXED_CURRENT_RUN_CLOSURES. No modifica grh-source-profiles.json ni su perfil predeterminado. Esto identifica incompatibilidad verificable; no demuestra por sí solo la causa de cada pantalla vacía en producción.

## Siguiente cierre de datos

Adaptar extractor, manifiestos y consumidores a claves de contrato + corrida/período/tipo, conservando ID fuente; separar conteos de filas y contratos; transportar cierre por corrida sin transformar toda la fecha en cerrada. Ejecutar extracción estricta y conciliación completa con el archivo identificado, luego validar en una base aislada y promover sin pisar operaciones MUNICONTROL. La conexión Neon de esta sesión falló antes de identificar un proyecto; no se certificó una lectura ni importación productiva.
