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
2. Con sólo el convenio 1, la captura se rechaza con `DECLARED_ADJUSTMENT_REVIEW_REQUIRED`: antes de calcular hay que **cargar y revisar los ajustes mensuales declarados de octubre**.

En la base operativa no se aprobó ni se cambió nada.

Para calcular octubre faltan, en este orden: llevar las reglas a los otros once convenios y escribir las 15 que no existen; aprobar el programa; cargar las novedades fijas y los ajustes mensuales de octubre y revisarlos; correr la liquidación **convenio por convenio**; comparar contra GRH.

**Respaldo de GRH del 10/11.** No fue entregado todavía.
