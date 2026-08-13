# Handoff para Codex — Junín Municipio Enterprise

Usá este contexto como fuente de verdad para alinear `municipio-junin` Enterprise con el trabajo de `municipio-junin-friendly`. No reinicies el análisis, no dupliques bases y no escribas en producción sin verificar primero el estado actual.

## Decisión de arquitectura

- **GRH es el sistema rector laboral municipal.** Debe gobernar personas laborales, legajos, situación contractual, nómina, movimientos, estructura y ausencias.
- **PERSONAS es una fuente auxiliar transversal.** Sólo enriquece identidad, domicilios y territorio. Nunca reemplaza ni sobrescribe empleo o nómina de GRH.
- No unir ambas bases por `IDPERSONA`: sólo coinciden seis IDs y ninguno representa la misma identidad.
- El vínculo correcto usa CUIL válido, DNI como respaldo, nombre normalizado y fecha de nacimiento como evidencia, conservando siempre los IDs originales y una tabla puente versionada.
- **Neon será la única base operativa/canónica compartida.** Friendly y Enterprise deben consumir la misma verdad, con APIs/roles separados; no crear una segunda copia en Supabase.
- **Cloudflare R2 será archivo privado**, destinado a dumps comprimidos, artefactos inmutables, manifiestos y backups verificables. R2 no sustituye las tablas operativas de Neon.
- Prisma es una capa ORM, no una base ni una cuota de almacenamiento.

## Fuentes verificadas

- GRH: 257 tablas, 7 vistas y 6.573.057 filas.
- GRH: 2.349 personas y 2.450 legajos históricos.
- Estado administrativo actual: 882 legajos sin fecha de egreso, correspondientes a 814 personas.
- Fotografía abierta de liquidación agosto 2026: 854 legajos. Diferencia controlada: 28.
- Última liquidación cerrada verificable: julio 2026, 856 legajos con concepto 999.
- Cálculo: 4.363.790 ítems fuente; mart mensual canónico: 214.164 hechos.
- Movimientos: 489.681 filas fuente; 489.459 válidas en rango.
- Ausencias: 31.572.
- PERSONAS: 96.777 personas y 273.314 domicilios.
- Crosswalk reproducido: 1.699 vinculadas, 157 ambiguas y 493 sin coincidencia, total 2.349 (72,3%).
- Hay 24 personas de GRH sin legajo. Deben conservarse con identidad fuente real; no crear placeholders ni descartarlas.

## Nómina y semántica obligatoria

- `histocal.CIER_31 = 1` es evidencia de cierre. Julio 2026 está cerrado; agosto 2026 está abierto/preliquidado.
- No publicar importes de una corrida abierta como oficiales.
- Los conceptos 990–999 se modelan por separado. La suma técnica de `IMPO_31` no es masa salarial, neto ni costo.
- Vista ejecutiva cerrada: bruto = 993 + 994 + 995; retenciones = 996; neto pagable = 999; proxy de costo empleador = bruto + 990.
- Todo KPI monetario es nominal y no comparable entre gestiones sin IPC, paritarias y cambios de escala.
- La diferencia 882/854 es un control operativo contra agosto abierto; no debe presentarse como comparación con julio cerrado.

## Estado técnico al 13 de agosto de 2026

- Repo de integración: `municipio-junin-friendly-integration`.
- Rama Git de trabajo: `codex/grh-personas-integration`. La publicación de código sigue pendiente del commit/deploy único de la fase.
- Proyecto Neon existente: `municipio-junin-friendly-internal` (`noisy-poetry-54471701`).
- Rama Neon aislada de QA: `codex-grh-integration-20260813` (`br-square-glade-aczgtll0`).
- Neon `main` ya contiene y reconcilia 620 corridas, 854 asignaciones de agosto, 214.164 hechos mensuales, 489.459 movimientos y 2.450 controles de legajo.
- La verificación integral de `main` pasó 36/36 gates; julio cerrado es publicable, agosto abierto permanece bloqueado y la brecha 882/854 queda explicada 16/11/1.
- El proyecto está en Neon Launch con cómputo acotado a 0,25–1 CU. Existe una rama temporal previa a promoción con expiración automática y la rama aislada sigue disponible para QA.
- PERSONAS ya fue promovida con 2.349 decisiones: 1.699 matches, 157 ambiguas y 493 sin coincidencia; las 24 personas GRH sin legajo se preservan sin contratos inventados.
- R2 está aprobado como estrategia, pero bucket, credenciales operativas y prueba de restauración todavía deben verificarse. No afirmar que existe un backup remoto hasta demostrar upload + readback/hash.

## Instrucciones para el agente Enterprise

1. Inspeccioná primero Git, variables y conexiones disponibles; nunca pegues ni registres URLs, tokens o contraseñas.
2. Tratá Neon `main` como producción. Para pruebas, creá o reutilizá una rama aislada y verificá que no sea default/protegida.
3. No vuelvas a importar los dumps ni construyas un modelo alternativo. Consumí el esquema canónico cuando la fase quede publicada.
4. Prepará Enterprise como consumidor modular de la misma base: RRHH, estructura, nómina y calidad primero; Hacienda/Tesorería sólo cuando exista una fuente real adicional.
5. No uses `IDPERSONA` entre sistemas, no auto-resuelvas los 157 ambiguos y no expongas personas/domicilios en vistas públicas.
6. Mantené Friendly simple y Enterprise profundo, pero ambos deben compartir definiciones, IDs canónicos, cierres y trazabilidad.
7. Antes de afirmar disponibilidad, exigí: migración idempotente, conteos exactos, conciliación financiera, prueba E2E, backup R2 con SHA-256 y restauración verificada.
8. Coordiná cualquier escritura de esquema/importación con la rama `codex/grh-personas-integration` para evitar procesos simultáneos o doble consumo.

## Resultado esperado

Enterprise debe quedar listo para conectarse a la misma capa canónica de Neon cuando esta fase sea promovida, sin migración paralela ni cifras inventadas. Informá por separado: validado localmente, validado en rama Neon, publicado en `main`, desplegado en Preview y desplegado en Producción.
