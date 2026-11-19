# Estado real y pendientes · 19/11/2026

Este documento reemplaza, como punto de partida, a las notas de entrega de noviembre que terminan en «no se ejecutó SQL» o «Codex instala»: varias quedaron atrasadas. Lo que sigue se verificó contra la base operativa (consultas de sólo lectura por catálogo) y contra el sitio publicado, no contra otros documentos.

## Qué está publicado e instalado

| Qué | Estado verificado |
|---|---|
| Sitio | `municontrol.com` sirve `651fbfb7` (candidato 4): PDF con paginado y pies documentales, pantallas de la ronda 2 (14 pantallas, 320/375/768/1366 px), panel «MuniControl contra GRH». |
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

## Qué falta para usar la asistencia por áreas

La instalación deja la base preparada, pero hoy nadie puede obtener un resultado por persona. Faltan tres piezas, en este orden:

1. **Capacidades.** Las cuatro `attendance.area.*` existen en el catálogo; hay que asignarlas a las membresías que correspondan.
2. **Alcance de área por cuenta.** `attendance_area_scope` está vacía y no existe función ni pantalla que la escriba. Hace falta una fachada gobernada (quién concede, con qué referencia de autorización) y su pantalla en Administración.
3. **Vigencia de área de los contratos adoptados.** `attendance_area_history_v1` responde `blocked / AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED` para los 851 contratos propios: todos vienen de la adopción desde GRH. `docs/ATTENDANCE_AREA_HISTORY_20261116.md` exige «una fuente de vigencia diaria explícita con otro contrato versionado» y ese diseño no existe.

Propuesta para el punto 3 (a decidir por el municipio): una **declaración municipal de vigencia por corte**. Una persona prepara y otra aprueba que, desde una fecha declarada, cada contrato adoptado activo pertenece al área que figura en su legajo. La declaración es inmutable, lleva referencia documental y sella la lista de contratos y áreas. No infiere nada hacia atrás: los días anteriores a la fecha declarada siguen sin acreditar. Las rectificaciones posteriores que cambien de área siguen necesitando su propia fecha efectiva.

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
