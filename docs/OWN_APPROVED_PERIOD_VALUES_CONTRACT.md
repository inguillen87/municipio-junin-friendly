# Fórmula aprobada y valores por período — 237

## Contrato

`catalogueValueResolutionVersion: own-approved-period-values.v1` es una política optativa del programa propio y exige `own-payroll-namespaces.v2`. Conserva la versión del programa, `salaryVersion`, la propuesta y la aprobación originales. Adoptarla no permite retirarla de su historia. Proponer y aprobar continúan usando el CAS del catálogo actual y requieren una persona preparadora y otra revisora distinta.

Para `parameter`, `auxiliary_parameter`, `scale` y `scale_reference`, aprobar la fórmula exige una definición tipada activa compatible con cada intervalo de uso; no exige importes hasta el final de una fórmula abierta. La identidad de la fuente conserva clase, código, convenio, unidad, naturaleza y selector de categoría. Las definiciones de salida y las verificaciones del grafo permanecen vigentes.

Cada cálculo exige un único valor aprobado, no nulo, del período exacto. La escala ordinaria usa la categoría nativa capturada de cada contrato; la escala de referencia conserva la categoría y convenio expresos del binding. No hay cero por ausencia, extensión implícita de una vigencia vencida ni conversión de tipo. Cero explícito sigue siendo un dato. La gramática del catálogo conserva su rechazo de escalas null. Las fuentes opcionales y condicionales mantienen sus políticas propias.

Una nueva revisión aprobada del catálogo puede proporcionar el valor de diciembre a la misma fórmula que calculó noviembre. No cambia la fórmula ni reescribe su aprobación. Los programas sin esta política mantienen la exigencia anterior de catálogo original y los lectores históricos utilizan las fuentes congeladas en cada captura.

## Captura y validación

`sourceInventory.catalogueValues` conserva versión, estado completo, tenant, binding, revisión, aprobación, propuesta, versión del catálogo, huella de sus elementos y cantidad. También conserva la versión y aprobación del programa original, su catálogo original y los contratos tipados de las fuentes.

SQL construye y autentica esta prueba a partir de los eventos inmutables del catálogo y del programa, incluidos sus `base_salary_items`. Comprueba contenido, revisiones y ámbito antes de crear la captura y en los seis finalizadores. Los lectores JS verifican las mismas preimágenes capturadas; no consultan el catálogo vivo para reconstruir históricos.

Cada entrada conserva una referencia canónica que vincula fila, contrato, período, valor e identidad tipada con el catálogo capturado. Los lectores rederivan valores y referencias, tanto monetarios como de cantidad y oficiales. Alterar una entrada y recalcular sus hashes exteriores no sustituye su fuente aprobada.

Las comprobaciones puras de snapshots son `IMMUTABLE`; la autenticación contra eventos inmutables está en helpers `STABLE`, llamados por captura y finalización. Las 16 funciones existentes conservan sus metadatos no relacionados con el cuerpo. Los 9 helpers nuevos pertenecen a `neondb_owner` y no conceden EXECUTE al runtime.

## Interfaz

El comparador muestra la política explícita y el estado `period_values` distingue la fórmula reutilizable de la exigencia de una revisión única. Preparar un mes siguiente sigue sujeto a la validación de cada dato del mes. La comparación de propuestas, borradores preparados y readiness conserva sus versiones de snapshot y comprobaciones CAS.

## SQL semántico e instalador compuesto

El orden de composición es **234 → 236 → 235 → 237**. `scripts/migrations/237-own-approved-period-values.sql` conserva byte a byte el delta semántico revisado de 237. Su SHA-256 es:

```text
666ed42786b34ae078a3b22fc2071fe8ae45d55b16bb10dc9bac10b4b401d80d
```

Ese delta exige las preimágenes exactas de 235, cuyo instalador compuesto tenía SHA-256 `f5c0d1c1adbed6550408706c386f8c6217eeeaed0de90b4183b995c9994f9d17`. Conserva el patrón de 231–236: SQL semántico con guardas, que debe integrarse con los pins de readiness y atestación recompuestos. No constituye por sí solo el paquete operativo.

El paquete completo validado parte de **a7fd**, con la tabla nativa todavía ausente, y no se ejecuta encima de una instalación 235 completada. Su instalador `20-native-conditions-candidate.NOT-INSTALLED.sql` tiene SHA-256:

```text
9fe1f7cb1f66a40e096d4fec99074c240b2fff18ee543a8829ed64a3fdeb792c
```

El compuesto conserva **510 preimágenes, 591 postimágenes, 573 dependencias atestadas y familias de 30/62 miembros**. El manifiesto de generación 237 permanece inmutable, SHA-256 `6cef3cfc8f84349e887fb445ab710eab986af57302d528fad44740af439c63c3`; su estado inicial de QA se complementa con los recibos posteriores, sin reescribir esa fuente sellada.

El instalador completo, las ocho entradas de composición, sus fuentes, generadores y recibos se conservan en el paquete externo **`MuniControl_237_9fe1_reproducible_package.zip`**. El ZIP tiene su propio manifiesto de archivos y recibo de conservación; su huella de contenedor se registra junto al archivo. Git conserva código, este contrato y el delta semántico; no contiene los paquetes de coordinación ni las fuentes municipales.

## Evidencia local

| Grupo | PostgreSQL 17.11 | PostgreSQL 18.6 |
|---|---:|---:|
| Ocho casos funcionales, noviembre y diciembre | 113/113 PASS | 113/113 PASS |
| Instalación, rollback y rechazo de derivas | 23/23 PASS | 23/23 PASS |
| Foco de historia, caso `parameter` | 36/36 PASS | 36/36 PASS |

Los grupos comparten preparación y no se suman como pruebas únicas. La matriz incluye las cuatro fuentes, cantidades, V4, V5 y coexistencia con escalas opcionales. Verifica igualdad de valores y referencias SQL/JS, rechazo previo a INSERT cuando diciembre no tiene valor, reutilización de la aprobación original, adulteración de pruebas e inputs, scope y revisión mediante alias de la misma persona.

El foco histórico primero acepta una definición legacy acotada con cobertura suficiente y después exige exactamente `OWN_PROGRAM_HISTORY_REQUIRED` al retirar la política. El recibo integrado de ese laboratorio tiene SHA-256 `1a6f7b00aecf034b13bb7fdbc3686baf7d0495aa5a6818644ead499f43c32565`.

Las sesiones y los eventos del catálogo son sintéticos. La admisión se probó por el core independiente real porque la fachada delgada original 190 estaba ausente del subconjunto de base capturado. La recuperación usa la rama idempotente instalada de `own_run_capture_v1`. Los finalizadores `full` ejercitaron recibos pequeños y replay; no se atribuye cobertura nueva a la rama superior a 4 MiB. La evidencia local no acredita instalación productiva ni aceptación municipal.
