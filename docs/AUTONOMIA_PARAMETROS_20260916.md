# Parámetros operativos · primer circuito propio de autonomía

## Objetivo y alcance de este incremento
La pestaña Parámetros deja de abrir el laboratorio técnico como tarea principal. El nuevo componente React utiliza las funciones de negocio de Neon para preparar, guardar, enviar, aprobar, rechazar y cancelar propuestas de los auxiliares documentados por Noelia. No copia una liquidación anterior y no requiere cargar un archivo GRH para preparar estos valores.

Fuentes revisadas: módulo 6 original, páginas 1–6; matriz `MATRIZ_ACEPTACION_NOELIA.md`; contrato SQL041 instalado en la rama operativa. Las reglas 88/6-D, 90/3-A y 88/13-I × 1,50 se conservan sin introducir importes supuestos. Se ingresa el básico de la escala y su referencia; no se precargan importes del respaldo como vigentes.

## Operación entregada
- Formulario de auxiliar, básico en pesos, convenios admitidos, mes propuesto, escala/resolución y criterio de redondeo. Vista previa exacta en centavos; falta de importe no se convierte en cero.
- API Node `internal-payroll-parameters`: membresía gestionada, sesión certificada, rol SQL limitado existente, origen de escritura comprobado, parámetros SQL enlazados y contratos cerrados. No concede capacidades ni cambia la autenticación.
- Persistencia mediante SQL041: borrador, envío, revisión por otra persona, rechazo y cancelación. Las acciones disponibles se reconsultan después de operar. Versión esperada e idempotencia evitan sobrescrituras y duplicados; una respuesta perdida exige reconciliar o reenviar la misma clave.
- Consulta por estado/período y paginación. Detalle, trazabilidad y descargas Excel/PDF/CSV desde el registro reconsultado. Si cambió su versión, se detiene la descarga para revisión. Los caracteres no admitidos por el PDF no se sustituyen silenciosamente.
- Carga del componente sólo al entrar en Parámetros. Conservar el formulario al cambiar de pestaña. Borrar la vista privada al perder el acceso. El laboratorio anterior queda plegado como herramienta avanzada.
- Menú lateral sincronizado también con `taskchange`, incluyendo las pestañas que usan `history.pushState`.

## Qué NO significa aprobación
SQL041 administra propuestas: `currentCatalogVerified`, `payrollCalculated`, `payrollPosted` y `grhMutation` permanecen falsos. Aprobar no publica una escala efectiva ni liquida salarios. Se verifican estos flags y los importes antes de mostrar o exportar. Este incremento no altera el significado de un comando existente para ejecutar una acción financiera adicional.

## Secuencia funcional para completar la autonomía
1. Publicar versiones efectivas del catálogo propio: maestro de conceptos, fórmulas por convenio, escalas, auxiliares y vigencias. Separar propuesta, aprobación y publicación; no reemplazar valores históricos.
2. Conectar novedades individuales, masivas y fijas, actos administrativos y asistencia validada a una población congelada del período. Los PM actuales se conservan; fichada no equivale automáticamente a concepto pagable.
3. Motor nativo del período: importes decimales exactos, dependencias y acumuladores, trazabilidad por concepto/legajo, reglas especiales y ausencia explícita de evidencia. Calcular desde entradas, nunca desde el importe liquidado en el respaldo.
4. Preliquidar y comparar con períodos de referencia por concepto/persona; después confirmar y cerrar mediante permisos separados, dejando histórico inmutable e imputación contable.
5. Emitir recibos y archivos bancarios, fiscales, ART, OSEP y mutuales desde la misma corrida cerrada con sus formatos homologados. Los insumos de terceros se reciben cuando realmente son externos, no se reconstruye en Excel información ya conservada.

El criterio de autonomía es producir un mes nuevo de principio a fin sin importar su liquidación hecha por GRH. El presente sprint cierra sólo el circuito operativo de propuestas de auxiliares y sus salidas administrativas.

## Evidencia y límites de pruebas
Pruebas del modelo, API, fachada SQL, origen, membresía, claves, versiones, redondeo y exportación en `tests/payroll-parameters.test.js`. Recorrido sobre el build completo en `scripts/verify-payroll-parameters-browser.mjs`. El recorrido publicado usa recursos estáticos reales con APIs sintéticas interceptadas: jamás envía las altas o aprobaciones de prueba a Neon.

Verificación productiva independiente de loader, bundle, licencia, menú y navegación, más denegación anónima real del endpoint. Una prueba visual sintética no acredita una sesión municipal real ni la aceptación administrativa. No se adjuntan los PDF de Noelia, respaldos, IP, datos nominales ni muestras bancarias al repositorio.

## Entrega y reversión
Lote agrupado, sin dependencias nuevas. Se reutiliza el runner/build/navegador del workflow de Noelia. No hay migraciones ni actualizaciones de datos por este despliegue. Revertir sólo el commit del incremento; las propuestas creadas por los operadores se conservan en Neon para auditoría. Base de producción: `14d21542630e504571b5b41be6dacc7b272ac64a`.
