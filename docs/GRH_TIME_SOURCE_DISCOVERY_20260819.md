# Descubrimiento de fuentes temporales GRH — snapshot 2026-08-19

## Veredicto

El backup municipal real **sí contiene** el modelo y datos históricos del circuito de control horario. La formulación anterior “no hay fuentes” era incorrecta. La formulación verificable es:

> Las fuentes GRH de turnos, calendarios esperados, fichadas, feriados y prenovedades existen en el snapshot; todavía no están homologadas como fuentes vigentes para operar 2026 ni conectadas en tiempo real.

El dump es una fuente primaria útil para construir el modelo canónico y la migración histórica. No demuestra por sí solo cuáles reglas siguen vigentes, qué relojes están activos ni cómo obtener nuevas marcaciones.

## Identidad y límites del artefacto

| Propiedad | Evidencia |
|---|---|
| Archivo | `grh_junin.backup_2026081915_plataforma.sql.gz` |
| Huella SHA-256 | `BCED0B174AAB977B085FC977723F7EDD8FB9E473ADCFBE237070E8ECEF982AA7` |
| Motor fuente | MariaDB 10.3; dump lógico MySQL, no PostgreSQL |
| Base declarada | `grh_junin` |
| Tamaño comprimido | 44.634.613 bytes |
| Tamaño SQL lógico | 775.106.620 bytes |
| Tablas | 257 |
| Columnas / filas | 2.980 / 6.586.360 |
| Relaciones FK | 342 constraints; 252 relaciones lógicas únicas |
| Tablas vacías | 110 (42,8 %) |
| Corte del dump | 19 de agosto de 2026 |

El análisis se hizo por streaming. No se restauró el dump, no se conectó a Producción, no se copiaron filas al repositorio y no se emitieron nombres, documentos, correos, teléfonos, domicilios ni importes individuales.

Los datos personales sí están autorizados para la operación municipal dentro del plano privado. El límite aplicado es de circulación, no de utilidad: la plataforma puede gestionar y analizar persona, legajo, dependencia, asistencia y haberes cuando el tenant, la finalidad, el rol, la capability y el alcance estén vigentes; esos valores no se copian a Git, fixtures, logs, reportes agregados ni respuestas públicas. El manifiesto canónico conserva esta clasificación y exige staging, procedencia, maker-checker y cuarentena antes de promover.

## Grafo horario real descubierto

| Fuente GRH | Filas | Cobertura observada | Función candidata en MuniControl |
|---|---:|---|---|
| `turnos` | 30 | catálogo | versión de turno semanal |
| `horarios` | 32 | catálogo | franja de entrada/salida |
| `tolerancias` | 9 | catálogo | regla parametrizada de tolerancia |
| `legaturn` | 574 | 1970–2012 | asignación temporal legajo–turno–lugar |
| `esperanza` | 163.634 | 2011-01-01–2012-02-10 | jornada/calendario esperado por persona |
| `fichadas` | 958 | 2012-01-03–2012-01-11 | marcación cruda o autorizada |
| `locales` | 3 | catálogo | lugar de trabajo/marcación |
| `feriado` | 55 | 2000-07-25–2008-03-24 | día de calendario no laborable |
| `prenove` | 873 | 2012-01-02–2012-01-11 | prenovedad calculada para revisión/liquidación |
| `cptosreloj` | 7 | catálogo | mapeo reloj–concepto de nómina |
| `ausencia` | 31.622 | histórico administrativo | evento de ausencia |
| `licencia` | 3.448 | histórico administrativo | período de licencia |

Relaciones declaradas por la propia base:

```text
turnos ──> horarios ──> tolerancias
   │
   ├──> legaturn ──> legajo
   │        └──────> locales
   │
   └──> esperanza ──> legajo
             └─────> fichadas

fichadas / prenove ──> motiauto
prenove ─────────────> concepto
ausencia ────────────> motause / concepto
```

Esto coincide con el viaje mostrado en la reunión de e-Sueldos: turno → asignación → lugar → calendario esperado (“Esperanza”) → marcación → prenovedad → liquidación.

El contraste temporal evita otra conclusión equivocada: **el backup es actual, pero no todos sus módulos lo son**. Haberes sí llega a 2026 (`calculo`: 4.373.145 filas, 240.577 de 2026; `legamov`: 492.127, 29.866 de 2026; `liquidacionlog`: 122 registros de junio de 2026). El reloj/calendario, en cambio, quedó mayormente histórico. Esto indica módulos con distinta vigencia dentro del mismo origen y obliga a certificar cobertura por tabla/dominio, no por antigüedad del archivo.

## Calidad y vigencia

- `esperanza` reúne 163.634 jornadas para 570 legajos, pero termina en febrero de 2012.
- El 100 % de esas jornadas enlaza con legajo y turno existentes; 99,544 % coincide con el turno asignado y 85,317 % cae dentro del intervalo efectivo de `legaturn`. Es una base valiosa para casos dorados históricos, no una autorización para recalcularla silenciosamente.
- `fichadas` contiene 958 registros para 84 legajos; sólo 11 filas conservan `IDESPERANZA`. Los 7 identificadores distintos informados existen en `esperanza`, por lo que no hay referencias huérfanas dentro de ese subconjunto. Las otras 947 fichadas requieren reconciliación por persona, fecha y hora, nunca un join inventado.
- 874 fichadas (91,23 %) pueden asociarse por legajo y fecha con una jornada esperada; esa coincidencia debe presentarse para revisión y no persistirse automáticamente como verdad.
- `legaturn` contiene 574 asignaciones para 573 legajos. Su última fecha observada es enero de 2012; 566 filas quedaron abiertas sin cierre, lo cual no alcanza para declararlas vigentes catorce años después.
- El maestro `legajo` tiene 2.450 filas. `TURN_12` aparece informado en 892: 351 resuelven contra 16 códigos del catálogo `turnos`; 541 no resuelven y 1.558 están vacíos. Es un control de calidad prioritario, no una asignación operativa lista para usar.
- Los 55 feriados terminan en 2008; no pueden formar un calendario laboral 2026.
- `prenove` contiene 873 resultados históricos, pero el motivo está vacío en las 873 filas. Antes de migrarlos hay que separar resultado calculado, causa, decisión humana y concepto de nómina.
- Hay 6 ausencias y 4 licencias con referencia a legajos inexistentes, y 47 asignaciones de perfil sin perfil padre.
- Existen fechas centinela o erróneas con años `0007`, `0008`, `0205`, `1111`, `1897` y `2223`; deben entrar a cuarentena de migración.
- `relacptos` y `noveauto` están vacías: el puente automático reloj → concepto/haberes está modelado, pero no aparece operativo en este snapshot.
- El dump mezcla `latin1` y `utf8`; la migración debe probar codificación y acentos de forma explícita.
- Existen tablas históricas alternativas vacías (`turno`, `fichada`, `espera`, `noveauto`); no deben mezclarse automáticamente con las tablas activas del módulo más nuevo.
- El dump incluye auditoría mediante triggers en parte del núcleo GRH, pero no prueba una bitácora inmutable completa para `fichadas` y `esperanza`.

## Mapeo 010B propuesto

1. Registrar este archivo como snapshot `GRH/MariaDB`, con huella, corte, cobertura y estado `discovered`.
2. Crear staging inmutable para los catálogos y hechos horarios; conservar las claves `(CODI_01, LEGA_12)` y cada identificador fuente.
3. Mapear `turnos`, `horarios` y `tolerancias` a versiones con vigencia, sin asumir que una fila histórica sigue activa.
4. Mapear `legaturn` y `legajo.TURN_12` por separado y producir una conciliación de cobertura/conflictos antes de elegir precedencia.
5. Importar `esperanza` como evidencia histórica de jornada planificada y `fichadas` como evidencia histórica de marcación; no recalcular presentes, tardanzas ni extras hasta homologar reglas.
6. Versionar calendario/feriados municipales y cargar 2026 únicamente desde una fuente aprobada.
7. Modelar `prenove` como salida explicable: entradas, versión de regla, minutos, concepto propuesto, estado y aprobación.
8. Construir el gateway de relojes después de relevar marca, modelo, protocolo, red y formato de exportación. La carga manual queda como contingencia gobernada, con idempotencia, vista previa, cuarentena y reconciliación.

## Evidencia que todavía debe aportar el municipio

El pedido correcto ya no es “manden una base”. Es acotado:

- qué códigos de `turnos` y `horarios` siguen vigentes;
- regla municipal vigente de tolerancias, presentismo, extras, nocturnidad, feriados y excepciones;
- responsables y circuito de aprobación;
- marca, modelo, protocolo y conectividad de cada reloj;
- archivo o API de marcaciones actuales y su zona horaria;
- calendario laboral/feriados vigente;
- casos dorados anonimizados para comparar esperado, fichado, novedad y resultado aprobado.

Hasta responder eso, el backup permite construir y probar la arquitectura y la migración histórica, pero no justificar cálculos productivos 2026.
