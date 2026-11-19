# Diseño · carga conjunta de novedades fijas nuevas desde una planilla

Estado: diseño escrito el 19/11/2026, sin implementar. Sólo toca la pantalla; no cambia la API, las migraciones ni las funciones de base.

## Problema

En «Novedades» → pestaña «Novedades fijas» (`assets/payroll-fixed-novelties.js`, modelo en `assets/payroll-fixed-novelties-model.js`, grupos en `assets/payroll-fixed-groups-model.js`) una novedad fija nueva se propone de a una: «Registrar novedad fija» → verificar legajo → completar campos → «Revisar propuesta» → «Guardar propuesta para revisión». Ya existen acciones conjuntas para anular, corregir y revisar registros existentes, pero no para dar de alta varios nuevos. Para llevar un convenio completo a la liquidación propia hay que cargar decenas o cientos (GRH tiene miles en su tabla de fijos), y hoy son decenas de formularios.

## Qué hay que construir

Una carga conjunta de altas, sólo para quien tiene `payroll.fixed.prepare` (la misma condición que hoy muestra «Registrar novedad fija»):

1. Un botón nuevo junto a «Registrar novedad fija», por ejemplo «Cargar varias desde una planilla», que abre un editor (mismo patrón `editorShell`, un solo editor a la vez, mismas reglas de `busy`/`attempt`/`live()`).
2. Un área para pegar filas copiadas de Excel (separadas por tabulación) o CSV con `;` o `,`. Columnas, en este orden, con encabezado opcional que se detecta y se saltea: Legajo · Concepto · Unidades · Importe · Fecha de alta · Vencimiento · Instrumento. Unidades e importe aceptan coma decimal y pueden venir vacíos (pero no los dos: «un dato ausente no equivale a cero», igual que `fixedForm`). Fechas en `aaaa-mm-dd` o `dd/mm/aaaa`. El tipo de liquidación es uno para toda la carga (selector, por defecto mensual). El instrumento puede venir por fila o, si la columna falta o está vacía, tomarse de un campo común «Instrumento que respalda las novedades». El motivo de la propuesta es uno solo para todo el conjunto. No se admite modo forzado en la carga conjunta: una fila que lo necesite se carga con el formulario individual (decilo en la pantalla).
3. Validación pura en un módulo nuevo (por ejemplo `assets/payroll-fixed-bulk-model.js`), sin DOM, que reutilice `fixedForm`, `fixedText` y las mismas reglas de código de concepto y de centro de costo que el formulario individual. Devuelve por fila: valores normalizados o el mensaje de error con el número de fila. Tope: 200 filas por carga. Rechaza filas repetidas dentro de la planilla (mismo legajo + concepto + tipo).
4. Botón «Verificar legajos y revisar»: por cada legajo distinto consulta la persona con el mismo pedido que usa «Verificar legajo» (`request({resource:'employee',legajo})` → `fixedEmployee`), en serie. Con el registro ya consultado en pantalla, marca como «ya existe» toda fila cuyo contrato + concepto + tipo coincide con un registro del listado que no esté anulado (aprobado o con propuesta pendiente); esas filas no se envían y se muestran aparte. Muestra una vista previa con una fila por novedad: legajo, nombre devuelto por la consulta, concepto, unidades, importe, alta, vencimiento, instrumento y estado (lista para guardar / ya existe / error con su mensaje). Si alguna fila tiene error de formato o de legajo no se habilita guardar: se corrige la planilla y se vuelve a verificar (no se omiten filas con error en silencio).
5. Casilla de confirmación («Revisé las N novedades…») y botón «Guardar N propuestas para revisión». Al guardar envía una propuesta por fila por el mismo camino que la propuesta individual (mismo endpoint, mismo cuerpo `{command:'propose',payload}` que arma el editor individual, una `Idempotency-Key` propia por fila generada una sola vez al preparar el envío y reutilizada en los reintentos), en serie. Si una falla, se detiene, deja claro cuáles quedaron guardadas (N de M), cuál falló y por qué, y permite reintentar las pendientes sin duplicar las ya guardadas. Al terminar refresca el registro. Cada propuesta queda pendiente de otra persona, igual que la individual; no aprueba nada, no calcula ni modifica GRH. Dejá esos textos en la pantalla con el mismo tono que el resto.
6. La pantalla se suspende cuando la pestaña queda oculta (`live()`); la carga conjunta tiene que respetarlo igual que el resto: si se interrumpe a mitad, al volver muestra cuántas quedaron guardadas y permite continuar.

## Restricciones

- No cambies la API, las migraciones ni las funciones de base. Sólo front (assets), el listado explícito de assets de `scripts/build-friendly.mjs` si agregás un archivo, y pruebas.
- Respetá las pruebas guardianas del repositorio (textos en singular/plural con el helper existente, modelos puros sin redondeos, nada de `innerHTML` con datos, etc.). Si una prueba guardiana fija el contenido de `assets/payroll-fixed-novelties.js`, actualizala sólo en lo que este cambio justifica y explicalo en el commit.
- Textos en español rioplatense, llanos, como los de la pantalla actual. Sin emojis.
- Pruebas nuevas: unitarias del modelo (encabezado, separadores, coma decimal, fechas en los dos formatos, vacíos, repetidas, tope, error con número de fila, instrumento común) y, si hay un patrón de pruebas de panel para novedades fijas, las del flujo (verificar, ya existe, guardar en serie, falla intermedia y reintento sin duplicar). Datos de prueba sintéticos.
- Corré las pruebas que toquen novedades fijas y las guardianas relacionadas: `node --experimental-vm-modules --test tests/<archivos>`. No hace falta la suite completa (tarda más de media hora), pero decí cuáles corriste y el resultado exacto.

## Por qué importa

La cuenta del titular no prepara novedades fijas: sólo las aprueba. Las prepara una cuenta de liquidación, hoy de a una. Para octubre del convenio 1 faltan 24 (conceptos 80, 56 y 57); para toda la planta son cientos.
