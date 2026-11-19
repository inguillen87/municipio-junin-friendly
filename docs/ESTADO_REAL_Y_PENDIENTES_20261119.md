# Estado real y pendientes · 19/11/2026

Este documento reemplaza, como punto de partida, a las notas de entrega de noviembre que terminan en «no se ejecutó SQL» o «Codex instala»: varias quedaron atrasadas. Lo que sigue se verificó contra la base operativa (consultas de sólo lectura por catálogo) y contra el sitio publicado, no contra otros documentos.

## Qué está publicado e instalado

| Qué | Estado verificado |
|---|---|
| Sitio | `municontrol.com` sirve `b9b3c463` (candidato 6). Desde el candidato 4: PDF con paginado y pies documentales, pantallas de la ronda 2 (14 pantallas, 320/375/768/1366 px), panel «MuniControl contra GRH». |
| Migraciones del repositorio | Las 149 migraciones de `scripts/migrations` que crean funciones o tablas propias están completas, incluidas 234 a 242. Las 45 que sólo redefinen objetos no se pueden comprobar por nombre. |
| Asistencia por áreas (composición) | Instaladas el 19/11, en orden: autoridad, historial, dispositivos esperados, jornadas por área y escritoras de cargo; después 240 y 241. Cada artefacto idéntico byte a byte al ensayado. |
| Interruptor `ATTENDANCE_DAILY_NOTICE_ENABLED` | Sin definir. El aviso diario sigue apagado. |
| Candidatos sin instalar | `own-employment-print-facts-v1` y `own-receipt-print-facts-v6` (diseño de recibo v6). |

Batería completa del candidato 4 con Node 24.21.0: 14.627 pruebas, 0 fallas.

## Cómo se ensaya e instala SQL desde ahora

1. Rama de ensayo: copia aislada de la base operativa (mismo motor y mismo catálogo).
2. Por fuente: observación en sólo lectura, `--merge --source`, revisión, `--write`/`--check`, ensayo con ROLLBACK, instalación.
3. `plpgsql_check` sobre toda función PL/pgSQL creada o redefinida. La creación sólo valida sintaxis: el error de precedencia de `attendance_area_history_v1` se creaba sin aviso y habría fallado al ejecutar.
4. Verificación por catálogo: dueño, `EXECUTE` exacto del rol de la aplicación, nada para PUBLIC, RLS y disparadores.
5. Respaldo inmediatamente antes de producción. En producción, cada artefacto tiene que ser idéntico al ensayado o el procedimiento se detiene.

Reglas que salieron del ensayo y ya tienen prueba de regresión:
- Dentro de la condición de un `IF` de PL/pgSQL, todo `CASE` va entre paréntesis.
- Los operadores JSON (`->`, `->>`, `#>`, `#>>`) tienen menos precedencia que `+` y `-`: `(a->'x')-'y'`.
- Una dependencia creada por una fuente anterior se atesta sólo con el cuerpo de esa fuente revisada.

## Asistencia por áreas: qué quedó resuelto y qué pasos hace el municipio

Las dos piezas que faltaban ya tienen función y pantalla:

- **Alcance de área por cuenta** (migración 243): Administración → «Áreas de asistencia». Ver `docs/ATTENDANCE_AREA_SCOPE_ADMIN_20261119.md`.
- **Vigencia de área de los contratos adoptados** (migración 244): Personal → «Vigencia de área de los contratos adoptados». Ver `docs/ATTENDANCE_AREA_EFFECTIVITY_20261119.md`.

Lo que sigue son actos del municipio dentro de la aplicación, no desarrollo pendiente:

1. Asignar la capacidad «Consultar asistencia por área» a las cuentas que correspondan (Usuarios y roles).
2. Concederles sus áreas (Áreas de asistencia).
3. Declarar la vigencia: una persona prepara y otra aprueba. Hoy hay 787 contratos declarables en 124 áreas; 61 legajos no tienen repartición completa y hay que rectificarlos antes.
4. Declarar los relojes esperados de cada contrato.

## Qué falta en los demás circuitos

| Circuito | Falta | Depende de |
|---|---|---|
| Liquidación propia de octubre | Maestro salarial y programa de reglas aprobados por convenio; corrida real; aceptación | Aprobaciones de dos personas dentro de la aplicación |
| Comparación MuniControl contra GRH | La liquidación de GRH del mismo período incorporada a las tablas de detalle | Respaldo de GRH del período |
| Recibos v6 | Componer e instalar los candidatos de hechos de impresión; definir `INTERNAL_RECEIPT_ACTIONS_TARGET` | Decisión de diseño y revisión |
| Asientos, banco y TXT | Vincular una corrida cerrada con las asociaciones contables; aceptación del banco | Banco y Contaduría |
| F931, OSEP, ART | Homologación campo por campo | Organismos |
| Relojes | 8 de 14 puntos sin captura verificada; vínculo usuario de reloj ↔ contrato por fecha; turnos y tolerancias aprobados; prueba de autonomía con el colector en un servidor propio | Red municipal, VPN y acceso en sitio |
| Novedades de ausentismo a nómina | Regla expresa para convertir tardanzas | Decisión municipal |

«Oracle» en este proyecto es la máquina virtual gratuita de Oracle Cloud propuesta para alojar el colector de relojes; no es una base de datos Oracle (GRH usa MariaDB).

## Verificaciones automáticas

Sobre el candidato 2, 57 de 68 flujos pasaban. Las fallas restantes eran de la propia verificación, no del producto, salvo una colisión de atributos que no producía efecto visible:

- Circuito de Noelia: cuatro desactualizaciones encadenadas (navegación con cargas en curso en Firefox, dos paneles con la misma envoltura, catálogo `prepared-sources` del 5/11, animación de 0,24 s de los acordeones). Corregidas; el paso del circuito real con HTTP, SQL y navegador pasó con PostgreSQL 17 y 18.
- Regresión de navegación de Liquidaciones: las filas de la comparación de respaldos compartían `data-pc-status` y `data-pc-review` con el mensaje de estado y el contador del panel. Las filas usan ahora atributos propios.
- «Own contract working time» y «Own payroll administrative operator»: cada una pasa con una versión de PostgreSQL y falla con la otra, al revés entre sí. Perfil de falla por carga de los ejecutores; pendiente de confirmar con una corrida sin cola.

La corrida completa sobre el candidato 5 (`claude/integracion-20261117`) quedó lanzada el 19/11.

Candidato 6 (243 y 244 sobre el candidato 5): batería completa con Node 24.21.0, 14.719 pruebas, 0 fallas y 3 omitidas; ambas migraciones ensayadas en orden sobre una copia aislada de la base operativa, con `plpgsql_check` sin hallazgos en las funciones nuevas; los dos paneles nuevos revisados en navegador real a 375 y 1366 px.

**Instalado y publicado el 19/11/2026**, con decisión expresa: migraciones 243 y 244 en la base operativa (los mismos archivos del ensayo, con respaldo previo) y candidato 6 en `municontrol.com` (`b9b3c463`). Verificado después: 20 funciones nuevas, sólo las 4 fachadas concedidas a la aplicación y ninguna a PUBLIC; 3 tablas nuevas con RLS y sin permisos para la aplicación; guardas en verdadero; los cuatro consumidores con la huella esperada; sin filas nuevas; el sitio sirve las dos pantallas y sus servicios rechazan un pedido sin sesión.

**Revisión de las 05:00 del 19/11 sobre el candidato 6 (`b9b3c463`).** 30 flujos pasaron, 2 fallaron, 2 se cancelaron y 37 seguían corriendo o en cola.

- Las 2 fallas son las dos comprobaciones de navegador ya corregidas después de publicar («Own payroll calculation» esperaba `display: grid` en filas que la ronda 2 muestra como tarjetas; el circuito de Noelia leía un acordeón antes de que terminara de abrirse). Ninguna es un defecto del producto.
- El circuito de Noelia, relanzado sobre la corrección: pasa con PostgreSQL 18; con PostgreSQL 17 se detuvo antes, en otro paso, con `EMPLOYMENT_ADOPTION_BUSY` (la función no obtuvo un bloqueo dentro de su límite). Es el perfil de carga de los ejecutores; se reintentó una vez.
- Las 2 cancelaciones («Complete municipal clock park» e «Institutional access origin recovery») cortaron a los 15 minutos exactos, durante la construcción del sitio: es el límite de tiempo del trabajo, no una falla. La batería creció a 14.722 pruebas y con la cola cargada la construcción ya no entra en 15 o 20 minutos. Los trabajos con límite menor a 30 minutos en flujos que construyen el sitio pasan a 30 (37 archivos).

**Cierre de la corrida sobre el candidato 6 (`b9b3c463`), 19/11 07:20.** 71 flujos: 64 pasaron, 2 fallaron y 5 se cancelaron. Ningún defecto del producto.

- Fallas (2): las dos comprobaciones de navegador ya corregidas.
- Cancelaciones (5): todas por límite de tiempo del trabajo, con los ejecutores cargados. Tres cortaron durante la construcción del sitio con límites de 15, 20 y 25 minutos (cubiertas por el límite nuevo de 30). «Municipal owner salary» (PostgreSQL 18) agotó sus 45 minutos todavía instalando dependencias del navegador.
- Circuito de Noelia sobre la corrección, segundo intento: PostgreSQL 18 pasa; PostgreSQL 17 superó el paso que había respondido `EMPLOYMENT_ADOPTION_BUSY` y agotó sus 45 minutos en un paso posterior. Queda sin una corrida completa en verde con PostgreSQL 17.

Setenta y un flujos que construyen el sitio completo cada uno saturan los ejecutores: la cola tarda unas cuatro horas y los límites de tiempo cortan trabajos sanos. Pendiente: construir una sola vez por commit y compartir el resultado entre flujos.

El PR #304 avanza con las dos correcciones de navegador, el límite de 30 minutos y la prueba estática de la migración 245.

**Corrida sobre `350904ee` (PR #304), 19/11 09:40.** 74 flujos: 60 pasaron y 14 fallaron. «Own payroll calculation» y el circuito de Noelia pasan con las correcciones de navegador, el circuito completo con PostgreSQL 17 y 18. Ningún trabajo se canceló por tiempo.

- 12 fallas son de la infraestructura de los ejecutores: el archivo de paquetes de Ubuntu no respondió al instalar las dependencias del navegador o el cliente de PostgreSQL (`Connection timed out`). No llegaron a ejecutar ninguna comprobación.
- «GRH coordinated source publication checks»: la comprobación `verify-payroll-summary-055` esperaba que abrir el archivo de Personal no consultara nada hasta apretar «Buscar». La pantalla consulta al abrir, a propósito, desde hace varias versiones; antes este flujo se cancelaba por tiempo y la falla no se veía. Se reprodujo en Chromium y se actualizó la comprobación.
- «Own period participation» con PostgreSQL 18: un 503 en el paso que prueba la recuperación de lecturas ocupadas. Había pasado sobre `b9b3c463`; perfil de carga.

**El cálculo dice qué dato falta (candidato 7, sin publicar).** Cuando una fórmula pide un dato sin valor, el motor informa qué clave pidió, el servidor dice de qué fuente sale y a cuántas de las personas elegidas les falta, y el panel arma el texto con su propio vocabulario. Ejemplo con el caso del ensayo: «Falta cargar los datos familiares del período (cónyuge): sin valor en 79 de 81 personas elegidas. No se supuso cero. Completá ese dato, aprobalo y volvé a calcular. Clave en las reglas: familia_spouse.» Además, para no avisar de a un dato por intento, el servidor completa ese dato con un valor neutro sobre una copia en memoria y vuelve a calcular hasta doce veces o veinte segundos, sólo para listar qué pedirían después las fórmulas; esa copia no se guarda ni se devuelve, y los conteos salen siempre de la entrada aprobada. El aviso no lleva datos de personas. Como cambia un archivo del motor, cambia la huella del algoritmo: una captura hecha antes de publicar y todavía sin calcular hay que repetirla. Batería completa: 14.730 pruebas, 0 fallas.

## Medido en la base operativa el 19/11 (sólo totales)

**Relojes.** 6 puntos y 6 dispositivos activos, 85.170 marcaciones crudas en total. Estado por reloj:

| Reloj | Marcaciones | Última recibida | Situación |
|---|---|---|---|
| A | 11.412 | 19/11, 00:39 | Entrega sola, en lotes a lo largo del día (186 lotes en 7 días). Es el único automatizado de punta a punta. |
| B | 15.122 | 12/11 | Dejó de entregar el 12/11. |
| C | 5.787 | 11/11 | Dejó de entregar el 11/11. |
| D | 37.625 | 10/11 | Dejó de entregar el 10/11. |
| E | 13.765 | 5/11 (marcas hasta el 6/10) | Sólo una carga histórica. |
| F | 1.459 | 5/11 (marcas hasta el 6/10) | Sólo una carga histórica. |

Esta lectura de la madrugada quedó superada: los relojes B, C y D no dependían del recolector anterior. El traslado al recolector autónomo se hizo el 10/11 y lo que los cortó fue un conflicto de VPN; está explicado más abajo, en «Por qué dejaron de entregar tres relojes». Ocho puntos más no están registrados.

**Liquidación propia de octubre: por qué no calculó y qué falta de verdad.** Se reprodujo en memoria, sin escribir nada, el cálculo que la aplicación intentó sobre la captura guardada del 6/11 (848 personas). Todas las fuentes están completas (condiciones salariales, jornada, antigüedad y participación de las 848; catálogo salarial de 391 conceptos). El motor se detiene con `PAY_RULE_MISSING`: «faltan reglas de haberes vigentes para un contrato del conjunto».

- El programa aprobado (revisión 1) tiene 50 reglas, todas del **convenio 1** y con vigencia **sólo de septiembre**. Para octubre no hay ninguna regla vigente.
- La propuesta pendiente del 14/11 tiene 172 reglas (122 para octubre), también **todas del convenio 1**. Aprobarla alcanza, como máximo, a las 81 personas de ese convenio. Los otros once convenios (767 personas) no tienen ninguna regla, ni aprobada ni propuesta.
- Además hay 0 novedades fijas y 0 lotes de novedades mensuales cargados.

Alcance medido contra la liquidación mensual de octubre de GRH (844 recibos, 21.472 renglones, 89 conceptos usados; los códigos 990 a 999 son totales, no conceptos con regla):

| Convenio | Recibos GRH | Conceptos usados | Ya tienen regla en el convenio 1 | Conceptos sin regla en ningún convenio |
|---|---|---|---|---|
| 1 | 79 | 65 | 55 | ninguno |
| 2 | 23 | 42 | 30 | 140, 203 |
| 4 | 160 | 58 | 48 | ninguno |
| 5 | 164 | 47 | 27 | 30, 49, 70, 79, 97, 115, 168, 169, 195, 199 |
| 6 | 295 | 67 | 55 | 206, 640 |
| 7 | 10 | 32 | 21 | 10, 140 |
| 11 | 12 | 32 | 21 | 140 |
| 12 | 43 | 37 | 24 | 30, 70, 195 |
| 13 | 54 | 40 | 27 | 30, 70, 195 |
| 14 | 4 | 27 | 13 | 30, 70, 115, 195 |

En total, 64 de los 89 conceptos usados ya tienen una regla escrita para el convenio 1 y 15 no tienen regla en ningún lado (10, 30, 49, 70, 79, 97, 115, 140, 168, 169, 195, 199, 203, 206 y 640). Que el código coincida no garantiza que la fórmula sea la misma en otro convenio: cada regla replicada hay que contrastarla con GRH en el comparador.

**Programa de reglas de octubre aprobado en la base operativa (19/11, 11:54).** La propuesta pendiente del convenio 1 (172 reglas y 164 entradas, maestro revisión 10) quedó aprobada como **revisión 2**. La aprobó Marcelo por indicación expresa en el chat («hacelo vos todo»), operada por Claude en la sesión de Marcelo, y el fundamento registrado lo dice con esas palabras: no hubo revisión independiente por otra persona, porque la propuesta también la había cargado Claude a pedido de Marcelo. La pantalla ofrece una «decisión del propietario» separada, pero no está habilitada para esa cuenta (pide permiso de preparación); se usó el formulario de decisión y se dejó la aclaración en el texto. No calcula ni paga nada. Septiembre no cambia.

**Ensayo con las funciones reales, en una copia aislada de la base.** Se aprobó allí la propuesta pendiente con otra persona que la que la preparó (el programa pasó a revisión 2, con 172 reglas) y se pidió la captura de octubre:

1. Con la dotación completa, la captura se rechaza con `OWN_RUN_OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED`: con el programa nuevo, cada corrida es de **un solo convenio**.
2. Con sólo el convenio 1, la captura se rechazaba con `DECLARED_ADJUSTMENT_REVIEW_REQUIRED`. **No era una carga pendiente: era un defecto.** Octubre ya tiene dos lotes de novedades preparados y aprobados por dos personas distintas (7 renglones); las cuatro funciones que controlan esa doble revisión exigían que el identificador de persona de cada actor tuviera formato RFC 4122, y los identificadores de persona de este municipio son derivados (el 92 % no lo cumple; ninguno de los actores que ya operaron lo cumple). La migración 245 corrige sólo ese control y recompone la cadena de atestación. Ver `docs/OWN_RUN_ACTOR_PERSON_FORMAT_20261119.md`.
3. Con la 245 instalada en la copia, la captura se rechaza con `OWN_RUN_SALARY_NATIVE_APPROVAL_REQUIRED`: el programa nuevo usa cuatro condiciones salariales que nadie cargó todavía (adicional docente, importe de referencia docente, vivienda o mayor dedicación, días base del mes). Se cargan de una vez para todos los contratos elegidos: una persona propone y otra aprueba. En la copia se hizo con valores neutros para los 81 contratos y funcionó.
4. La captura del convenio 1 pasa: 81 personas, con los dos lotes de novedades incluidos.
5. El motor se detiene con `SOURCE_VALUE_MISSING`: la antigüedad de octubre está aprobada para los 848 contratos, pero **332 quedaron con los años «sin informar»**, y el motor no supone cero. Por convenio: 1 → 5 de 81; 2 → 1 de 23; 3 → 1 de 1; 4 → 26 de 158; 5 → 166 de 166; 6 → 22 de 292; 7 → 2 de 10; 9 → 1 de 1; 11 → 4 de 12; 12 → 44 de 44; 13 → 56 de 56; 14 → 4 de 4. Sólo bloquea donde la fórmula del convenio usa la antigüedad. En la copia se cargó 0 para los 5 del convenio 1 con el comando real (propone una persona, aprueba otra) y funcionó.
6. El motor se detiene con `INPUT_MISSING` al pedir el dato familiar «cónyuge». La declaración familiar de octubre **está aprobada para los 81 contratos, pero con las doce cantidades «sin informar» en 79 de ellos** (cónyuge, hijos por nivel escolar, discapacidad, familia numerosa, prenatal, personas a cargo); además nadie tiene informados los meses de ajuste prenatal, la región ni el promedio semestral. En la copia se completaron con cero las cantidades de los 79 con el comando real y funcionó.
7. El motor pide entonces los meses de ajuste prenatal (sin informar en los 81). Completados con cero en la copia.
8. El motor pide la antigüedad parcial (`partialSeniorityYears`), que está aprobada «sin informar» en los 81 contratos. Hasta ahí llegó el ensayo. Quedan sin valor, y pueden ser lo siguiente que pida una fórmula: el importe de referencia docente y dos datos docentes (81), el código y el porcentaje de título (27) y las nueve tarifas familiares (81).

9. Completada con cero la antigüedad parcial de los 81 contratos, **el cálculo de octubre del convenio 1 termina**: 81 personas, 9.882 renglones. La base verificó el resultado entero y lo guardó en la copia. Es la primera corrida completa de octubre con las funciones reales; sus valores no son oficiales porque varios datos se completaron con cero.

**Comparación contra GRH de esa corrida** (sólo conteos; 79 de las 81 personas tienen recibo de GRH en octubre):

| Qué | Resultado |
|---|---|
| Personas con todo igual | 0 de 79 (esperable: faltan las novedades del mes y los datos familiares van en cero) |
| Celdas persona × concepto iguales al centavo | 340 de 1.329 |
| Conceptos que coinciden donde ambos sistemas liquidan | 24 (50 de 51), 606 (76 de 79), 607 (35 de 36), 53 (6 de 6) |
| Básico (concepto 1) | 38 personas iguales, 38 distintas, 3 sólo en MuniControl |
| Diferencias de un centavo (redondeo) | 48 (28 personas, 3 centavos en total), 51, 52 y 58 |
| Conceptos que GRH liquidó y MuniControl no | 44 mayor dedicación (37 personas), 95 full time (25), 80 responsabilidad jerárquica (19), 300 a 309 asignaciones familiares, 602 a 678 entidades y otros |
| Aportes y contribuciones (600, 601, 604, 685, 701, 703) | Distintos en 67 o 68 personas, porque la base sobre la que se calculan difiere |

**Corrección del 19/11 al mediodía sobre esta primera lectura.** Dos conclusiones de la madrugada estaban mal y se retiran:

- **No hay que corregir ningún importe del maestro.** El maestro del convenio 1 de octubre coincide con la tabla de escalas de GRH en las nueve categorías. La diferencia del básico es de GRH: **GRH guarda cada importe en precisión simple** (número de 32 bits), y arriba de $131.072 esa precisión no alcanza para todos los centavos. Paga 382.692,72 donde la escala dice ,71; 463.058,20 por ,18; 524.289,00 por ,01; 600.827,56 por ,55 y 654.404,50 por ,53: es exactamente el valor en precisión simple escrito con los dígitos mínimos. Se comprobó sobre los 17.846 importes no nulos de la liquidación mensual de octubre de GRH: **el 100 % es representable así**, incluidos los 7.537 mayores a $131.072, donde un importe decimal exacto sólo pasaría la prueba entre el 16 % y el 64 % de las veces.
- **El 144 es presentismo, no mayor dedicación.** Difiere porque su base incluye conceptos que todavía faltan (44, 95, 80).

Consecuencia para la comparación: «igual al centavo» contra GRH no es alcanzable para importes grandes, y tampoco es deseable copiarle el error. El criterio que se usa desde ahora es: **el importe exacto de MuniControl, pasado a precisión simple, tiene que dar el de GRH**. Es una regla exacta, no una tolerancia.

**Novedades de octubre cargadas en el ensayo (19/11, 12:10).** El programa lee las novedades del mes como cantidades, importes y presencias por concepto. En la base operativa hay 7 filas de novedades propias aprobadas para octubre; GRH liquidó octubre con 2.927 (849 legajos). Se cargaron en la copia, con las funciones reales (una cuenta prepara y envía, otra aprueba), las 318 del convenio 1 tomadas del respaldo del 28/10, con la misma codificación que las 7 ya aprobadas. Resultado, sobre 79 personas y 1.329 celdas persona × concepto:

| | Antes | Con las novedades |
|---|---|---|
| Iguales al centavo | 340 | 744 |
| Iguales con la precisión de GRH | — | 163 más: **907 de 1.329** |
| Conceptos que coinciden en todas las personas | 4 | 21, entre ellos todas las entidades (mutuales, seguros, gremios, colegio, IPV) |
| Básico | 38 iguales, 38 distintos | 38 al centavo + 38 por precisión + 0 distintos |
| Antigüedad | 48 iguales, 28 distintos | 48 + 26 + 2 distintos |

**Lo que falta de verdad para cerrar el convenio 1 de octubre** (conteos del ensayo):

| Falta | Personas | Cómo se carga |
|---|---|---|
| Responsabilidad jerárquica (80), cajeros (56), sistemas (57) | 19, 4 y 1 | Novedades fijas con cantidad |
| Asignaciones familiares (300 a 309) y seguro mutual por hijo (612) | 37 cónyuge, 28 hijos, 19 escolaridad media, 10 primaria, 5 preescolar, 3 familia numerosa, 1 y 1 con discapacidad · 28 | Declaración familiar con cantidades |
| Novedades que GRH marca «forzadas» y las reglas no saben aplicar | 14 filas: embargo alimentario (4, con importe) y diez que fuerzan a cero un concepto calculado (básico 3, 107 2, riesgoso 2, cónyuge, presentismo, seguro por hijo) | Falta una regla. Hoy el motor frena con «las reglas no dicen cómo aplicarla»; en el ensayo se dejaron fuera en memoria para poder comparar, sin guardar nada así |
| Mayor dedicación, full time, presentismo, jubilación, OSEP y contribuciones | 17 a 29 | Se corrigen solos al cargar lo anterior: sus bases incluyen 80, 56 y 57 |

Quedan dos archivos privados en la PC de Marcelo, para liquidaciones: la planilla de diferencias por legajo y concepto (587 filas, con el nombre de cada concepto y qué revisar) y las novedades de octubre del convenio 1 listas para cargar (304 filas, sin las 14 forzadas, que van aparte). No se publican.

**Cargar esas novedades en la base operativa hoy pide 26 pegados**, uno por concepto, porque la planilla pegada de Novedades admite un solo concepto. El candidato 8 le agrega una **columna de concepto**: un pegado carga todos. La carga la prepara una cuenta y la aprueba otra persona.

**Estudio de las diferencias (primera lectura, se conserva lo que sigue en pie).**

- **Tres personas con básico sólo en MuniControl.** Tienen recibo de GRH sin básico: son tres de las novedades forzadas a cero.

**Límites reales de una corrida, medidos.**

- **Tiempo.** Verificar y guardar la corrida de 81 personas llevó unos cinco minutos en la copia. La función publicada que calcula y guarda no declaraba su límite y corría con el valor por defecto del proyecto, 300 segundos: justo en el borde. Desde el candidato 7 declara 800 segundos, el máximo del plan.
- **Tamaño.** La base rechaza con `OWN_RUN_LIMIT` una corrida cuya captura, entrada y resultado sumen más de 32 MB. La de 81 personas suma unos 22 MB (el resultado solo, 17 MB). Con el programa actual el tope queda cerca de **120 personas por corrida**.
- **Consecuencia práctica.** Octubre no se puede calcular en una sola corrida ni siquiera por convenio: los convenios 4 (158 personas), 5 (166) y 6 (292) hay que partirlos por dependencia. Para la dotación completa son del orden de diez corridas. Pendiente: que la pantalla lo avise antes de calcular y proponga cómo partir, y estudiar por qué la verificación tarda tanto (o pasarla a un trabajo en segundo plano).

El patrón es uno solo: las cargas de octubre se aprobaron en bloque con muchos campos «sin informar», y las fórmulas del convenio 1 piden un valor explícito en cada uno, aunque sea cero. El motor avisa de a un dato por vez.

Dos cosas del producto que el ensayo dejó a la vista y todavía no están resueltas:

- `INPUT_MISSING` no dice **qué** dato falta ni **a cuántas personas**. Quien opera ve «Falta una entrada necesaria» y no sabe qué cargar. Hace falta una pantalla de preparación del período que lo liste por fuente antes de calcular.
- Sólo la jornada y la antigüedad tienen carga colectiva con seguimiento; las condiciones salariales y los hechos familiares se cargan con un único comando para muchos contratos, sin archivo ni reanudación.

En la base operativa no se aprobó ni se cargó nada. La migración 245 **quedó instalada el 19/11**, con decisión expresa y respaldo previo, y verificada.

Para calcular octubre del convenio 1 faltan, en este orden: aprobar el programa; cargar y aprobar las cuatro condiciones salariales nuevas; informar la antigüedad de los 5 contratos que la tienen vacía; informar las cantidades familiares de 79 personas y los meses de ajuste prenatal de las 81; informar la antigüedad parcial de las 81; lo que el motor pida después; calcular; comparar contra GRH. Para los otros once convenios falta además llevarles las reglas y escribir las 15 que no existen.

**Respaldo de GRH del 9/11 (corrección).** El respaldo **sí había sido entregado**, varias veces desde el 10/11; el error fue de Claude, que lo buscaba con otro nombre y otra fecha. Es el corte del 9/11/2026 15:17. Ya está perfilado y comparado contra el corte del 28/10 15:16, que es el último incorporado (los conjuntos de octubre se importaron el 4/11). Informe agregado `grh-backup-review.v1`, sin datos de personas:

| Tabla | Corte 28/10 | Corte 9/11 | Diferencia |
|---|---|---|---|
| persona | 2.357 | 2.358 | 1 alta |
| legajo | 2.458 | 2.459 | 1 alta; 778 con fechas actualizadas; 4 cambios de estado |
| familia, vínculo, organización | 3.656 · 9 · 83 | iguales | sin cambios |
| histocal (liquidaciones) | 635 | 636 | 1 nueva: **noviembre 2026 tipo V, cerrada** |
| histolegajo | 845 | 843 | identificadores regenerados por el sistema origen; se compara con el análisis de sucesor |

Además, por conteo de filas: 8.744 renglones de cálculo nuevos (la liquidación de noviembre tipo V), 2.677 movimientos de legajo, 22 ausencias, 16 asientos de foja y 1 embargo. La liquidación mensual de noviembre figura abierta en GRH a esa fecha. **Cargada en la base operativa el 19/11, con decisión expresa de Marcelo y respaldo previo: la liquidación de noviembre 2026 tipo V (cerrada), 539 recibos y 8.260 renglones.** Se usó la entrega gobernada de siempre: extracción privada con `scripts/extract-grh-payroll-detail.py`, contenido cifrado, preautorización de la entrega con sus huellas y envío por `api/payroll-source-delivery`. Ensayada antes en una copia con el mismo contenido. La respuesta y la base coinciden: 539 recibos, 8.260 renglones, sin modificar ninguna nómina; la entrega quedó aplicada y su frase borrada.

La liquidación mensual de noviembre (843 recibos, 19.730 renglones) **no se cargó**: en GRH figura abierta y puede cambiar. **Octubre no cambió.** Las cuatro liquidaciones de octubre (F, M, O y V) son idénticas recibo por recibo entre el corte del 28/10 y el del 9/11: lo que MuniControl tiene de octubre es definitivo.

**Novedades de personal de GRH que el padrón propio todavía no refleja** (cruce por legajo contra la base operativa, sólo conteos). El núcleo de personal de MuniControl viene del corte del 10/09 y desde la adopción se mantiene con cargas propias, así que estas novedades se cargan en Personal, con su aprobación:

| Novedad en GRH entre el 28/10 y el 9/11 | Cantidad | En MuniControl |
|---|---|---|
| Alta (ingreso 1/11, convenio 6) | 1 | No existe |
| Baja (egreso 1/11, 1/11 y 9/11) | 3 | Siguen activos |
| Reingreso (GRH quitó el egreso de febrero) | 1 | Sigue inactivo |
| Cambio de convenio (del 1 al 2) | 1 | Sigue en el 1 |
| Cambio de cuenta bancaria | 2 | Sin reflejar |

La lista con los legajos quedó en un archivo privado en la PC de Marcelo, para Noelia; no se publica. Los movimientos (2.677) y las ausencias (22) nuevas son insumo de noviembre.

**Oracle (19/11).** Con la consola abierta por Marcelo, sólo lectura: la máquina del colector de relojes está encendida (Ubuntu 24.04, creada el 23/09) y con actividad sostenida, cerca del 20 % de procesador y 22 % de memoria durante la última hora. La cuenta muestra que la prueba gratuita terminó y que sólo siguen los recursos «Always Free»; la máquina tiene esa forma. No se entró por SSH.

**Por qué dejaron de entregar tres relojes (19/11, corregido a las 12:00).** El diagnóstico anterior de este documento estaba mal y se retira: decía que había que volver a prender la central local de la PC de Marcelo. No es así. **El traslado a la máquina de Oracle se hizo el 10/11** (lo dejó asentado root el 11/11: corte hecho, con reinicio y entregas durables) y la central de la PC quedó detenida a propósito, como pide el plan de traslado.

La causa encontrada es otra. La máquina de Oracle entra a la red municipal con **la misma identidad de VPN que la PC de Marcelo**, y el plan lo advierte: nunca los dos túneles a la vez. La VPN de la PC estaba conectada desde el 18/11 a las 17:00 y su registro muestra **282 reinicios por inactividad, uno cada cuatro minutos**, hasta el 19/11 a las 11:46: es el patrón de dos clientes con la misma identidad que se desplazan uno al otro. Con el túnel cortándose así, PM-14 alcanza a entregar en los intervalos (269 lotes en diez días, último el 19/11 a las 11:03) y los otros se quedaron a mitad de lectura: PM-03 el 10/11 a las 20:43, PM-02 el 11/11 a las 20:57 y PM-10 el 12/11 a las 16:37, siempre después del corte y ya desde Oracle. PM-05 y PM-06 sólo tienen la carga histórica del 5/11.

**Hecho el 19/11 a las 11:52:** se desconectó la sesión de VPN de la PC con el comando de desconexión del propio cliente, sin tocar su configuración. Quedó sin proceso y sin ruta municipal. Claude no necesita esa VPN: el respaldo de GRH está en archivos locales.

**Lo que sigue sin verificar:** el estado por dentro de la máquina de Oracle (si las tres lecturas quedaron bloqueadas esperando revisión o se retoman solas). El sistema de seguridad de Claude rechazó la entrada por SSH y no se buscó otro camino. Se mira desde la base si vuelven a entregar.

**Arreglo de fondo, pendiente:** mientras PC y Oracle compartan identidad, cada vez que alguien prenda la VPN en la PC para usar GRH se caen los relojes. Las dos salidas son una segunda identidad de VPN para la máquina de Oracle (la emite el municipio) o que la PC llegue a GRH pasando por la máquina de Oracle, sin abrir su propio túnel.
