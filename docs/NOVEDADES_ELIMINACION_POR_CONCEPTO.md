# Eliminar novedades por concepto, mes y tipo

La carga propia permite localizar el conjunto completo de lotes activos de un concepto, mes y tipo de liquidación, revisar sus cantidades y consultar cada lote antes de cancelarlos. La búsqueda de pantalla no determina el alcance de la cancelación. El período de la búsqueda es el del lote; no se sustituye por su mes de ajuste.

## Recorrido

1. En la carga de novedades propias, abrir **Eliminar novedades de lotes propios**.
2. Elegir concepto, período y tipo; pulsar **Buscar novedades del concepto**.
3. Revisar el conjunto completo. Un lote con otros conceptos o que requiere revisión individual bloquea la preparación conjunta; se puede consultar desde el resultado.
4. Confirmar que cada lote se cancela por separado. El servidor comprueba que la cuenta sea su preparadora y que siga admitiendo la operación.
5. Registrar las cancelaciones. Cada lote conserva sus filas, historial y un comprobante propio. El resultado distingue lotes con comprobante y lotes pendientes.
6. Ante un rechazo o respuesta incierta, recuperar el mismo intento antes de continuar. Un comprobante recuperado no envía automáticamente los restantes. Si no existe registro, puede reintentarse la misma clave o volver a revisar, después de otra consulta de recuperación.

Ocultar la pestaña o retirar un permiso quita las vistas. La clave y el cuerpo del intento incierto se conservan en memoria. Al volver, se verifica acceso actual; se muestra nuevamente el concepto, mes y tipo originales y se exige una nueva confirmación. Renovar la sesión de la misma cuenta no convierte su UUID en la identidad del preparador: el servidor sigue comprobando la autoría en cada lectura y comando.

**Actualizar carga propia** recupera también la consulta de un conjunto parcial o terminado que ya no tenga un intento pendiente. Antes de mostrar sus comprobantes vuelve a verificar la cuenta y el inventario protegido de lotes. Los comprobantes son antecedentes: mostrarlos no acepta cambios en las fuentes ni envía los lotes restantes. La continuación conserva su verificación completa antes de cada envío.

Un rechazo de cancelación no se interpreta automáticamente como un error de autoría: el mismo código puede indicar pérdida de permisos. Primero se retiran las vistas nominales. Si la sesión, las capacidades y el ámbito se verifican nuevamente en el servidor, se muestra sólo el resumen y los comprobantes, con el intento rechazado conservado. Si la comprobación falla, la vista sigue retirada. No se omite el lote rechazado ni se envían los siguientes de forma automática.

Cada petición tiene un plazo de 45 segundos que incluye recibir y leer su respuesta. Si vence durante un envío, no se afirma que haya fallado el registro: se conservan el mismo contenido, clave y comprobantes anteriores para recuperarlo. La recuperación demorada tampoco se interpreta como un intento ausente. No hay reenvíos automáticos. Ocultar la página cancela la espera y las respuestas tardías no cambian una consulta posterior.

Al devolver a revisión un intento sin registro, los comprobantes anteriores siguen visibles como historial, ligados a la cuenta original. No constituyen un conjunto preparado. Sólo **Cerrar revisión conjunta** descarta esa vista local; no deshace las cancelaciones registradas.

## Alcance

- Opera sobre lotes propios completos; no elimina filas aisladas de un lote mixto ni introduce importes cero para simular una baja.
- Los reemplazos aprobados y lotes con sucesores o cálculos/cierres relacionados requieren revisión individual. La comprobación de usos es conservadora: no afirma que toda corrida relacionada haya usado ese lote.
- Las novedades fijas conservan su circuito específico de baja; este recorrido no sustituye ese procedimiento.
- No existe una transacción común entre lotes. Un rechazo posterior no deshace cancelaciones cuyos comprobantes ya se verificaron.
- La recuperación es del montaje actual y sus datos en memoria. No añade una cola durable de conjunto ni guardado en el navegador.

## Validación

El coordinador usa las lecturas y comandos existentes, sin añadir SQL o permisos. Las pruebas focales usan datos sintéticos, transporte y DOM en memoria; cubren censo completo, lotes mixtos, cambios concurrentes, integridad del comprobante, acuse perdido, recuperación, renovación de sesión y retirada de vistas. El panel real se ejecuta con esas dependencias sintéticas; no constituye una prueba de navegador o PostgreSQL.

La dependencia nueva está declarada en el listado de archivos del paquete. La comprobación de esa declaración es estática; no acredita un build ni una publicación. Las validaciones nativas, la versión servida y la aceptación de Noelia siguen siendo estados separados.
