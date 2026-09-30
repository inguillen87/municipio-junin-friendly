# Importación: revisar el lote confirmado sin volver a buscarlo

Los audios del 29/09 priorizan importar el TXT completo, comprobar todos los registros y corregir los errores antes de continuar. Las transcripciones automáticas ya existentes fueron cotejadas contra las huellas de los siete originales de Downloads; la copia `(1)` de las 19:31 es idéntica al original. No se incorporan audios, transcripciones privadas ni ejemplos nominales al repositorio.

## Cambio implementado

Después de verificar íntegramente el recibo del guardado, el importador ofrece **Revisar este lote**. El enlace contiene exclusivamente el identificador opaco del lote confirmado y abre la pantalla de novedades existente.

La pantalla verifica primero el bootstrap y sus capacidades. Consulta el detalle exacto mediante el lector existente, comprueba que la respuesta pertenece al identificador solicitado y conserva todas sus filas. Abrir el enlace no prepara, envía, aprueba, cancela ni liquida datos. No consume un borrador anterior de otra tarea ni mezcla selección de persona con selección de lote.

Los botones de revisión y cancelación siguen procediendo de `allowedCommands`; no se conceden permisos ni se modifican reglas del servidor. Cancelar el lote conserva el historial y no equivale a anular o recalcular una liquidación.

Un recibo no verificable no genera un enlace supuesto. El reintento conserva cuerpo y clave y sólo habilita la revisión cuando recupera el recibo válido. Nueva importación, revocación u ocultación retiran el enlace de la pantalla.

## Validación y estado

- 167 pruebas focales iniciales aprobadas.
- 206 pruebas focales finales aprobadas, incluidas regresiones de importación, modelos, interfaz, selección exacta y APIs v1/v2.
- 24 regresiones nuevas: parámetros ambiguos, UUID vacío/inválido, otro lote, lectura restringida, denegación, 60 filas completas, guardado incierto, recuperación y retirada de contexto.
- Sintaxis JavaScript y `git diff --check` aprobados.

Las operaciones de escritura de las pruebas utilizan fixtures sintéticos y dobles SQL. No se operó una base municipal ni se modificó el contrato de persistencia. No se repitieron el build bloqueado ni el verificador de navegador superpuesto con el frente de rutas. **Navegador, compilación completa, publicación y aceptación municipal quedan pendientes.** No se creó commit, push ni deploy.

## Frentes que conserva

Se mantienen el CSV local de incidencias y los cambios ajenos existentes. No se modifican manifiestos de rutas, migraciones, resolvedores o evaluadores rechazados. El límite de 500, OSEP completo, padrón integral propio y motor salarial autónomo siguen abiertos. El ciclo mensual administrativo existente declara `payrollCalculated:false`; este enlace no cambia ese efecto.

Relojes: el handoff y `CLOCK_FLEET_UNIFIED_20260923.md` conservan pendiente la aceptación autónoma en cloud. Esta entrega no consultó en vivo Oracle ni manipuló VPN, capturadores, colas o servicios. Su cierre exige evidencia de recepción nueva con el host anterior apagado y recuperación del host cloud; una VM disponible no prueba ese funcionamiento.
