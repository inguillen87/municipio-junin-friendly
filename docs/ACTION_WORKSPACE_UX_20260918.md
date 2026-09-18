# Centro de acciones: espacio de trabajo y revisión legible

## Incremento implementado

La guía de licencias se pliega mediante un elemento HTML `details`: los cuatro pasos y sus botones originales permanecen disponibles al expandirla. Su apertura por teclado no ejecuta consultas ni crea solicitudes. Los accesos principales existentes a Nueva solicitud y Mayor esfuerzo se conservan fuera de la guía.

El acceso **Ir a la bandeja** llega directamente al encabezado del listado, con foco visible y margen para que no quede debajo de la barra superior. El enlace utiliza sólo el ancla `#queueTitle`, sin nombres, legajos o identificadores de solicitudes en la URL.

Se renueva la presentación del Centro de acciones, los filtros, el detalle, las advertencias y los formularios existentes. En móvil las tarjetas muestran etiquetas y valores en líneas completas, en lugar de comprimirlos en dos columnas. La revisión mantiene separados solicitud, evidencia, control administrativo e historial, con controles de tamaño táctil y texto espaciado. Las advertencias de respaldo histórico y validación permanecen visibles.

No se reemplazó el controlador de decisiones, consultas o altas. La secuencia de bloques JavaScript en el HTML mantuvo exactamente SHA-256 `0714b83d1e8b953d4d6cd3954900fc7deaf9f7d3b0889611168b836b0a485538`. No cambian capacidades, comprobaciones de versión, fundamentos obligatorios, confirmación humana, idempotencia ni llamadas del servidor.

## Límites y pendientes identificados

Durante la revisión se detectó que `loadActions` no tiene un descarte explícito por generación para todas las consultas sucesivas de bandeja. Se intentó preparar la corrección del controlador y una ampliación de resumen/navegación, pero la herramienta bloqueó su escritura. **No se integraron esas propuestas ni se presenta la carrera de consultas como corregida.** La entrega independiente de estructura/CSS no añade filtros, contadores ni navegación automática entre expedientes.

Septiembre, ciclo de edición/baja/reingreso de legajos, expedientes y obligaciones de Mariano, incorporación adicional de relojes y habilitación de firma conservan sus cierres independientes. Esta entrega no aplica migraciones ni modifica haberes, documentos, usuarios, permisos o fuentes de datos.

## Verificación

Regresión de 3.636 pruebas aprobadas, sin fallos ni omisiones, y compilación correcta. El recorrido existente de historial/acciones se amplió a 17 grupos: guía por teclado, ancla y foco, formulario de decisión con revisión y retorno sin confirmar, vistas 320/390 px, proyección de nómina, histórico, permisos denegados, respuestas tardías y controles explícitos. Todas sus API fueron respuestas sintéticas GET; no se enviaron decisiones municipales reales. El recorrido de preparte existente aprobó ocho grupos.

La captura de formulario y detalle no equivale a aceptación de RRHH ni a certificación WCAG. Se inspeccionaron capturas en escritorio y móvil y se corrigió la compresión de las tarjetas pequeñas. Se respeta la preferencia de movimiento reducido.

Se utiliza el workflow productivo existente con instalación/build compartidos. El cotejo de assets de este recorrido usa la ruta canónica `/acciones` para comparar la página que procede de `centro-acciones.html`, manteniendo igualdad de bytes y el mismo origen. No se añade una excepción a la autenticación real: las llamadas a API de los ensayos se interceptan.

La publicación y su verificación deben acreditarse por separado del resultado local. No se crea un preview ni un workflow adicional por este incremento.

## Publicación y verificación de despliegue

El incremento de interfaz se publicó como `c500c66946fc64dd2de0c96f2438974ce8177cee`; Vercel confirmó éxito. La primera ejecución CI de la prueba de acciones no pudo abrir la página durante el despliegue. Una comprobación posterior cotejó la página canónica y el CSS byte por byte y completó los 17 grupos del recorrido sobre los assets productivos, con API sintética y sin escrituras municipales.

Se añadió al verificador una espera acotada por disponibilidad de la página/CSS exactos antes de iniciar el navegador, manteniendo el requisito de igualdad de bytes. Esta corrección adicional afecta sólo a verificación y documentación, no a la aplicación. No se afirma aprobación de la primera ejecución fallida; la conclusión del workflow posterior se registra por separado.
