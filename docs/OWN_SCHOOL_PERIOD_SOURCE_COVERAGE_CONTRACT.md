# Decisión propia de ayuda escolar por período — 239

El programa puede proponer una disposición propia, finita, para las filas fuente311 y312 del convenio1 mensual en un único mes distinto de febrero. La disposición conserva ambas filas en el inventario íntegro y las guardas de los tres canales de novedades. Una reaparición aprobada, incluido un evento con importe y cantidad cero, bloquea la captura antes de consumir entradas.

## Fuente y decisión

La condición documental es `L[101] == 2`. Esto identifica el mes de febrero. Por sí sola no demuestra que el motorGRH deje de evaluar la cantidad `UNIM`. La disposición239 **requiere una decisión municipal propia**, expresada por `authority: own_programme_decision` y una `decisionSha256` distinta de la revisión de fases y de la evidencia fuente.

La revisión conserva la condición, las cantidades originales y el respaldo de que las fasesPRE yPOST de origen están vacías. `quantityTreatment: suppressed_by_own_decision` expresa que el programa propio omite la cantidad informativa por esa decisión municipal durante ese mes. No afirma equivalencia con el comportamiento interno deGRH.

La definición permanece pendiente hasta recorrer la preparación y revisión normal del programa. Una huella documental no constituye una aprobación. La interfaz distingue la decisión propia, el tratamiento de cantidad y los tres respaldos documentales.

## Alcance exacto

La nueva base es `outside_february_school_condition`, dentro del contrato existente `own-payroll-source-coverage.v1`. Exige convenio1, tipo mensual, código311 o312, contexto `own-payroll-period-context.v1`, condición tipada exacta con referenciaL101, operadorigual y valor numérico2. La vigencia debe ser un único mes cerrado, diferente de febrero.

Se rechazan intervalos abiertos, intervalos de varios meses, febrero, otros convenios, otros códigos, otros tipos de liquidación, una condición distinta, falta de decisión, falta de revisión de fases, efectosPRE/POST sin resolver y falta del contexto de período. La decisión no se prolonga automáticamente a otro mes; una nueva vigencia requiere su propia propuesta y revisión.

No se crean tarifas, valores escolares, filas pagables de importe cero ni reemplazos de fuentes ausentes. Tampoco se admite una exclusión genérica por condición falsa. Los demás tipos de disposición y su historia conservan el contrato anterior.

## Instalación

El delta semántico239 modifica únicamente `public.own_program_source_coverage_options_v1(jsonb)` y conserva propietario, permisos, configuración, inmutabilidad, seguridad y demás metadatos. Los módulosJS de validación y revisión incorporan el mismo contrato.

El SQL semántico requiere su preimagen237 exacta. Necesita recomponer las atestaciones y las familias del instalador operativo; ejecutarlo aisladamente no constituye una adopción. El cambio238 del catálogo de permisos es independiente.

## Verificación

Los vectores sintéticos comprueban paridadJS/SQL, restricciones por período y fuente, conservación del inventario, rechazo de la omisión de respaldos, rechazo de cero en los tres canales, conservación del comportamiento anterior, instalación con preimagen exacta, rechazo de deriva de metadatos y rollback. Las pruebas no acreditan decisiones económicas municipales ni un cálculo real de haberes.
