# Controles externos · análisis recuperable de TXT/CSV y 638 AMARU

## Alcance del sprint
Base revisada: `55889ce397b052202198f6512375c283dfde1b2d` (PR #52). Se cierra el recorrido de **Nómina → Migración y controles externos → Analizar un archivo mensual sin importarlo**. No se cambia el exportador 638, el cálculo salarial ni la fuente histórica del Módulo 10. El trabajo paralelo de recibos del Módulo 9 permanece intacto.

## Recorrido terminado
- Se puede cancelar la espera y limpiar explícitamente archivo y resultado. La cancelación no afirma detener instantáneamente al servidor: el endpoint existente sólo analiza, sin importar.
- Un fallo temporal, una desconexión o el plazo agotado conserva la selección para un reintento manual. No se implementa reenvío automático en el controlador.
- Cambiar archivo o formato invalida la consulta pendiente y retira todos los valores previos. Una respuesta tardía no puede borrar la selección nueva ni restaurar otro resultado.
- La respuesta se contrasta con la definición y cantidad de bytes de la solicitud. Una respuesta 200 no basta si contiene otro formato, otro tamaño, campos personales o conteos incoherentes.
- El vencimiento de sesión limpia la selección y conduce al acceso. La denegación 403 limpia y bloquea el formulario sin presentarla como sesión vencida. Un evento de cambio de contexto retira cualquier revisión en curso; el primer evento de carga sin datos no inventa una pérdida de trabajo.
- Ocultar, abandonar o desmontar la pantalla retira la selección. El regreso mediante caché de navegación monta un controlador limpio, sin duplicar listeners ni envíos.

## 638 AMARU y presentación
El formato conserva 55 bytes por registro, DNI posición 5/longitud 8 e importe posición 44/longitud 11. El panel explica esos campos y conserva los motivos específicos de rechazo. Una validación estructural no se presenta como aceptación por AMARU; tampoco corrige el TXT ni lo transmite al receptor.

Se mantiene el acceso al exportador de Novedades fijas aprobadas. Los controles son utilizables a 320/390 px, con altura mínima de 44 px, foco visible y mensajes anunciables. Se inspeccionaron capturas de escritorio y móvil con datos sintéticos.

## Privacidad y límites
El endpoint y sus permisos no se modifican. El contenido sigue enviándose al analizador privado autorizado; no se envían nombre de archivo, municipio, binding ni un esquema arbitrario. El archivo no se guarda en almacenamiento del navegador; después de una respuesta válida se libera la selección.

El plazo de 25 segundos incluye lectura, petición y respuesta. La respuesta JSON se limita a 64 KiB y requiere no-store; se rechazan HTML, cookies inesperadas, redirecciones y cuerpos inválidos. Los mensajes del servidor o de conexión no se copian a la pantalla: se usa texto fijo que no expone valores ni cadenas sensibles.

## Pruebas ejecutadas
- 69 pruebas focales del cliente, parser y API: 34 nuevas de límites, errores, cancelación y correspondencia de respuesta más 35 existentes.
- 27 escenarios nuevos de navegador con API y archivos sintéticos: lectura correcta, AMARU con observaciones, cambio de archivo/formato, cancelación, doble submit, 503/429/422, desconexión, HTML, caché incorrecta, exceso de tamaño, respuesta ajena, datos personales inesperados, plazos de lectura/red, 401/403, limpieza, cambio de contexto, navegación, desmontaje y móvil.
- Regresión integrada del laboratorio/nómina aprobada en escritorio/móvil, incluida la navegación real hacia Migración. La prueba inicial detectó un mensaje de cambio de contexto al cargar una pantalla vacía; se corrigió el controlador, no se debilitó la expectativa.
- 37 recorridos existentes de Novedades fijas/TXT638 aprobados, cero errores.
- Se reutiliza el workflow de novedades fijas para los nuevos recorridos locales y sobre archivos publicados; no se crea otro pipeline.

La primera simulación de fallo de transporte mediante un cierre abrupto del socket produjo una repetición transparente de Chromium. Se sustituyó esa simulación por desconexión del contexto desechable del navegador: se verifica cero peticiones al servidor mientras está offline, conservación del archivo y una petición después del reintento manual. No se cambió ni ignoró el comportamiento del controlador para hacer pasar una aserción de transporte.

La ampliación opcional de espera de publicación propuesta para el nuevo verificador fue bloqueada antes de guardarse. No se aplicó ni reintentó: la comprobación pública existente exige directamente igualdad de los archivos y del release esperado, y falla ante discrepancias. El despliegue READY, SHA, CI final y evidencia pública se registran en la PR después de publicar.

## Pendientes que conserva el plan
Este sprint no acredita la sesión personal de Noelia ni la aceptación del TXT por AMARU. Continúan la vinculación de cargos históricos, la evidencia presupuestaria anual y el trabajo independiente de recibos. No hubo cambios de permisos, credenciales, MFA, datos municipales, haberes, pagos, firmas ni selección de fuentes.

Construcción final local: **5.513 pruebas aprobadas, cero fallos y dos omitidas**. Los archivos reales de Noelia no se usaron en estas pruebas. La demostración visual utiliza archivos sintéticos y no sustituye la aceptación municipal.
