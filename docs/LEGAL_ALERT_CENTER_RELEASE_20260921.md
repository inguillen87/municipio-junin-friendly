# Centro de Alertas Jurídicas — cierre de consulta

El centro reúne seguimientos normativos y obligaciones contractuales con fechas registradas. Muestra cobertura, fecha de referencia de Mendoza, versión de fuente y estados en español. «Fecha pasada» no determina vencimiento legal, mora ni vigencia; «Cerrados o cancelados» incluye decisiones observadas y no presume cumplimiento.

Se corrigió el rechazo de normas históricas de 1700–1899 y 2101–2200, respetando el rango del registro normativo y el rango independiente de contratos. Fechas imposibles, duplicados y respuestas incoherentes se rechazan. La API acepta exclusivamente lectura y construye el alcance desde membresía y sesión verificadas; la URL no puede seleccionar municipio ni usuario.

La consulta se puede actualizar y se revalida al volver a la pantalla. Una actualización fallida elimina los datos anteriores; una revocación elimina resultados, búsqueda y controles. Se conservan filtros al actualizar con éxito. La búsqueda y los contadores cubren la respuesta completa; las tarjetas se muestran de a 25. El responsable de seguimiento no forma parte de esta fachada; no se inventa una asignación. La obligación abre su lista contractual, mientras el seguimiento conserva su versión e identificador exactos.

Validación local: 3.947 pruebas y compilación aprobadas; 12 recorridos de navegador con capturas en 1440, 390 y 320 px. Los recorridos, incluso en modo publicado, interceptan autenticación y API privada: prueban la interfaz servida con datos sintéticos en memoria, sin certificar una sesión municipal real ni persistir ejemplos. El control productivo debe verificar por separado el despliegue, los archivos publicados, las denegaciones anónimas y las fachadas de base.

La migración 089 ya estaba instalada en PG18 y PG17 al recuperar esta entrega. Ambas funciones tenían SHA-256 `b542227281719ee0f9c1ca0213b440bb54aebff738733c97b04f4abc44fc7213`. Este cierre no modifica el esquema ni requiere reinstalarla. El límite explícito es 1.500 elementos; superar el límite impide mostrar un resumen parcial.

La rama de cierre debe pasar `Legal alert center release` antes de promoverse. Este documento describe alcance y controles; no reemplaza la evidencia de publicación del commit correspondiente.

## Publicación comprobada

El cierre `50a9cb049d232a73db8a2a40b53e27ac68ab7b72` pasó CI de rama (run `35611449513`) y de master (`35611717116`). Vercel publicó producción mediante `dpl_5iXb8VBTCTXEwmBoWoDXs7MyjPaK`. El 21/09/2026 a las 14:24 UTC se comprobaron los seis archivos públicos contra la compilación revisada y la API anónima devolvió 401. Los 12 recorridos también pasaron sobre los archivos publicados, con las API privadas interceptadas. No se probó una sesión municipal autenticada real ni se crearon datos municipales.
