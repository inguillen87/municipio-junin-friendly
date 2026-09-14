# Continuidad MuniControl — 14/09/2026

## Alcance y baseline

Integrador único: tarea Codex iniciada con el handoff del 14/09. El repositorio rector es `inguillen87/municipio-junin-friendly`. No se creó otra aplicación ni base operativa.

- Carpeta original: `municipio-junin-friendly`, rama `codex/identity-gateway-benchmark`, HEAD `fc03daf9a124b125f75ca67773400ef72c6160ac`. Su enlace local sin seguimiento se preservó.
- `origin/master` revalidado: `06bf2792083f9af0edd6ecc45432e5bbf814ef25`.
- Carpeta de integración: `municipio-junin-friendly-pm10-continuity`, rama `codex/municontrol-pm10-continuity-20260914`, creada desde ese master.
- Se preservaron las otras cuatro carpetas existentes, incluidos los cambios sin confirmar de nómina en `municipio-junin-friendly-civitas-automation`. No se hizo reset, eliminación ni reasignación de ramas existentes.
- No hay un AGENTS.md efectivo en el árbol ni en sus directorios superiores inspeccionados. Rigen las instrucciones entregadas por el usuario. `AGENTS_PROPUESTO.md` del paquete permanece como propuesta.

## Responsabilidades

Integrador: arquitectura, receptor/backend, datos, resguardo y publicación. Subagente de relojes: comparación de candidatos y remitente con acuses. Subagente frontend: consulta continua, exportación coherente, accesibilidad y pruebas de navegador. Subagente de nómina/contabilidad: fuentes exactas de Noelia e inventario de fórmulas. QA se contrasta con código, SQL y resultados; ningún subagente sustituye aprobaciones municipales.

## Fuentes y decisiones

Se leyeron el arranque, estado, plan, matriz de Noelia, arquitectura, PM-10, tarea inicial, UX, QA, seguridad y precedencia del handoff. Los paquetes y sus originales se extrajeron en Descargas fuera de Git y del área de publicación. Los documentos son requisitos/evidencias con fecha, no prueba de ejecución actual.

La candidata `feat/pm10-reception-0592` contiene código legible reutilizable. Las otras candidatas contienen segmentos codificados incompletos o un archivo de referencias; no se ejecutaron ni fusionaron sus workflows. Se recuperaron archivos explícitos, preservando el lector y la protección de ruta de master. La recepción se reforzó con verificación del delta completo, tenant activo y exclusión con revocaciones; el remitente conserva el acuse antes de avanzar y el tablero agrega un corte continuo coherente.

## Evidencia ejecutada en esta tarea

- Git: status, rama, HEAD, remotos, worktrees, fetch y comparación no destructivos.
- `npm ci --ignore-scripts`: 25 paquetes instalados, auditoría de instalación sin vulnerabilidades informadas. No equivale a auditoría integral de seguridad.
- Preflight del handoff: repositorio correcto, baseline verificado, sin acceso al reloj ni datos escritos.
- Vercel: deployment canónico `dpl_Fv5beMqg5qAWhMfpWw3UrNk66w4y`, READY, commit `06bf279…`, confirmado por API autenticada local. El conector MCP no tenía permisos del equipo; la CLI sí.
- Neon: lectura agregada a las 03:47 UTC: una captura, 11.111 filas de origen, 11.091 canónicos; conector suspendido y sin `last_accepted_at`. Estos son datos históricos, no recepción automática.
- El deployment de auditoría sin dominio `dpl_2qYjXRuyUUmC2HhGnTqDQM1uMgkB` terminó READY y confirmó que ambas conexiones productivas usan `br-plain-dust-acpjgebb`; el rol de escritura limitada es `municontrol_actions_runtime_app`. La rama tiene un nombre histórico de QA, pero es operativa. No eliminarla. El diagnóstico no cambió el alias público.
- QA SQL inicial con rollback: compatibilidad HMAC/event-key en todas las filas históricas; replay de las 11.111 sin inflación; datos imposibles observados; partes, hashes y ordinales rechazados cuando no corresponden; rol runtime sin SELECT a datos privados. Baseline intacto tras rollback. La extensión con 056 detectó un alias SQL inválido y se corrigió; su repetición está en curso.
- Aplicación: 2.169 pruebas aprobadas, cero fallos/omitidas en Windows. Contrato remitente/receptor: 10 casos aprobados. Build local generado. Navegador sintético: 17 comprobaciones nuevas, 15 del tablero previo y 22 de recepción, escritorio/móvil, sin errores JS.
- Resguardo: dump completo privado de la rama operativa, 71.673.537 bytes, SHA-256 `6ddefbbf84c7217dc42b9a4e05e8a778dc6c3c6e567121a3e3101780641f1e64`. Restauración local aislada comprobada el 14/09 a las 04:16:55 UTC: mismos conteos y huella de captura. El restore requirió fijar localmente `search_path` de `is_valid_cuil(text)` antes de COPY; no se modificó esa función productiva. Es una copia independiente de Neon en esta PC, no un respaldo externo en otra ubicación.
- Seis IP documentadas respondieron al saludo del protocolo y exigieron CommKey. No se probaron claves ni se descargaron nuevas fichadas; los cinco equipos adicionales siguen sin modelo/serie confirmados. El inventario documental registra 13 puntos, con sus modelos declarados y método de descarga.
- MC-P02A: inventario privado de fórmulas producido desde S11 sin ejecutar SQL ni fórmulas; 2.740 definiciones, 547 auxiliares, 294 conceptos y 94 registros auxiliares de cálculo. Pruebas de inventario y linter: 25 aprobadas. Se preservan diferencias entre documentos y no se consideran reglas salariales autorizadas.

## Estado actual y siguiente acción

MC-H00 cerrado en alcance local. MC-H02: comparación y recuperación realizadas. MC-H01: conexión operativa comprobada y copia restaurada; falta cerrar publicación verificable. MC-C01/02/03 implementados, en validación final. No se aplicó migración persistente en Neon ni se activó un conector. No se modificó nómina.

Siguiente acción: terminar SQL056 con contrato JS real, exclusividad multiproceso y conflictos concurrentes en la copia restaurada; cerrar hashes, CI Linux/Windows y publicación reversible. La prueba física MC-C04 necesita host municipal permanente y CommKey por canal privado. La computadora identificada es Marcelo y no tiene el colector instalado. No se comprobó una fichada con la PC personal apagada.

## Límite de aceptación

Código, pruebas sintéticas, SQL real aislado, publicación, sesión municipal y prueba física se registran por separado. Sueldos, firmas, pagos y cierres requieren su autoridad específica. Un reloj dado de alta o un refresco de pantalla no acredita autonomía.
