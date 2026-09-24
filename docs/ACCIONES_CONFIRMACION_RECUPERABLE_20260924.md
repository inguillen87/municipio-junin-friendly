# B4 · confirmación recuperable de solicitudes nativas

## Problema verificado en el código anterior

El transporte común devolvía un objeto vacío cuando una respuesta HTTP exitosa no contenía JSON válido. La rutina de comando eliminaba entonces su clave pendiente; los formularios podían mostrar éxito y cerrarse sin verificar ID, tipo, número, estado o versión del caso. La idempotencia del servidor ya existía; faltaba exigir un comprobante válido antes de dar por confirmada la operación en la interfaz.

## Circuito implementado

Se aplica a crear y editar borradores, enviar a revisión, aprobar, rechazar y cancelar solicitudes de licencia o mayor esfuerzo. Se conservan los comandos y fachadas existentes: este incremento no agrega endpoints, roles, permisos ni migraciones.

La interfaz sólo confirma una respuesta JSON limitada a 16 KiB con el tipo de caso esperado, UUID, número de expediente y versión válidos. Tanto en una operación nueva como en un replay comprueba el estado y la versión del evento original. La migración 059 devuelve `existing_event.to_status` y `existing_event.case_version`; el estado actual del expediente se consulta por separado después del comprobante. Una respuesta de otro caso o con campos ajenos al contrato no confirma el comando. Mayor esfuerzo mantiene nulos los importes y las tasas y los indicadores de cálculo, publicación y conciliación en falso.

Si falta ese comprobante, la conexión se interrumpe o vence el plazo de 20 segundos, se presenta **Pendiente de confirmación**. El formulario no se cierra como guardado y se conserva la clave original. **Recuperar el mismo envío** utiliza el cuerpo que se había confirmado y la misma versión esperada; no toma las modificaciones posteriores del formulario. Si el servidor ya lo registró, su protocolo idempotente devuelve el comprobante; si no recibió el primer envío, puede procesar esa misma operación confirmada.

Mientras una operación permanece incierta, no se envía un comando diferente desde la misma página. Tampoco se generan solicitudes paralelas desde dobles envíos. El usuario puede volver a la bandeja sin representar esa navegación como una cancelación del registro. La recuperación exitosa abre el caso confirmado con su estado vigente, sin reenviar la decisión como una operación nueva.

## Separación entre rechazo y resultado incierto

Una negativa explícita por autorización, versión o reglas continúa por los controles existentes del servidor. No se convierte una denegación en un intento de aprobación alternativo. La contención temporal de sesión conserva su único reintento automático con la misma clave. Errores de red o comprobantes inválidos requieren una recuperación manual.

Una denegación de acceso al recuperar retira la copia pendiente en memoria, pero no borra la clave de una primera operación cuyo resultado había sido incierto: la denegación del segundo intento no demuestra que el primero no se guardó. No hay una consulta privilegiada para eludir la sesión.

La copia de la operación existe sólo en memoria en esa página. En sessionStorage se conserva el registro ya existente de huella, clave y fecha; no se guardan notas, nombres, motivos, contratos ni cuerpos completos. Salir de la página elimina la copia de recuperación; un aviso del navegador advierte cuando aún hay un envío sin confirmar. Esto no es una cola offline ni una promesa de recuperación automática tras cambiar de cuenta o reiniciar el equipo.

## Alcance de la fase

Este es un cierre del transporte y confirmación de la fase B4. Usa el circuito nativo que ya permite preparar y decidir solicitudes, sin cambiar su separación de funciones. El comprobante técnico no es un recibo de sueldo, firma digital, pago ni envío automático de novedades.

No incorpora los archivos pendientes de otros relojes, no homologa turnos ni reglas, no promueve el respaldo del 22/09 y no cierra los requisitos de recibos del módulo 9 ni la aprobación presupuestaria del módulo 10. Esos criterios se mantienen en el plan de operación.

## Cierre de consistencia y fechas civiles

La revisión final se contrastó con `scripts/migrations/059-action-source-history.sql`: en ambas fachadas nativas el replay conserva el estado y la versión del evento original. La interfaz no los sustituye por un estado posterior del expediente; después obtiene el detalle actual mediante su lector autorizado. Una respuesta conflictiva después de un envío incierto no descarta la clave anterior ni habilita automáticamente una operación nueva.

Si la página se abandona durante una petición, su respuesta tardía no restaura el formulario ni la recuperación privada. El retorno desde la caché de navegación obliga a recargar y verificar nuevamente el acceso. El aviso de recuperación se ubica también dentro de un diálogo reabierto para que siga siendo accesible, sin ocultarse detrás del modal.

Se corrigió la presentación de días civiles en el Centro de acciones. Un valor como `2026-10-01` conserva el 1 de octubre en Argentina, Los Ángeles, Auckland o UTC; no se interpreta como medianoche UTC para luego desplazarlo al día anterior. Fechas inexistentes quedan sin informar, no se normalizan al mes siguiente. Los instantes de auditoría mantienen su tratamiento separado.

El rechazo por separación de funciones explica que debe intervenir otra persona autorizada, en lugar de atribuirlo genéricamente a un cambio concurrente de versión. La regla y la decisión permanecen en el servidor.

## Verificación de la entrega

El árbol final pasó `npm run build`: 4.899 pruebas aprobadas, cero fallos y dos omitidas; incluye 73 pruebas nuevas de comprobantes, rechazo, concurrencia, recuperación, ciclo de página y calendario. El CI del commit exacto puede tener omisiones distintas según el entorno y se debe comprobar por separado.

La aceptación de navegador ejecutó 12 recorridos nuevos: respuesta vacía, respuesta contradictoria, pérdida de respuesta después de registrar, primer envío que nunca llegó, edición posterior del formulario, recuperación desde bandeja, envío a revisión, comprobante de otro caso, mayor esfuerzo sin impacto salarial, contención de sesión, revocación y fechas civiles. La regresión del historial existente aprobó 17 recorridos adicionales. Se usan sólo servicios y registros sintéticos interceptados; no son pruebas realizadas con la cuenta de Noelia o Hugo ni constituyen operaciones municipales reales.

El comando de verificación publicada compara cada archivo cargado con el build y mantiene interceptadas todas las llamadas de negocio. No se envían solicitudes o decisiones de prueba a producción. Los resultados quedan en `verification/action-command-recovery/result.json` y `verification/action-history-browser.json`, fuera del contenido de negocio.

Reproducción: `node --test tests/action-command-recovery.test.js`, `npm run build`, `node scripts/verify-action-command-recovery-browser.mjs` y `node scripts/verify-action-history-browser.mjs`. La variante publicada usa `ACTION_RECOVERY_PUBLISHED_ORIGIN=https://municipio-junin-friendly.vercel.app` y exige igualdad de bytes.
