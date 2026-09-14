# Revisión local de respaldos GRH — MC-D01A

Antes de incorporar otro corte, el operador puede abrir en Integración el informe agregado de dos respaldos. El SQL permanece en el equipo autorizado; el navegador sólo lee un JSON de hasta 256 KiB y no lo envía al servidor. Esta entrega compara fuentes y protege la repetición exacta del importador existente. No incorpora septiembre ni completa la migración entre cortes.

## Generación y alcance

`scripts/compare_grh_snapshots.py` recibe rutas absolutas `--baseline`, `--candidate`, `--output` y las huellas esperadas `--baseline-sha256`, `--candidate-sha256`. Admite `.sql` o `.sql.gz` del formato mysqldump conocido, fuente declarada `grh_junin` y corte final obligatorio. La salida debe quedar fuera de cualquier repositorio Git, incluidos worktrees y destinos resueltos mediante enlaces. No reemplaza un informe distinto; una repetición exactamente igual conserva el archivo existente. `--generated-at` fija el instante UTC para reproducción determinista.

Se comparan persona, legajo, familia, vinculo, histocal, histolegajo y organiza por sus claves primarias declaradas. Se verifican columnas, definiciones, índices/restricciones presentes en esos bloques y opciones de tabla; sólo se excluye el contador AUTO_INCREMENT de la comparación de opciones. Las siete tablas deben tener estructuras coincidentes. No constituye una certificación de todo el esquema, vistas, procedimientos, triggers ni las demás tablas.

Se distinguen SQL NULL, cadena vacía, espacios y valores decodificados. La comparación informa registros nuevos, ausentes, sin cambios y modificados; identidad, estado y fechas son subconjuntos superpuestos de los modificados. Las categorías son campos crudos de la fuente, no reglas de elegibilidad ni identidades canónicas certificadas. Cambiar una clave se informa como ausencia y alta: un historial cuyas claves se regeneran exige correspondencia adicional, no una baja administrativa.

Límites: 2 GiB físicos y descomprimidos, razón de expansión máxima 200, línea de hasta 2 MiB y 100.000 filas por tabla. Se rechazan claves nulas/duplicadas, ancho incorrecto, INSERT incompleto o no admitido, cambios durante la lectura, SHA diferente, corte ausente/invertido y estructura incompatible. Los cuerpos de triggers versionados se reconocen y excluyen sin ejecutar ni interpretar sus instrucciones. No se ejecuta SQL ni se abre una conexión de base de datos. Los errores externos usan códigos fijos; no imprimen nombres, claves de fila, rutas privadas ni SQL.

El informe `grh-backup-review.v1` contiene únicamente versiones, fechas declaradas, tamaños, huellas, conteos y códigos de revisión. Nunca incluye ejemplos de personas ni filas fuente. `readyForPromotion`, `databaseWrites`, `canonicalCompared`, `payrollFactsCompared` y `operationalEvidenceCompared` permanecen false.

## Revisión en pantalla

En `integracion-datos.html#revisar-respaldo`, elegir el informe y pulsar **Abrir revisión local**. La pantalla conserva la navegación y permisos existentes; requiere `lineage.read`, revalidado con una consulta de sesión antes de leer el archivo. No concede capacidades nuevas y funciona independientemente de la consulta de calidad, que conserva su propio permiso.

Se muestran ambos cortes con zona horaria desconocida, diferencias por tabla y observaciones. Las huellas se despliegan como evidencia local: el servidor no autentica el JSON ni confirma que la base comparada siga siendo la operativa. Un informe editado que conserve el contrato sigue siendo una declaración local. La pantalla no ofrece incorporación ni aprobación de fuentes.

Errores de red/lectura conservan la selección; revocación de acceso, salida de página y cambio de visibilidad cancelan resultados pendientes. Texto de errores inesperados del servidor o sistema no se refleja en pantalla. Formularios, avisos, foco, navegación por teclado y tabla desplazable fueron comprobados en escritorio y móvil.

## Repetición segura del importador existente

Antes, repetir la misma fuente podía crear otro `data_import_runs` y reemplazar las cinco tablas de staging, aunque `source_import_batch` conservara el puntero al lote anterior. Esa divergencia puede romper las consultas familiares asociadas al corte vigente.

El importador ahora inspecciona la fuente bajo su mismo advisory lock y una transacción REPEATABLE READ READ ONLY. Conserva intentos históricos compatibles, selecciona el único lote presente en las cinco tablas y verifica procedencia, manifiesto, perfil, conteos, indicadores de calidad y contenido proyectado con comparación SQL tipada en ambos sentidos. Comprueba también el puntero de `source_import_batch` cuando existe para esa fuente.

Una coincidencia exacta devuelve `noop`, `writesPerformed:false` y `scope:curated_import_only`, sin INSERT ni TRUNCATE. Lotes mezclados, contenido diferente, procedencia ambigua o una inspección que no puede cerrarse se rechazan antes de iniciar escrituras. No se relajaron el perfil ni los conteos estrictos del importador de agosto.

Esto no vuelve atómica toda la promoción: staging, promoción canónica y carga core siguen siendo fases separadas. Tampoco homologa cambios de persona ni certifica certificados escolares frente a una fuente diferente. La consulta histórica protegida se incorporó posteriormente en SQL059; su alcance está en `docs/ACTION_SOURCE_HISTORY.md`. La actualización de septiembre sigue bloqueada hasta verificar las dependencias restantes y su conservación.

## Protección frente a un respaldo diferente

Una huella nueva antes devolvía directamente permiso para importar. Ahora ese camino comprueba, dentro de la misma inspección de sólo lectura y bajo el lock existente, que no haya historial de importación ni filas en ninguna de las cinco tablas curadas. Si el esquema canónico existe, exige ambas tablas esperadas y ausencia de todo lote o contrato GRH, sin limitarse a empresa, base de origen, estado activo o huella entrante. Un esquema parcial, error de consulta o resultado incompleto bloquea el camino.

Con datos existentes se devuelve `RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED` antes de insertar un intento o ejecutar TRUNCATE; tampoco se agrega un intento fallido. El mensaje informa que el respaldo actual se conserva y que falta coordinar fuentes, contratos y nómina. La repetición exacta conserva su verificación completa y su NOOP sin escrituras. La pantalla de revisión sigue sin ofrecer incorporación ni aprobación de fuentes.

Sólo se conserva el camino de primera inicialización de un almacén vacío. Esta guarda no coordina procesos que usan otros locks, ni acredita una inicialización concurrente segura. El reemplazo de un almacén ya ocupado queda bloqueado; el diseño de una publicación transaccional completa sigue pendiente. No hay una opción para omitir esta comprobación.

## Evidencia y reversión

Los ensayos privados compararon dos pares de fuentes reales y abrieron ambos informes con el modelo de pantalla y sesión sintética local; no se enviaron al servidor. La prueba real del importador se ejecutó exclusivamente en la restauración PostgreSQL existente: dos NOOP, conflictos de manifiesto, nombre/fecha/documento familiar, puntero canónico y lote mezclado. Al finalizar se conservaron conteos y huellas de las 118 tablas públicas. Las corrupciones controladas para probar rechazos se aplicaron y deshicieron sólo en esa copia local; no se alteró Neon.

La prueba de conservación incluye el contenido que existe en la copia; no acredita documentos que todavía no fueron cargados. Los escenarios de SQL escolares anteriores cubren fixtures específicas por separado. Pruebas y capturas públicas contienen sólo datos sintéticos; informes agregados reales, resguardos y logs se conservan privados.

No hay migración de esquema ni actualización productiva de datos en este incremento. Reversión técnica al deployment `dpl_HTpfpEzp4Zc3FTqTiedv2jJBkW8N`, SHA `4ec13eb0c0fe6647ead8bc7c729f6ef2f1b13c20`, conservando fuentes y evidencia. Publicación técnica, sesión municipal, aceptación contable y prueba física del reloj se registran por separado.
