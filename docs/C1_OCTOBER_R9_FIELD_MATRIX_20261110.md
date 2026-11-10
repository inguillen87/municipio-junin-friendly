# C1 octubre 2026: matriz de los 41 campos pendientes de R9

Fecha: 2026-11-10. Alcance: lectura de fuentes, manifiestos y código; sin ejecutar el preparador, calcular nóminas, consultar hechos nominales, presentar propuestas, aprobar datos ni modificar la base.

## Conclusión y estado

La preparación de octubre existe y conserva fuentes identificables. El inventario contiene **41 referencias L distintas y 95 usos pendientes**. Los 41 nombres coinciden exactamente con las filas correspondientes de `defadic` en la configuración de respaldo. Esto acredita el diccionario; no acredita un valor por contrato, vigencia efectiva en octubre, aprobación ni disponibilidad de un proveedor productivo.

El preparado combinado conserva **247 definiciones y 163 árboles tipados**, pero su recibo declara `approved=false`, `executable=false`, `programmeDraftReturned=false` y `presentable.programme=false`. Resolver esta matriz tampoco resolvería por sí solo las 50 incidencias de expresiones, las decisiones de métodos 27/29, la ampliación del catálogo y la integración de efectos, cierre y recibos.

Los dos JSON de configuración del ZIP se leyeron como datos, y sus hashes se recalcularon sobre los bytes originales: ambos coinciden con el manifiesto. Están clasificados como configuración no nominal, con `approved=false` y `payrollExecutionAllowed=false`. La etiqueta de respaldo del **28/10/2026 identifica un corte de origen, no una vigencia efectiva**. Los documentos operativos de R9 son históricos: sus estados anteriores de Jornada y Antigüedad no deben sustituir los acuses actuales.

### Estado operativo comprobado por el equipo

El agente de validación comunicó un corte de base del **10/11/2026 a las 08:09:59 UTC**, obtenido en transacción `READ ONLY` y `REPEATABLE READ`, sin datos nominales. Se incorpora como evidencia actual del equipo; esta tarea no volvió a consultar la base.

| Componente | Estado en ese corte |
|---|---|
| Horas por convenio C1, octubre | Una propuesta, cero aprobaciones; propuesta `98279494-5275-428e-8af7-f589f4392bfb` pendiente. |
| Programa | Una aprobación, revisión 1, con 50 reglas limitadas a septiembre; cero reglas vigentes en octubre. |
| Condiciones salariales, octubre | Cero eventos, cero propuestas y cero aprobaciones. |

El expediente disponible y el estado aprobado son hechos distintos: el borrador R9 no figura como programa aprobado de octubre, y el CSV de horas todavía no constituye una aprobación.

### Hallazgos que cambian el siguiente trabajo

- **Familia concentra 26 campos y 67 de los 95 usos.** R9 ya contiene un productor privado para seis pares de cantidad/tarifa, equivalentes a 12 campos. Falta conectarlo a una fuente propia autorizada y capturada; una función pura y una prueba sintética no constituyen esa fuente.
- **L[23] no es L[25].** El primero representa antigüedad congelada; el binding existente `salary_condition_fact.partialSeniorityYears` corresponde a L[25]. La antigüedad total existente corresponde a L[27]. Ninguno puede rellenar L[23] por semejanza.
- **L[51] y L[52] no son alias seguros del bruto.** El manual describe bases sujetas a topes MOPRE; además distingue el tratamiento de SAC, vacaciones y gratificaciones. Hay que documentar y modelar esa semántica.
- **La clave familiar no resuelve la tarifa:** en los conceptos 300–317 del respaldo, `codliq.CODI_13` es `null` y `concepto.CODI_13` es `0`. Hay tipos y tarifas en otras tablas, pero no se puede unir automáticamente por esa clave. El mapa explícito de seis pares de R9 es evidencia adicional, no una FK recuperada.
- **L[91]/L[92] requieren una correspondencia específica.** El diccionario distingue ayuda escolar primaria y media/superior; `asigflia` identifica 12 como ayuda escolar y 13 como ayuda escolar por discapacidad. No equivale a primaria=12 y secundaria=13.

## Fuentes y pines

Raíz del expediente: `/workspace/scratch/949854e45fe4/continuacion-c1-r9`.

Los miembros indicados con `ZIP::` están dentro de `C1_CONTINUIDAD_R9_PRIVATE.zip`; no se copiaron dumps ni datos personales a este documento.

| ID | Archivo relativo a la raíz o miembro del ZIP | SHA256 de bytes verificado en esta revisión |
|---|---|---|
| B | `october-status/C1_BLOCKERS_EXACT_R9.json` | `5e27f416fc09414746d959bd9b52ce4c1b06f4c43b0aa27e9fcb95c04e589451` |
| G | `ZIP::programme-october-decisions-20261106-r3/private/GRH_CONFIGURATION_OCT28_R1.json` | `e6af7c41179c80f7813efc4a14171f639915687a9f078a9c73e47cd88d6e06a3` |
| C | `ZIP::programme-october-decisions-20261106-r3/private/CONFIGURATION_COMPLETION_R1.json` | `a70e934aa6cdac328e0084a2edc2fd81c5b19a0203d576ad2d1d002ce83500d5` |
| P | `method-runtime/out/C1_METHOD_COMPOSITION_R9.private.json` | `27130e0044d28e0d9d7ee776bb4accfdb9741d5a76dcf34dc82fe395f1e24527` |
| R | `method-runtime/out/C1_COMBINED_PREPARER_RECEIPT_R9.json` | `144d66fa0c55536e4890e07804505e47095c096d69984b9a2473d415e94cb791` |
| E | `method-runtime/evidence/C1_METHODS_SOURCE_EVIDENCE_R8.json` | `1d41979d5a49cea4abd61633dc09ce6ee4bb4f592d8bc0b848af001cd32b166c` |
| T | `method-runtime/evidence/C1_FAMILY_TARIFF_ROWS_R8.json` | `3aa3d4d8c9f14a29c8e534fbd402af4695b340e68cbfddbad0a26acd418abdb0` |
| M06 | `ZIP::continuacion-c1-r8/empty-amount/evidence/MANUAL_CIVITAS_EXTRACT.json` | `7fbb7e15f06c6c9b5e02825455af080e5d1d20c0de8e6354d21a80f9f692af77` |
| M17 | `ZIP::continuacion-c1-r8/empty-amount/evidence/MANUAL_CIVITAS_2_EXTRACT.json` | `16862f0e432844d444d3cc739f6f884e4eca1aa123bbeb01e2e38131bf2efe05` |

Las páginas de manual citadas son **páginas PDF**, no el número impreso. Los extractos identifican los PDF originales mediante los hashes `1b33dfb234c1d2c8c95425b553aaa79c595f01b7bc5844cbb4f466845448b827` (120 páginas) y `6600db0b4816c8cb716b9a9b40fe6f60a86ceab4c172b33e34588472d99f07cc` (97 páginas). Se recalcularon los hashes de los extractos; no se releyeron los PDF originales.

G conserva cuatro tablas de configuración. C conserva otras 32; entre ellas hay 205 definiciones `defadic`, 156 categorías, 6 gremios, 14 convenios, 19 tipos familiares, 33 filas tarifarias `salario` y 2 regiones. No contienen la población nominal ni sus hechos de octubre. La existencia de estas tablas no permite deducir qué fila corresponde a cada persona.

## Contratos de código examinados

Código del producto fijado en commit `f282d659098e60e83e6110da95a31c4ffc9888b2`:

- `assets/own-payroll-program-model.js`: admite fuentes declaradas de catálogo, escalas, novedades y hechos explícitos; no ofrece un proveedor genérico de cualquier variable L.
- `assets/own-payroll-conditions.js` y `assets/own-contract-salary-conditions-model.js`: los componentes actuales son antigüedad parcial, situación/código/porcentaje de título e insalubridad. No incluyen subrogancia, antigüedad congelada, gremio, elegibilidad familiar ni los indicadores L[301]/L[400].
- `lib/own-payroll-approved-input.js`: captura y comprueba identidad, alcance, integridad y aprobación de fuentes; `scale_reference` fija convenio y clase en el binding. No selecciona automáticamente una segunda clase por contrato.
- `lib/own-payroll-programme-source-preparation.js`: conserva la referencia y la unidad; si falta el binding emite `SOURCE_BINDING_UNRESOLVED`. La etiqueta del campo no crea un binding.
- `docs/EMPLOYEE_FAMILY_MEMBERS.md`: el alta propia de hijos declara un vínculo administrativo; no aprueba elegibilidad ni produce efectos de haberes. No debe contarse directamente como cantidad de beneficiarios.

Código privado ya presente en R9:

- `method-runtime/lib/own-payroll-method-runtime.js`: `prepareC1Method22Facts` y `prepareC1Method22Input` preparan seis pares con identidad, alcance, cantidades, región, promedio semestral y hashes; devuelven evidencia no aprobada y no habilitan un proveedor de producción.
- `method-runtime/assets/own-payroll-special-methods.js`: `calculateC1Method22` y `selectFamilyTariff` conservan cantidades exactas y la política propuesta de tramo. No sustituyen la elegibilidad ni generan el promedio semestral desde un mes aislado.
- `sql-chain/HANDOFF_SQL_CHAIN_R9.md`: el ensayo V4 utiliza namespace y atestados de QA. Declara ausentes los proveedores productivos `own_run_quantity_family_v1` y `own_run_official_family_v1`. No se reejecutó ni se verificó el estado de DB en esta tarea.

## Cómo leer la matriz

**Usos** reproduce B; son apariciones en las expresiones/condiciones/cantidades del preparado, no personas. **Tipo** es el exigido por el AST de P; el nombre del diccionario se comprobó contra `C.defadic[ITEM_79]` para las 41 filas. Los tipos del AST siguen siendo parte de un candidato no aprobado.

`F` en la columna técnica significa: crear o integrar una captura autorizada de **hechos familiares de liquidación por contrato y período**, con cantidad conocida o desconocida, procedencia e identidad. Usar el registro de vínculos como respaldo cuando corresponda, sin confundirlo con elegibilidad.

`T` significa: resolver una tarifa con mapa explícito de variable→tipo, región y criterio de selección documentados, usando filas versionadas y vigencia aprobada. El productor privado para seis pares puede reutilizarse; los demás tipos requieren ampliar el contrato. Una tarifa de configuración no prueba un derecho individual.

Toda fila conserva además una condición común: acreditar la fuente aplicable a octubre y pasar por el circuito existente de revisión independiente cuando corresponda. La columna de decisión especifica lo que falta demostrar; no afirma que el respaldo esté ausente fuera de este expediente.

### A. Adicionales, antigüedad y retenciones — 8 campos, 12 usos

| Referencia | Usos | Significado y tipo exigido | Evidencia disponible | Proveedor o cambio técnico pendiente | Decisión documental real |
|---|---:|---|---|---|---|
| L[11] | 2 | Adicional especial de categoría; `money`. | C.defadic; M06 p.98. C.catego tiene `ADIC_10` decimal: 11 filas C1, 9 ceros y 2 no ceros. | `scale` podría reutilizarse para una escala diferenciada si se acredita el campo y se incorpora al catálogo aprobado. El binding L[10] ya existente usa otra escala; no sirve como sustituto. | Probar la correspondencia exacta con `ADIC_10`, clase y vigencia. No convertir los dos valores no nulos/no cero en cero colectivo ni equiparar L[11] y L[147]. |
| L[23] | 1 | Años de antigüedad congelada; `units`. | C.defadic y P, concepto 96. El binding de P para antigüedad parcial es L[25]; para total es L[27]. | Agregar un hecho específico de antigüedad congelada, con constancia y captura, o documentar otra fuente semánticamente equivalente. El contrato actual solo reconoce años/meses totales y años parciales. | Definir fecha/regla de congelamiento y el valor reconocido correspondiente. No derivarlo de ingreso, antigüedad total o parcial. |
| L[37] | 1 | Porcentaje de retención sindical; `percent`. | C.defadic; M06 p.100; C.gremio.RETE_33 es decimal. P lo consume en la cantidad de 617, cuya expresión monetaria sigue pendiente. | Fuente versionada de la tasa aplicable al contrato, con afiliación/encuadre acreditados; puede reutilizar infraestructura de hechos o parámetros sólo con esa correspondencia explícita. | Acreditar gremio, aplicabilidad y tasa de octubre. Una fila de la tabla de gremios no asigna afiliación a una persona; resolver L[37] tampoco resuelve la fórmula de 617. |
| L[39] | 1 | Porcentaje de jubilación a retener al empleado; `percent`. | C.defadic; M06 p.103; C.convenio contiene porcentajes `REJU1_02`/`REJU3_02`, candidatos de configuración. P lo consume en 600. | Incorporar una tasa aplicable y versionada mediante binding respaldado; si es común al convenio, demostrarlo antes de usar un parámetro común. | Identificar el campo/regla que origina L[39], su alcance y vigencia. No elegir por parecido de nombre ni igualar aporte patronal y retención personal. |
| L[51] | 2 | Base sujeta para retenciones, con topes; `money`. | C.defadic; M06 p.106 describe topes MOPRE. P la usa en auxiliares 800000991 y 800000992. | Modelar la base derivada o capturada y su etapa de cálculo, límites y componentes, conservando dependencias sin ciclos. No hay binding productivo de esta base en el candidato. | Documentar topes vigentes, conceptos incluidos y tratamiento de SAC/vacaciones/gratificaciones. No sustituir por el bruto o por suma de renglones impresos. |
| L[52] | 1 | Base sujeta para aportes patronales, con desagregación; `money`. | C.defadic; M06 p.106 diferencia esta base y excluye SAC, vacaciones y gratificaciones del total descrito. P la usa en 800000997. | Fuente o cálculo propio separado de L[51], con topes y clasificación de componentes congelados en la captura. | Acreditar el régimen aplicable a octubre. La coincidencia de importes en un caso no autoriza unir las dos bases. |
| L[147] | 3 | Adicional por categoría; `money`. | C.defadic; P lo consume en 90, 93 y 98. Existe configuración de categorías, pero no un enlace acreditado de este campo a una columna concreta. | Parametrizar por categoría o capturar el hecho sólo después de fijar su correspondencia; la infraestructura de escala puede reutilizarse si el respaldo lo permite. | Distinguirlo de L[11]. Confirmar su campo de origen, aplicación y vigencia; no deducir identidad por las etiquetas parecidas. |
| L[151] | 1 | Redondeo del mes anterior según diccionario; `money`. | C.defadic; P lo consume en 296, cuyo rótulo es «RETRO AD. GTIA 195». La configuración acredita esa combinación, no su intención. | Incorporar procedencia histórica exacta y política de arrastre, sin recalcular ni ajustar centavos para igualar otro resultado. | Resolver la discrepancia entre la etiqueta de 296 y la fuente L[151]; identificar período/resultado previo y regla de aplicación. No presumir cero o reutilizar un neto anterior. |

### B. Cantidades familiares — 13 campos, 51 usos

| Referencia | Usos | Significado y tipo exigido | Evidencia disponible | Proveedor o cambio técnico pendiente | Decisión documental real |
|---|---:|---|---|---|---|
| L[60] | 1 | Cónyuge, unidades; `units`. | C.defadic; M06 p.107; G fórmula de 300 multiplica L[60] por L[80]. | F; no está en los seis productores privados del método 22. | Cantidad elegible documentada para el período; vínculo registrado no basta para determinar derecho. |
| L[61] | 3 | Hijos, unidades; `units`. | C.defadic; M06 p.107; P consumidores 301 y 612. | F; respetar ambos consumidores y su fase. | Elegibilidad y cantidad por contrato, sin contar indiscriminadamente vínculos ni certificados. |
| L[62] | 4 | Hijos con discapacidad, unidades; `units`. | C.defadic; M06 p.107; E liga 302 con L[62]/L[82], tipo 3. | F; reutilizar validación privada `prepareC1Method22Facts` para 302 y preservar consumo de 612. | Cantidad elegible acreditada; no inferir condición o derecho a partir de ausencia de datos. |
| L[63] | 3 | Prenatal, unidades; `units`. | C.defadic; M06 p.107; P consumidores 313/314. | F; distinguir cantidad corriente de meses de ajuste L[77]. | Período y cantidad reconocidos. No convertir meses de ajuste en beneficiarios corrientes. |
| L[64] | 2 | Familia numerosa, unidades; `units`. | C.defadic; M06 p.107; G/P concepto 303. | F; regla de elegibilidad propia documentada, no mero conteo de hijos. | Umbral/aplicabilidad y cantidad autorizada del período. |
| L[65] | 4 | Preescolar, unidades; `units`. | C.defadic; M06 p.107; P consumidores 304/311. | F; conservar el uso en asignación y ayuda escolar. | Escolaridad y elegibilidad del período; no deducirlas sólo de edad o existencia del vínculo. |
| L[66] | 8 | Preescolar con discapacidad, unidades; `units`. | C.defadic; M06 p.107; E liga 305 con L[66]/L[86], tipo 7; P también 311/317. | F; reutilizar productor privado 305 y conservar los otros consumidores. | Cantidad acreditada y alcance de cada prestación; no duplicar beneficios por reutilizar una misma cantidad. |
| L[67] | 5 | Escolaridad primaria, unidades; `units`. | C.defadic; M06 p.107; E liga 306 con L[67]/L[87], tipo 8; P también 311. | F; reutilizar productor privado 306. | Elegibilidad y vigencia de escolaridad documentadas para el período. |
| L[68] | 8 | Primaria con discapacidad, unidades; `units`. | C.defadic; M06 p.107; E liga 308 con L[68]/L[88], tipo 9; P también 311/317. | F; reutilizar productor privado 308, con todos sus consumidores. | Cantidad y condiciones acreditadas; mantener diferenciados los conceptos que la consumen. |
| L[69] | 5 | Escolaridad media/superior, unidades; `units`. | C.defadic; M06 p.108; E liga 307 con L[69]/L[89], tipo 10; P también 312. | F; reutilizar productor privado 307. | Nivel y elegibilidad documentados; no transformar un dato genérico de escolaridad en este nivel. |
| L[70] | 5 | Media/superior con discapacidad, unidades; `units`. | C.defadic; M06 p.108; E liga 309 con L[70]/L[90], tipo 11; P también 312. | F; reutilizar productor privado 309. | Cantidad, nivel y condiciones acreditadas para el período. |
| L[75] | 2 | Familiares a cargo, unidades; `units`. | C.defadic; M06 p.108; G/P concepto 310. | F; ampliar a esta prestación; no está en los seis pares privados. | Qué vínculos se reconocen como personas a cargo y cantidad aplicable, sin presumirla por convivencia o parentesco. |
| L[77] | 1 | Meses de ajuste prenatal; `units`. | C.defadic y M06 p.108 precisan ajuste de meses; G/P 314 usa L[77] con L[83]. | Captura de ajuste con períodos y respaldo; separada de la cantidad corriente L[63]. | Meses concretos adeudados/reconocidos, tratamiento temporal y tarifa aplicable al ajuste. No calcularlos por diferencia de fechas sin regla. |

### C. Importes y tarifas familiares — 13 campos, 16 usos

Todas las filas tienen diccionario C.defadic y descripción en M06 p.108. M17 p.81 explica que las variables de importe proceden de la escala de prestaciones; no documenta por sí solo todas las uniones ni la política de tramos.

| Referencia | Usos | Significado y tipo exigido | Evidencia adicional | Proveedor o cambio técnico pendiente | Decisión documental real |
|---|---:|---|---|---|---|
| L[80] | 1 | Importe por cónyuge; `money`. | C.asigflia identifica tipo 1; C.salario contiene tarifas. G/P 300 usa cantidad×importe. | T; ampliar el contrato más allá de los seis pares preparados. | Acreditar mapa a tipo 1, región y tarifa/vigencia; el nombre coincidente es orientación, no aprobación. |
| L[81] | 1 | Importe por hijo; `money`. | C.asigflia identifica tipo 2; C.salario contiene tramos. G/P 301 usa L[61]×L[81]. | T; explicitar fuente del tramo y los hechos que lo seleccionan. | Correspondencia, región y regla de selección para este concepto; no heredar automáticamente la política del método 22. |
| L[82] | 1 | Importe por hijo con discapacidad; `money`. | E/R9: par L[62]/L[82], tipo 3, concepto 302. | T; reutilizar productor privado 302 y añadir captura productiva. | Región, promedio semestral y vigencia de tarifa; frontera inclusiva/rechazo fuera de rango siguen siendo política propuesta. |
| L[83] | 2 | Importe prenatal; `money`. | C.asigflia identifica tipo 4; G/P 313 y 314 lo usan para corriente y ajuste. | T; fuente versionada con tratamiento explícito del ajuste. | Acreditar mapa a tipo 4 y decidir qué vigencia tarifaria corresponde a meses ajustados; no suponer la tarifa corriente. |
| L[84] | 1 | Importe por familia numerosa; `money`. | C.asigflia identifica tipo 5; C.salario tiene configuración. G/P 303. | T; ampliar contrato y captura. | Correspondencia, región y aplicabilidad; existencia de una fila no autoriza un valor universal. |
| L[85] | 1 | Importe preescolar; `money`. | C.asigflia identifica tipo 6; G/P 304. | T; ampliar contrato y captura. | Mapa, región y vigencia aprobados para la prestación. |
| L[86] | 1 | Importe preescolar con discapacidad; `money`. | E/R9: par L[66]/L[86], tipo 7, concepto 305. | T; reutilizar productor privado 305. | Hechos que seleccionan tarifa y política de tramo, con tratamiento de falta de tarifa sin cero supuesto. |
| L[87] | 1 | Importe de primaria; `money`. | E/R9: par L[67]/L[87], tipo 8, concepto 306. | T; reutilizar productor privado 306. | Región, promedio semestral y vigencia documentados; no un promedio de un mes. |
| L[88] | 1 | Importe de primaria con discapacidad; `money`. | E/R9: par L[68]/L[88], tipo 9, concepto 308. | T; reutilizar productor privado 308. | Mismos hechos y política explícita de tramo, sin completar importes ausentes. |
| L[89] | 1 | Importe de media/superior; `money`. | E/R9: par L[69]/L[89], tipo 10, concepto 307. | T; reutilizar productor privado 307. | Región, promedio y vigencia acreditados para el período. |
| L[90] | 3 | Importe de media/superior con discapacidad; `money`. | E/R9: par L[70]/L[90], tipo 11, concepto 309; P también lo consume en 317. | T; reutilizar productor 309 y revisar el uso compartido de la misma fuente en 317. | Documentar que el importe corresponde a cada consumidor; no sustituir una ayuda escolar por otra tarifa sólo para cerrar el binding. |
| L[91] | 1 | Ayuda escolar primaria, importe; `money`. | G/P 311; C.asigflia distingue ayuda escolar (12), por discapacidad (13) y variantes de familia numerosa (14/15). | T con mapa específico. No hay productor privado que cierre esta correspondencia. | Resolver tipo y alcance exactos; no asumir que la numeración de prestaciones representa primaria/secundaria. |
| L[92] | 1 | Ayuda escolar media/superior, importe; `money`. | G/P 312; mismo catálogo de tipos, que no etiqueta 13 como secundaria. | T con mapa específico separado del de L[91]. | Justificar la tarifa aplicable y su vigencia; no asignar tipo 13 por proximidad numérica. |

### D. Subrogancia — 5 campos, 14 usos

| Referencia | Usos | Significado y tipo exigido | Evidencia disponible | Proveedor o cambio técnico pendiente | Decisión documental real |
|---|---:|---|---|---|---|
| L[76] | 1 | Agrupamiento de la segunda asignación; `code`. | C.defadic; M06 p.108; P lo compara como código en auxiliar 78. | Hecho propio de segunda asignación, conservado como código y vinculado a contrato/período. El encuadre principal actual no contiene este campo. | Acto/constancia y vigencia de la subrogancia; no usar el agrupamiento principal ni deducirlo del puesto. |
| L[78] | 7 | Sueldo de convenio de la segunda categoría; `money`. | C.defadic; M06 p.108; C.catego tiene importes diferenciados; P consumidores auxiliar 78 y concepto 96. | Capturar segunda asignación y resolver escala exacta de esa asignación. `scale_reference` actual fija clase en el binding; no obtiene una segunda clase del contrato. | Acreditar categoría/convenio secundarios y columna salarial correspondiente, con vigencia. No sustituir L[10]. |
| L[79] | 1 | Sueldo de clase de la segunda categoría; `money`. | C.defadic; M06 p.108; P concepto 96. | Igual infraestructura de segunda asignación, pero importe separado de L[78]. | Determinar sueldo de clase frente a sueldo de convenio; la configuración conserva ambos campos, no su igualdad. |
| L[95] | 1 | Función de la segunda asignación; `code`. | C.defadic; M06 p.109; P auxiliar 78. | Agregar código de función secundario al hecho versionado de subrogancia. | Función y vigencia acreditadas; no extraer el código del texto de una tarea o nombre del área. |
| L[98] | 4 | Clase/categoría de la segunda asignación; `code`. | C.defadic; M06 p.109; P auxiliares 27/28/29 usan comparaciones exactas. | Agregar categoría secundaria; conservar código textual y las cuatro comparaciones, sin sustituir `classification_fact.categoryCode`. | Clase secundaria vigente y su relación con la asignación formal. No prolongar una designación anterior sin respaldo. |

### E. Indicadores específicos — 2 campos, 2 usos

| Referencia | Usos | Significado y tipo exigido | Evidencia disponible | Proveedor o cambio técnico pendiente | Decisión documental real |
|---|---:|---|---|---|---|
| L[301] | 1 | Indicador de pago docente; `boolean`. | C.defadic define 0/1; P concepto 19 compara con verdadero. C.convenio tiene además `docente`, pero a nivel convenio. | Nuevo hecho por contrato/período o correspondencia expresamente demostrada. El booleano de convenio no acredita el indicador individual. | Aplicabilidad individual, vigencia y dominio de valores; desconocido no equivale a falso. |
| L[400] | 1 | Indicador de mayor dedicación vivienda; `boolean` en P. | C.defadic identifica pago con 1; P concepto 45 usa una condición booleana además de su cantidad porcentual. | Hecho específico versionado; preservar separación entre autorización de pago y porcentaje N[45]. | Acreditar la condición y cómo se convierte el dominio original a booleano. No inferirla de la existencia de una novedad ni aceptar cualquier número como verdadero. |

## Seis pares con productor privado reutilizable

Este mapa está expresamente conservado en E y en el código R9; no se reconstruyó mediante la FK nula/cero.

| Concepto | Cantidad | Tarifa | Tipo familiar documentado en R9 |
|---|---|---|---|
| 302 | L[62] | L[82] | 3 |
| 305 | L[66] | L[86] | 7 |
| 306 | L[67] | L[87] | 8 |
| 307 | L[69] | L[89] | 10 |
| 308 | L[68] | L[88] | 9 |
| 309 | L[70] | L[90] | 11 |

El productor necesita U[1] en días, cantidad elegible, región y promedio semestral cuando la rama los consume. Con cantidad conocida cero puede conservar una tarifa no consumida como desconocida; esto no convierte una cantidad desconocida en cero. Las políticas propuestas son primer tope inclusivo y error fuera de rango. La captura debe conservar los hechos y su huella desde el principio: no se agregan después a una corrida antigua como si ya estuvieran congelados.

## Próximas tareas ejecutables, sin declarar habilitado el cálculo

1. **Fijar este inventario y sus fuentes en el trabajo de implementación.** Resolver cada referencia conservando los 95 usos, unidades y consumidores. Los nombres de tablas y las correspondencias candidatas son hipótesis de integración donde la matriz así lo dice; no son valores para importar.
2. **Diseñar la captura familiar reutilizando los seis pares existentes.** Especificar identidad, período, elegibilidad, región, promedio semestral, tarifas y procedencia completa; conservar desconocidos. Integrar con los controles actuales de sesión, alcance y aprobación. Para los otros 14 campos familiares, completar el mapa o contrato antes de extender el productor.
3. **Cerrar las decisiones de semántica con documentos ya existentes o responsables de nómina.** Prioridades: L[51]/L[52] y topes; L[23] congelada; L[91]/L[92] y tipos; separación L[11]/L[147]; aplicación de L[151] en 296. No pedir nuevas aprobaciones de Jornada/Antigüedad para suplir estos campos distintos.
4. **Preparar cambios delimitados de proveedores.** Segunda asignación para los cinco campos de subrogancia; tasas aplicables; dos indicadores; antigüedad congelada; escalas diferenciadas donde se pruebe el mapeo. Reutilizar catálogo/novedades/hechos existentes cuando sean semánticamente suficientes; no usar una bolsa sin tipar de variables L.
5. **Sólo después, volver al preparador completo y a la integración V4.** Verificar el inventario íntegro y los conflictos restantes, persistencia/reversión de efectos, catálogo y cierre/recibos; usar capturas nuevas con fuentes aprobadas. El trabajo de esta matriz no aprobó políticas ni demuestra que octubre pueda liquidarse.

## Comprobación del alcance de este informe

- 41 referencias únicas y 95 usos, sin filas omitidas.
- 41 etiquetas contrastadas con `C.defadic`; tipos contrastados con los nodos `source`/`source_match` y fases de cantidad de P.
- 26 campos familiares (67 usos), 5 de subrogancia (14), 8 de adicionales/antigüedad/retenciones/arrastre (12), 2 indicadores (2): 67 + 14 + 12 + 2 = 95.
- Dos miembros de configuración y los extractos de manual verificados por SHA256 de bytes. Sin consultas nominales, scripts del expediente ejecutados, nuevos ensayos, cambios de aplicación o base, propuestas ni aprobaciones.
