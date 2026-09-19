# Hugo: revisión de jornadas por causa - 19/09/2026

## Circuito implementado

Relojes y marcaciones > Jornadas incorpora el bloque «Qué necesita revisión», con causas específicas: entradas/salidas, pausas, vínculo laboral, secuencia/turno, fuente/perfil y otras incidencias. La opción Todas las causas conserva también las secuencias completas. Cada tarjeta abre las jornadas correspondientes y el detalle añade pasos sugeridos ligados a los motivos de reconstrucción existentes.

La clasificación no calcula nuevas horas: reutiliza los códigos de incidencia emitidos por el motor. No modifica eventos, identidades, contratos, licencias, topes ni reglas de nómina. Secuencia completa tampoco implica asistencia homologada, horas pagables o aprobación. Un evento sin pareja no se convierte en cero horas ni en ausencia.

Los conteos abarcan el estado y la búsqueda aplicados sobre el período completo, antes de elegir causa y antes de paginar. Se cuentan personas/días, no personas únicas ni expedientes resueltos. Una jornada puede aparecer en varias causas; repetir dos problemas de la misma causa no duplica su conteo. Los registros de contexto sin fecha/persona ubicable se siguen informando por separado, no se inventa una jornada para incluirlos en una tarjeta.

La causa se aplica después de reconstruir con el contexto del día anterior y posterior. Cambiar de filtro no corta una jornada nocturna ni elimina un evento necesario para interpretar una pausa. En el detalle se conservan los eventos originales, referencias y tiempos reconstruidos, separados de las sugerencias de revisión.

## Contrato y permisos

Se amplía el endpoint existente clock-workdays-v2 con el parámetro opcional cause. La API mantiene la sesión administrada, el municipio y las capacidades de lectura; la causa no se envía a SQL para filtrar las marcas de origen. La consulta continua se ejecuta una vez sobre la ventana acotada. No hay nuevas migraciones, tablas, endpoints ni solicitudes periódicas.

El metadato workday-review-causes.v1 se devuelve únicamente al solicitar explícitamente cause. Consumidores anteriores que no lo envían conservan su contrato; la consulta histórica v1 no acepta ese filtro. El navegador verifica los conteos, pertenencia de filas y coherencia con los resúmenes antes de mostrarlos. Causas futuras desconocidas quedan en Otras incidencias, no desaparecen silenciosamente.

Al consultar de nuevo se retiran los conteos anteriores; un error no se reemplaza por una tarjeta con cero. Revocar permisos o perder la sesión limpia resultados y categorías. La vista sin permiso nominal conserva seudónimos y no habilita búsquedas por nombre. La nueva bandeja no concede permiso para resolver, aprobar o editar documentos.

## Exportaciones

Los generadores CSV/Excel existentes conservan el filtro completo, no sólo la página. Se incorporan causa seleccionada, categorías de la jornada y próximo paso sugerido. Excel mantiene sus hojas anteriores y agrega el alcance y los conteos de las causas al control. Una modificación de esos metadatos entre páginas invalida toda la descarga, sin archivo parcial.

Las marcas, duraciones y observaciones originales se conservan. Las sugerencias no son decisiones laborales. El CSV también neutraliza prefijos de fórmula precedidos por espacios. No hay importación automática de estos archivos a nómina ni modificación de novedades al descargarlos.

## Servidor municipal

El acceso administrativo solicitado a Cómputos queda pendiente y fuera de este sprint. No se intentó otro inicio de sesión, no se configuraron carpetas/servicios remotos y no se alteraron VPN, colectores o credenciales. El envío confirmado de marcaciones y el circuito del preparte se conservan como fuentes existentes; esta mejora no certifica que los demás relojes estén conectados ni garantiza su inicio el lunes.

## Verificación y cierre de la entrega

Regresión final con Node 24.21.0 del proyecto: **3.809 pruebas aprobadas, cero fallos, omisiones o cancelaciones**, y compilación completa aprobada. Incluye 16 pruebas nuevas de causas: códigos conocidos/desconocidos, duplicados por causa, conteos de todo el ámbito, filtro exacto, jornadas nocturnas, seudonimización, forma de respuestas, exportación íntegra y autorización del adaptador. Las pruebas comprueban también que la página real y las plantillas incluyan los controles nuevos una sola vez.

Se ejecutaron 44 comprobaciones de navegador locales: 22 de revisión de jornadas y causas, 14 de continuidad/exportación de jornadas y ocho del preparte existente. Incluyen CSV/Excel de más de una página, cambio de corte, metadatos alterados, recepción incompleta, pérdida de permisos, cancelación al salir, búsqueda, secuencias nocturnas y entrada/salida/pausa incompletas. Se verificaron 390/320 píxeles y se inspeccionó visualmente la captura del panel móvil.

La interfaz y el motor de reconstrucción son reales; las API privadas, sesiones, eventos y mosaicos de mapa de esos recorridos son sintéticos e interceptados. El preparte incluye un POST interceptado para comprobar que su circuito existente se conserva. No se crearon aprobaciones, licencias, novedades o eventos municipales reales. Este ensayo no homologa una regla salarial ni prueba una sesión real de Hugo.

Durante QA se detectó que la página publicada y la plantilla embebida conservaban otra copia del fragmento de jornadas. Se actualizaron ambas sin sustituir la orientación v2 por la antigua, y se añadió una prueba para impedir controles ausentes o duplicados. Una aserción del verificador se acotó a las solicitudes de su propio ensayo de exportación; las nuevas exportaciones por causa se prueban por separado. No se retiraron controles de permiso, contexto o integridad.

La promoción se hace en un solo commit, sin nuevos workflows, dependencias, planes o recursos de cómputo. Después de Vercel se verifica el SHA activo, cinco módulos/estilos y el HTML publicado frente a la compilación local; se exige 401 anónimo y se repite el recorrido con assets publicados e interceptación de API privada. El resultado de esa verificación se registra separadamente: el éxito local no es por sí mismo una publicación.

Reversión: revertir exclusivamente esta entrega de aplicación, sin deshacer cambios concurrentes. No hay una migración o registros municipales que revertir. El acceso al servidor, la instalación del colector, las restantes identidades de relojes, las novedades aprobadas de asistencia y la liquidación autónoma siguen siendo cierres distintos.
