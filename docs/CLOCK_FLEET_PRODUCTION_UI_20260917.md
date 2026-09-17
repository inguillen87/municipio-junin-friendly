# Central de recepción · incremento operativo de producción

Continúa #37/#41 sin mezclar la rama de firma digital ni modificar datos municipales. Utiliza la función `attendance_clock_fleet_v1` de la migración 070 existente. **No requiere otra migración ni crea equipos/conectores, tokens, empleados o marcaciones.**

## Función de esta entrega

La pantalla `/relojes` incorpora un control común de recepción: equipos registrados, equipos con acuses, atención requerida, búsqueda por punto/lugar/modelo, estados, desglose y exportación CSV. El panel nominal de PM-10, jornadas y el resto de las operaciones se mantienen. Un registro leído en Windows no aparece automáticamente en este panel hasta inscribirse y recibirse en la plataforma.

La nueva API es sólo lectura y exige membresía, sesión vigente, capacidad `attendance.read` y contrato de datos certificado. La base vuelve a comprobar ese acceso en cada consulta. No permite escoger otro municipio por un parámetro ni devuelve IP, serie, nombres, DNI, plantillas biométricas o credenciales. Es una proyección de recepción, no una búsqueda de empleados.

Los estados se calculan respecto de la fecha que informa la base. «Recepción reciente» significa acuse dentro de los 30 minutos anteriores al corte consultado. No certifica conectividad permanente, captura completa, todas las jornadas del mes ni cálculo salarial. Acuse anterior, configuración pendiente y suspensión se explican sin declarar un reloj apagado. La captura declarada es la fecha enviada en las partes recibidas, no una nueva verificación del hardware.

## Flujo UX

- Resumen del corte completo y tarjetas del filtro claramente separados.
- Búsqueda explícita, tolerante a acentos/mayúsculas, sin consultas por tecla; filtros locales.
- Actualización manual por defecto. Seguimiento opcional cada 60 segundos sólo con la pestaña visible y acceso vigente. No aumentar carga de base por filtros.
- CSV vuelve a consultar la fuente antes de exportar el filtro completo y conserva fecha de consulta, acuse, captura declarada y desglose. Cambio del filtro durante la consulta cancela la exportación. Neutraliza fórmulas de hoja de cálculo mediante el contrato existente.
- «Ver marcaciones» conserva la navegación por código del punto; «Ubicar en mapa» ubica sólo el punto de clave exacta. La tarjeta y el mapa muestran los mismos acuses, no una coincidencia de nombre.
- El mapa mantiene las coordenadas del inventario informado y su advertencia de verificación física pendiente. Sin correspondencia exacta se muestra la ausencia: no se copian coordenadas de otra sede ni se inventa un pin.
- Listado geográfico accesible, foco, tamaños táctiles y diseño de 320/390 px. La cifra de recepción no se comunica únicamente con color.
- Error retira los datos anteriores y sus notas en el mapa; cierre de sesión/permiso revocado abandona el seguimiento. Una respuesta tardía no vuelve a exponer la consulta anterior.

## Integración y no regresión

`build-clock-fleet.mjs` integra archivos y puntos únicos de la página compilada; si cambia el contrato de inserción, falla la compilación en lugar de publicar botones desconectados. El HTML fuente de relojes y el panel PM-10 se mantienen sin cambios. El test del mapa compara contra esa transformación explícita sin relajar las pruebas de privacidad/referrer, proveedores cartográficos caídos y recuperación.

El flujo de CI de recepción existente se amplía para esta entrega, sin otra familia de workflows ni previews. Pruebas unitarias de contrato/autorización/CSV y recorridos reales de navegador con APIs sintéticas. Después de promoción se comprueban hashes de artefactos, rechazo de lectura anónima y recorridos con los archivos realmente publicados. Esas pruebas no simulan una sesión municipal real ni registran fichadas.

## Estado y siguientes cierres

Este control sólo puede mostrar las fuentes existentes en Neon. No confundir «cinco capturas locales completas» con «cinco conectores recibidos». La inscripción/envío por equipo continúa pendiente de acceso a la instalación local, preservación de colas y comprobación del primer acuse con su serie/punto/conector. No crear otro lector ni reutilizar el token de PM-10.

La firma remota mantiene su avance separado y deshabilitado para uso oficial mientras falten aprobación de fuentes/facultades, integración institucional y verificación criptográfica. Los certificados personales próximos no sustituyen esos requisitos. Esta publicación no depende de ellos y no cambia nóminas, fórmulas, cuentas o documentos jurídicos.

Reversión: revertir sólo este incremento de código, sin resetear master ni restaurar tablas. No tiene cambios de datos que revertir. El resultado de CI y las comprobaciones del despliegue, no este documento, acreditan su publicación y aceptación.
