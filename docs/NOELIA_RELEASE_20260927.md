# Cierre técnico de Noelia · 27/09/2026

Base: master 5e6998442d6a697c63c310c532bef356dfe89df8 y PR #47 c4a07ca2. Se reutiliza el worktree existente, conservando los cambios de los demás módulos en sus carpetas.

## Cambios

- Hijos: Agregar hijo/a siempre visible, con motivo accesible del bloqueo. Errores de carga o permiso dejan de conservar el mensaje de verificación inicial. Actualizar registro recupera el acceso; borradores y reintentos conservan sus controles de identidad e idempotencia.
- AMARU 638: el TXT debe contener todas las versiones aprobadas y vigentes del concepto 638 en el snapshot. Una respuesta truncada, aunque declare un total coherente, se rechaza. Si cambió la consulta o falla la validación se retira el resultado y se exige actualizar antes de exportar otra vez.
- Módulo 10: selección del año de liquidación dentro del catálogo disponible. Cambiar año retira corrida y cotejo anterior. Pantalla y PDF/CSV señalan cuando la emisión del PDF y la liquidación son de años distintos. La emisión no se convierte en ejercicio presupuestario.
- CI: pruebas de familia en pull requests; cobertura del cotejo presupuestario en sus rutas; regresión SQL del conflicto operativo 107 con identidades sintéticas y rollback en PostgreSQL 17/18; verificación del encoder 638 y su endpoint publicado.

## Acceso comprobado en Neon

Consulta de sólo lectura al proyecto operativo y rama ya configurados: Noelia tiene membresía activa MUNICIPIO_ADMIN_OPERATIVO, 89 capacidades, workforce.employee.read y employee.record.propose presentes, cero denegaciones explícitas. tenant_iam_assert_no_sod_conflict terminó sin excepción. employee_family_context_v2 y payroll_fixed_registry_junin638_v1 existen, son ejecutables por el rol runtime existente y no por PUBLIC. No se cambiaron credenciales, MFA ni membresías.

No hay sesión personal de Noelia disponible para esta verificación. Se comprobó su autorización efectiva desde el backend, sin modificar su contraseña ni segundo factor. No se realizó un ingreso en su nombre ni una escritura municipal de ensayo.

## Límites de cierre

- La antigüedad en años y meses ya está implementada al corte de la fuente; no sustituye antigüedad salarial reconocida.
- Módulo 10 controla ocupante documental contra presencia del legajo en corrida. El histórico recibido sí contiene cargo y estructura, también presentes en snapshots de Neon. Falta vincularlos a la misma fuente y corrida del catálogo para extender el cotejo, además de acreditar la fuente anual aprobada por cargo/vigencia. El artículo 7 agregado de 2026 no resuelve esa evidencia anual.
- AMARU conserva Formato Junin: DNI posición 5 longitud 8, importe posición 44 longitud 11, 55 bytes; falta homologación del receptor con un archivo aceptado si está disponible.
- Pruebas sintéticas, publicación técnica, sesión real y aceptación municipal se informan por separado.

El analizador 638 valida DNI e importe con el mismo formato emitido por el exportador. CSV/Excel aplican el filtro de pantalla; el TXT incluye todas las 638 aprobadas vigentes del período y lo explica antes de descargar.

## Validación y publicación

Construcción completa: 5.391 pruebas aprobadas, cero fallos y dos omitidas. Familia: 51 controles de navegador; familia nativa: 18; antigüedad: 10; cotejo por año: 12; Centro de reportes: 6. APIs y documentos sintéticos, sin escritura municipal. La verificación inicial con --published detectó correctamente el asset familiar anterior en producción: no se contó como aprobado. Publicación y recorridos contra assets servidos se comprobarán después de integrar.


TXT 638 y analizador: 45 pruebas focales aprobadas; 37 recorridos de navegador, incluidos respuesta incompleta, snapshot cambiado, errores de DNI/importe y recuperación de dos registros completos (112 bytes con CRLF) aunque la búsqueda muestre uno. Cero errores de navegador.

## Publicación comprobada

PR #47 integrado en master 2731baf59baf11620223112d5ef09c8b9d19e4ba. Vercel dpl_HDYDiibBiuNHgNYrJWA4tkVjAygN, target production, READY y alias público resuelto al mismo SHA. Los 13 workflows de master terminaron aprobados. Familias: ocho assets idénticos y 13 rechazos anónimos 401 más una versión inválida 400. Novedades fijas: once assets idénticos y diez rechazos anónimos 401, incluido junin638. Cotejo: nueve assets idénticos y ambos lectores anónimos 401.

Navegador sobre assets publicados: antigüedad 10 controles y novedades fijas/TXT638 37, todos aprobados con APIs sintéticas. La sesión personal de Noelia y homologación por AMARU no se dan por realizadas. La lectura del backend comparó permisos efectivos: frente a Marcelo, Noelia sólo carece de las dos capacidades técnicas de conectores e ingesta de relojes, ajenas a estos flujos.
