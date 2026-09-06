# Modernización gradual de MuniControl

## Regla de trabajo

Migrar módulos verificables a React conservando las rutas sin extensión y las APIs Node.js existentes. Una migración no debe cambiar permisos, reglas de liquidación ni importes por el mero cambio de tecnología. Mantener UX simple para administrativos y contadores, una acción principal y detalles desplegables.

React también produce HTML para el navegador: el objetivo es reducir pantallas mantenidas manualmente, compartir componentes y facilitar pruebas, no eliminar el formato que necesita la web.

## Primer incremento

Isla React en el acceso: instalar y compartir MuniControl. Sólo esta pantalla descarga React; los demás módulos mantienen su funcionamiento y peso. El build produce un archivo de nombre versionado, JavaScript de producción y avisos de licencia, sin mapas de código públicos. Límite inicial: 90 KB gzip para la isla completa, incluido React.

- Instalación ofrecida cuando el navegador la permite; instrucciones alternativas para iPhone y Android.
- Compartir o copiar únicamente el enlace público de la plataforma, nunca el enlace de una sesión o un recibo.
- La persona elige el destinatario y confirma el envío; no se manda ningún mensaje automáticamente.
- Fallback legible si no carga JavaScript. El formulario de acceso sigue siendo independiente.
- Sin escrituras en Neon, nuevos servicios de servidor, analítica externa ni credenciales añadidas.

React y React DOM fijados en 19.2.8; compilación con esbuild 0.28.2. La API municipal ya ejecuta Node.js; no se reemplaza por otro servidor paralelo. La adopción por componentes sigue el patrón documentado por [React para proyectos existentes](https://react.dev/learn/add-react-to-an-existing-project).

Verificado en este incremento: 62.122 bytes gzip; 1.641 pruebas generales aprobadas; nueve casos del controlador de instalación; Chrome con React real a 320 y 1280 px, incluidos copia denegada, cancelación, aceptación pendiente de confirmar, teclado/formulario conservado y ausencia de desbordamiento. Las APIs nativas de compartir, clipboard e instalación se simulan en esta prueba: no se enviaron mensajes ni se instaló físicamente en un teléfono.

## Segundo incremento: navegación por tarea en Reportes

La navegación de Reportes y controles es una isla React independiente; acceso no la descarga. Conserva los formularios y exportadores existentes en su DOM y separa las herramientas locales del estado de carga del informe. Incluye enlaces directos, historial, recuperación de errores, formato visual coherente y detalles técnicos desplegables. [Alcance y evidencia](REPORT_WORKSPACE_20260905.md). No es una migración completa de Nómina ni de los motores de cálculo a React.

## Siguientes módulos, en orden

Incremento visual de acceso publicado: [identidad aplicada y validación](ACCESS_DESIGN_20260905.md). El formulario conserva su controlador de identidad; la isla React continúa limitada a instalación/compartir. No atribuir este rediseño a una migración completa del login a React ni del resto de módulos.

1. Componentes comunes de navegación, encabezado, formularios y estados de carga/error, manteniendo rutas actuales y separación de roles.
2. Reportes prioritarios de Noelia: selección de período, jurisdicción, vista previa y descarga; reutilizar los motores de validación y exportación probados.
3. Personas y recibos: migrar la presentación después de cerrar los contratos canónicos de detalle, conciliación y emisión. No confundir resumen de control con recibo oficial.
4. Extender TypeScript a contratos y componentes migrados. Evaluar un framework integral sólo cuando aporte routing, renderizado o mantenimiento medibles; no reescribir todo de una vez.

Cada incremento exige build, pruebas de contratos/roles, recorrido real en escritorio y móvil, revisión visual, identificador de versión y comprobación del contenido servido en Producción. Los cambios de base de datos se evalúan aparte.
