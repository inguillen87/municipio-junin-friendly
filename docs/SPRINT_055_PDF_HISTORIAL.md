# Sprint 055 — Resumen PDF y navegación del historial de legajo

## Incidente y causas reproducidas
El botón de resumen enviaba `employee.name`, pero la ficha real usa `employee.nombre`. El modelo recibía un nombre vacío y lanzaba «Dato documental incompleto». La prueba del shell agregaba un alias `name` que la API no entregaba, ocultando el defecto.

Después de corregir la identidad, un importe `null` provocaba «Importe no disponible o inválido». La corrección conserva el dato ausente como «No informado», sin convertirlo en cero. El control aritmético tiene tres estados: coincidente, con diferencia y no evaluable. La ausencia de contribuciones patronales no impide comprobar el neto, porque no forman parte de esa ecuación.

## Cambios funcionales
- El botón entrega el objeto de ficha real al modelo documental; admite `nombre` y mantiene aliases de otros consumidores.
- Antes de cada descarga se vuelve a consultar la misma página autorizada. Se exige encontrar una única liquidación y que importes, estado, corte e identificación del período no hayan cambiado.
- La descarga se cancela si cambia el origen, se pierde acceso o se cierra la ficha durante la consulta. El enlace temporal se inserta en el documento y se libera tras la descarga.
- El nombre del archivo distingue legajo, fecha y tipo de liquidación. No usa el nombre personal.
- Contexto de origen y resultado de descarga ocupan filas propias. Botones anchos, estados de carga, faltantes explícitos, diseño móvil y movimiento reducido.
- Búsqueda por año mediante el filtro ya existente en la API. No filtra solamente tarjetas cargadas. Muestra cantidad recibida y total del filtro; reinicia paginación y descarta respuestas tardías.

## Verificación reproducible
`node scripts/integrate-payroll-summary-055.mjs` se utilizó durante el desarrollo local. La entrega contiene los archivos finales y una revisión en rama aislada antes de publicarse.

La aceptación ejecuta `npm test`, construcción, el circuito completo en `scripts/verify-payroll-summary-055.mjs` y regresiones de biblioteca, resumen y centro de reportes. Los casos son sintéticos y usan el contrato real de nombres y nulos; no contienen identidades municipales. Se verifican descargas, cambio de fuente, denegación de permisos, cierre de ficha, búsqueda anual, paginación, respuestas fuera de orden y disposición móvil.

La verificación de producción compara SHA-256 de HTML y recursos publicados, comprueba rechazo sin sesión y repite la navegación con recursos publicados y respuestas API sintéticas. No equivale a iniciar sesión con Noelia ni a certificar un recibo oficial.

## Alcance y siguientes etapas
No cambia bases de datos, fórmulas, liquidaciones, cierres, permisos ni salarios. No importa backups ni activa el colector de relojes.

El resumen sigue separado del recibo oficial. Continúan pendientes los circuitos ya documentados: colector municipal continuo; incorporación controlada del nuevo GRH con capacidad y recuperación suficientes; catálogos y fórmulas por convenio; exportables receptores completos; confirmación, cierre e imputación autónomos. Los requisitos de Noelia de bancos, escolaridad y F.931 no se dan por terminados con este correctivo.
