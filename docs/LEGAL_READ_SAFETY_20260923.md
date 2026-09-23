# Agenda contractual y Centro de Alertas: lectura privada estable

Incremento sobre a70daa9. Mejora los circuitos existentes de Mariano sin cambiar contratos API, permisos, estados administrativos ni decisiones jurídicas.

## Entregado en código

- Actualizar agenda desde su propia pantalla. Actualización manual, foco y visibilidad comparten una sola consulta en curso.
- Plazo de 25 segundos para transporte y lectura completa del cuerpo. Una respuesta que llegue después de agotar el plazo no puede reemplazar un resultado nuevo.
- Cualquier cambio posterior del contexto de capacidades invalida la consulta anterior, incluso cuando el contexto nuevo conserva legal.norm.read. No se presume que dos municipios con el mismo permiso son el mismo contexto.
- Las respuestas 401/403 retiran los datos y controles; no se reintenta automáticamente. El servidor conserva la autoridad de autorización.
- Un error transitorio elimina los datos anteriores y mantiene filtros para el reintento. No se presentan excepciones privadas del servidor al usuario.
- Agenda: conteos coherentes con la búsqueda completa y rechazo de fechas imposibles, preservando años bisiestos válidos.
- Nada se escribe en localStorage/sessionStorage, bases o servicios de mensajería. Las categorías por fecha siguen siendo descriptivas, no conclusiones sobre incumplimiento o vigencia.

## Verificación

Pruebas unitarias de concurrencia, plazos, permiso revocado, respuestas tardías y fechas. Recorridos de navegador con fuentes sintéticas; los privados están interceptados. El proceso de publicación coteja cuatro archivos servidos y exige 401 en dos recursos privados sin sesión.

No equivale a haber cargado el corpus municipal, enviar avisos, completar los expedientes y contratos, ni a aceptación humana de Mariano. La extracción multiliquidación, el instalador y la corrección del superadmin tienen validaciones separadas: este incremento no declara publicados esos cambios.
