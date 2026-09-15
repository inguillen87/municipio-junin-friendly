# Portada de acceso · 14 de septiembre de 2026

La portada de `login.html` se rehace alrededor del ingreso institucional. Usa la identidad aprobada «Puerta común», azul petróleo, verde y blanco cálido; títulos y controles usan la tipografía sans del sistema. No descarga fuentes ni introduce otro logo.

El formulario es la acción principal. La vista general aparece separada como alternativa secundaria, sin pedir una cuenta. En móvil, los campos y el botón de ingreso aparecen antes del contenido introductorio. Se retiran las cifras grandes del respaldo de agosto y las explicaciones de tenant/servidor de la presentación pública, sin afirmar una actualización de los datos municipales.

Los 37 identificadores existentes, controles, destinos, invitaciones, autocompletado, validaciones, eventos y contenido de ambos scripts inline permanecen conservados. La comparación de scripts normalizada a LF con `8fdca51` da SHA-256 `9cfcd2818f4d33bbf6651cf8a6e36eb5d71f746a5cbcb6f5424aa5b17c78c53a`. No se modifican autorizaciones, sesiones, roles ni llamadas de autenticación.

El nuevo CSS conserva visibles los errores al volver el foco al código en móvil. También presenta únicamente el paso de acceso activo: el selector de ámbito que la lógica existente conserva en el DOM deja de competir visualmente con MFA o con el retorno a credenciales. Esto no selecciona contextos ni altera la lógica de verificación.

## Archivos

- `login.html`: estructura y textos de presentación, con todos los controles existentes.
- `assets/access-portal.css`: diseño exclusivo de la portada, estados y adaptaciones móviles.
- `scripts/build-friendly.mjs`: incorpora únicamente el CSS nuevo al listado de publicación.
- `scripts/verify-access-portal-browser.mjs`: verificación reproducible sobre el build con APIs inventadas.

## Comprobaciones locales

- 14 pruebas existentes de identidad e inicio por correo aprobadas.
- Chrome a 1440 × 1000 y 390 × 844: campos inicialmente vacíos, logo aprobado, diseño sin desplazamiento horizontal, recorrido por teclado y salto al formulario, mostrar/ocultar contraseña, validación local, error de servicio, conservación del correo y borrado de contraseña según la lógica vigente.
- Elección explícita de ámbito, MFA, cambio entre autenticador/recuperación, cancelación, envío simulado por correo, error con siguiente versión, reintento, configuración del autenticador, confirmación de códigos de recuperación y destino `next`.
- Enlace de invitación sin código en URL, inicio y cancelación de activación, enlace de ayuda y vista general secundaria.
- Revisión visual de portada, MFA, error y configuración en ambos tamaños. Capturas en `verification/access-portal-*.png`, excluidas de publicación y marcadas como pruebas locales.

Todas las solicitudes de esa comprobación se interceptan con cuentas y desafíos inventados. No inicia sesión en una cuenta municipal, no envía correos y no prueba la recepción de un código real. La publicación y su revisión visual en Producción corresponden al integrador.
