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

**El cálculo dice qué dato falta (candidato 7, sin publicar).** Cuando una fórmula pide un dato sin valor, el motor informa qué clave pidió, el servidor dice de qué fuente sale y a cuántas de las personas elegidas les falta, y el panel arma el texto con su propio vocabulario. Ejemplo con el caso del ensayo: «Falta cargar los datos familiares del período (cónyuge): sin valor en 79 de 81 personas elegidas. No se supuso cero. Completá ese dato, aprobalo y volvé a calcular. Clave en las reglas: familia_spouse.» El aviso no lleva datos de personas. Como cambia un archivo del motor, cambia la huella del algoritmo: una captura hecha antes de publicar y todavía sin calcular hay que repetirla. Batería completa: 14.728 pruebas, 0 fallas.

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

Los relojes B, C y D dependían del recolector anterior, que está detenido desde esas fechas; no se reanuda solo. Ocho puntos más no están registrados. Lo que falta es operación y conectividad en sitio (recolector autónomo con llegada a cada reloj por la red municipal o VPN), no desarrollo. El estado de la máquina virtual del recolector no se pudo consultar: la consola pidió contraseña.

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
| Conceptos que GRH liquidó y MuniControl no | 44 (37 personas), 95 (25), 80 (19, asignación familiar), 300 a 309, 602 a 678 y otros: son novedades y descuentos de octubre que nunca se cargaron en MuniControl |
| Aportes y contribuciones (600, 601, 604, 685, 701, 703) | Distintos en 67 o 68 personas, porque la base sobre la que se calculan difiere |

Qué deja esto en claro: el motor, la captura, la verificación en la base y el guardado funcionan de punta a punta. Lo que separa a MuniControl de GRH en octubre es, en este orden: las **novedades y descuentos del mes sin cargar**, los datos por persona sin informar, el básico de 38 personas (a estudiar: proporcionales o categoría) y un redondeo de un centavo en cuatro conceptos.

**Riesgo de rendimiento encontrado.** Verificar y guardar esa corrida de 81 personas llevó unos cinco minutos en la copia (resultado de 17 MB). La función publicada que calcula y guarda no declara su límite de tiempo. Con ese tiempo una corrida de este tamaño puede cortarse antes de guardarse, y un convenio de 292 personas no entra. Hay que medirlo en la base operativa y, según dé, declarar el límite, aligerar la verificación o pasarla a un trabajo en segundo plano.

El patrón es uno solo: las cargas de octubre se aprobaron en bloque con muchos campos «sin informar», y las fórmulas del convenio 1 piden un valor explícito en cada uno, aunque sea cero. El motor avisa de a un dato por vez.

Dos cosas del producto que el ensayo dejó a la vista y todavía no están resueltas:

- `INPUT_MISSING` no dice **qué** dato falta ni **a cuántas personas**. Quien opera ve «Falta una entrada necesaria» y no sabe qué cargar. Hace falta una pantalla de preparación del período que lo liste por fuente antes de calcular.
- Sólo la jornada y la antigüedad tienen carga colectiva con seguimiento; las condiciones salariales y los hechos familiares se cargan con un único comando para muchos contratos, sin archivo ni reanudación.

En la base operativa no se aprobó ni se cargó nada. La migración 245 **quedó instalada el 19/11**, con decisión expresa y respaldo previo, y verificada.

Para calcular octubre del convenio 1 faltan, en este orden: aprobar el programa; cargar y aprobar las cuatro condiciones salariales nuevas; informar la antigüedad de los 5 contratos que la tienen vacía; informar las cantidades familiares de 79 personas y los meses de ajuste prenatal de las 81; informar la antigüedad parcial de las 81; lo que el motor pida después; calcular; comparar contra GRH. Para los otros once convenios falta además llevarles las reglas y escribir las 15 que no existen.

**Respaldo de GRH del 10/11.** No fue entregado todavía.
