# Módulo 10 · contrato de lectura histórica local, integración pendiente

## Estado
Trabajo sobre la rama de PR #50, conservando master `486ccb95eb55959254aa3f34865b037d3b8b7fef`. No cierra la fase funcional de cotejo de cargos y no añade una función a producción.

## Implementado y probado
`assets/budget-historical-evidence.js` valida bytes de un paquete local: huella SHA-256 registrada, metadatos de fuente/corrida, tamaño y contrato exacto. Compara el conjunto completo de legajos con el roster autorizado; la cantidad de filas por sí sola no basta. Rechaza miembros ajenos, duplicados, diferencias de fecha/tipo/empresa/fuente, datos personales adicionales y valores inválidos. Conserva los nulos y textos vacíos distintos; nunca completa el cargo con el padrón actual. Copia los bytes antes del hash para impedir que una mutación del buffer cambie el contenido validado.

El descriptor de agosto utiliza exclusivamente los hashes y metadatos documentados en MODULO10_FUENTE_HISTORICA_VERIFICADA_20260928.md. No se releyó el paquete municipal en esta ejecución: el intento de análisis privado fue rechazado antes de ejecutarse. La coincidencia real de todos los legajos queda pendiente de una lectura autorizada ejecutada; las pruebas nuevas son sintéticas.

`assets/budget-history-report.js` proporciona búsqueda, orden, CSV y PDF de los valores históricos validados. No cruza el cargo contra el presupuesto, no determina diferencias, no reasigna personas y no acredita cupos anuales. No está conectado a la interfaz ni agregado a la lista de archivos del build público.

## Pruebas
- 53 pruebas nuevas del archivo y su reporte; 96 al sumar las regresiones de estructura/cotejo.
- Construcción completa: 5.709 aprobadas, cero fallos, dos omitidas.
- Extractor Python existente: 21 pruebas sintéticas aprobadas.
- PDF sintético: 60 registros, nueve páginas, último legajo presente y cero bloques fuera de página. Se inspeccionó el render con textos de hasta 400 caracteres y valores ausentes.

## Bloqueos observados
Se rechazaron antes de guardar: migración 111, módulo de comparación histórica y panel lector. Se comprobó que esos archivos no existen. No se ejecutó SQL de escritura, no se creó una tabla ni se modificó una función de Neon. Las consultas de Neon de este turno fueron READ ONLY y devolvieron sólo metadatos. Tampoco se ejecutó el análisis privado propuesto en Python.

No se cambió la firma digital que está en el frente de Hugo y Noelia, el worktree paralelo de recibos, los permisos, certificados, fuentes o haberes. PR #50 debe seguir en borrador: no hay una entrega funcional de Módulo 10 aceptada ni un nuevo despliegue atribuible a este incremento.

## Para cerrar la fase de Módulo 10
Faltan la conexión autorizada de datos, la comparación de cargos del período con el documento presupuestario, el resultado en pantalla y su exportación, la evidencia presupuestaria anual y la aceptación con Noelia. El archivo de estructura del 23/09 conserva Id, Denominación, Cant y ocupantes: no sustituye el cargo histórico ni una norma anual aprobatoria.
