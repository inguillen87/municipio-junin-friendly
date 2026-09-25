# D1.6.A · cobertura estructural de dependencias nativas

## Base y alcance

Continuación desde GitHub `master` y la producción `78b5eaf6f32b9d49c3b78555cd833f44ae2b7801`. El candidato del 22/09 ya estaba guardado en el staging privado; este incremento no vuelve a cargarlo ni selecciona otra fuente.

Se leyó exclusivamente el catálogo de PostgreSQL del proyecto y rama operativos. Las consultas acceden a `pg_class`, `pg_attribute`, `pg_constraint` y `pg_namespace`: no devuelven registros de empleados, importes, decisiones, adjuntos ni secretos. El archivo de metadatos quedó en la carpeta privada de operaciones; el analizador exige su SHA-256 exacto y no abre conexiones por sí mismo.

## Hallazgo y control implementado

Las 13 tablas principales del preflight anterior tienen **14 tablas dependientes adicionales**: la cobertura estructural completa comprende **27 tablas**. Entre las adicionales aparecen eventos de solicitudes, filas e incidencias de lotes de novedades, decisiones de cambios fijos, eventos de reproceso y eventos de familiares/escolaridad.

El grafo leído contiene **23 claves foráneas entre esas tablas**, de las cuales **16 son compuestas**. Además hay **9 referencias declaradas hacia `employment_contract` y 25 hacia `person_identity`**. Son restricciones del esquema, no cantidades de empleados, solicitudes o personas distintas.

**25 tablas declaran tenant y binding de origen propios. Dos heredan el binding del lote**: `payroll_novelty_row` y `payroll_novelty_issue`. Para esas dos se exige la clave foránea compuesta que conserva la correspondencia entre `batch_id → id` y `tenant_id → tenant_id`. No se acepta una coincidencia sólo por número de lote.

El analizador recorre las dependencias declaradas, conserva ciclos/autorreferencias sin bucles y compara su cobertura con un inventario versionado. Una tabla dependiente nueva se informa como no revisada, y una previamente cubierta que falta retira la cobertura completa. Rechaza raíces ausentes, destinos/columnas inexistentes, claves no validadas, particiones o relaciones externas sin soporte y bindings ambiguos.

## Qué evidencia entrega

`verify-grh-native-continuity.mjs` recibe un catálogo local explícito y su huella; genera un resumen sin filas personales. Identifica las tablas principales/dependientes y las relaciones que la revisión de contenido deberá cubrir. El checksum permite detectar cambios del archivo; no es una firma digital ni autentica por sí solo quién lo generó.

La cobertura se refiere **únicamente a relaciones declaradas en el catálogo**. No alcanza referencias guardadas como texto/JSON, documentos externos, validez de una decisión ni autorizaciones de nómina. El resultado conserva `businessRowsReviewed=false`, `nativeConflictsResolved=false` y `sourcePromotionAuthorized=false`, incluso cuando la cobertura estructural es completa.

## Pruebas y límite de esta entrega

Se incorporaron 31 pruebas unitarias con catálogo sintético: cobertura completa, ciclos, claves compuestas, cambios de orden, raíces faltantes, relaciones no validadas, ámbitos ambiguos, dependencias externas y archivos alterados. El build local terminó con 5.305 pruebas aprobadas, cero fallos y dos omitidas.

La matriz existente de PostgreSQL 17/18 añade seis controles de catálogo sobre tablas inventadas en `native_catalog_qa`, sin filas y con rollback. Se verifican el orden de columnas de claves compuestas, validación, esquema, autorreferencia y metadatos de tabla. La ejecución y el despliegue definitivos se acreditan por el CI del commit, no por la sola generación del SQL.

El recorrido nuevo que pretendía leer registros de las dependencias fue bloqueado por los controles de herramientas. Se detuvo esa parte: no se ejecutó, no se cambió de canal para sortear el bloqueo y no se incorporaron consultas nominales incompletas al repositorio. Esta entrega se limita al analizador de esquema que sí pudo terminarse y verificarse.

**D1.6.A cierra el inventario estructural. D1.6.B sigue pendiente:** leer y contrastar el contenido de las 27 tablas dentro de un corte consistente, revisar sus referencias de persona/contrato y resolver el impacto del candidato. Tampoco se han verificado aquí referencias implícitas en documentos, JSON o texto. La selección sucesora exige esas revisiones y la validación de consumidores; este resultado no las reemplaza.

No se modificaron registros, cuotas, permisos, relojes, solicitudes ni haberes. No se promovió el candidato del 22/09. Se mantiene diferido el expediente de proveedores hasta la autonomía acordada.

Referencia de diseño: documentación oficial PostgreSQL 17, `pg_constraint` (conkey/confkey y estado de validación) y `pg_attribute` (columnas físicas). Las cifras de 27 tablas/23 relaciones proceden del catálogo municipal leído, no de la documentación genérica.
