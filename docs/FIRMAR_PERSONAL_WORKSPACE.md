# FD-P3 · Bandeja personal y revisión del PDF fuente

Continúa el recorrido HTTP/PostgreSQL de FD-P2 sin reemplazarlo. **Código de piloto en la rama interna, deshabilitado por defecto: no firma oficial, no migración en Neon ni asignación de facultades reales.** Los resultados efectivos de CI acreditan qué ensayos aprobaron; este documento no reemplaza esa evidencia.

## Recorrido nuevo

Mis documentos → búsqueda/estado → original preparado → revisión de páginas → continuar con esa misma solicitud → coordinador FirmAR existente. La bandeja cuenta solicitudes realmente devueltas por el servidor, no accesos estáticos ni ejemplos. No realiza llamadas al proveedor al listar, filtrar, abrir ni volver.

Filtro por pendientes, revisión requerida, recibidos sin validar y cancelados; búsqueda aplicada separada del texto que aún se está escribiendo. Contadores, filas y paginación proceden del mismo corte autorizado. Volver del PDF conserva la búsqueda aplicada y consulta de nuevo su estado. Error de consulta no deja números anteriores anunciados como recientes.

El alcance es personal: sesión municipal con MFA, solicitud asignada a su membresía, autorización documental vigente y su versión. El usuario con perfil amplio NO ve la bandeja ajena por ser administrador. No hace falta legajo laboral. Cambiar de sesión o perder acceso vacía el documento, canvas, títulos y conteos anteriores; las respuestas tardías no reabren el detalle.

## Original que se revisa

`GET /api/internal-firmar-workspace` sólo admite lista y fuente. La fuente exige requestId, versión y hash. La base revalida acceso y devuelve el mismo archivo aprobado; el servidor y el navegador verifican sus bytes y su huella antes del renderizado. La respuesta no incluye CUIL, referencias de aprobación, credenciales ni el PDF retornado del prestador.

PDF.js muestra páginas reales en canvas, ajuste al ancho y ampliación; el texto nativo se ofrece como ayuda opcional, no como sustitución del documento. No se presenta una imagen ficticia del informe ni se incrusta un validador público. No se declara que todas las páginas fueron leídas: el funcionario conserva la responsabilidad de su revisión y consentimiento personal.

Límite inicial: 2 MiB, 30 páginas, fuentes PDF estáticas. No se piden contraseñas. Se rechazan por ahora formularios, anotaciones, adjuntos, acciones JavaScript, XFA y PDF cifrado. Esto es un límite conservador del piloto, NO compatibilidad universal con cualquier PDF. Los originales con esos elementos requieren una política posterior explícita; no se borran elementos del PDF a escondidas para forzar su firma.

El parser no ejecuta acciones ni activa enlaces, y el visor no usa iframe del proveedor. Tiene cancelación, límite de tiempo, área de canvas y limpieza al abandonar la vista. La revisión de estructura/huella no valida una firma criptográfica ni certifica el cálculo.

## Persistencia y adaptación

`072-firmar-personal-workspace.sql` agrega título documental inmutable y dos funciones de consulta restringidas. No crea solicitudes, no concede facultades, no registra certificados, no valida firmas ni emite documentos. El título genérico de transición no se interpreta como metadato completo: el circuito futuro de preparación debe proveerlo desde el documento real.

Los componentes anteriores `FirmarConnectedJourney`, el diario de intentos y el callback se reutilizan. La revisión de fuente y la acción vuelven a comprobar la misma versión/huella. Se mantienen `received_unverified` y `officialEmissionEnabled=false`. La ruta de revisión sólo devuelve el original preparado, nunca ofrece un candidato sin verificar como «original firmado».

No se registra aún `/firmas` en la navegación productiva ni se publica la rama. Habilitación de lectura del piloto: flag explícito, municipio de piloto y proveedor test. La consulta puede permanecer disponible sin credenciales de proveedor, pero la acción de firma no se ofrece lista hasta confirmar la configuración requerida. El comienzo de la firma vuelve a verificarla en el servidor.

## Ensayos

Pruebas unitarias: contratos de conteo/paginación/estado, fuente equivocada, cabeceras/origen/contexto, presupuesto de consultas, firma de respuestas, cancelación durante digest y límites del parser. Los casos de fuente son sintéticos y no contienen datos municipales.

PostgreSQL 16 descartable: varios firmantes y municipios, conteos completos, paginación, búsqueda literal, cancelación, revocación, fuente exacta, estados y permisos. Reutiliza el contrato mínimo de identidad del ensayo FD-P1; no equivale a la certificación del gateway municipal completo.

Recorrido integrado del nuevo visor: PDF estático sintético válido de dos páginas, canvas/texto de PDF.js real, transporte HTTP local real, consultas a PostgreSQL bajo rol restringido y continuación al servicio/callback sintéticos existentes. Una página vuelta del prestador nunca aparece como validación oficial. Gateway de cookies y presupuesto se simulan; proveedor real no se llama. Se conserva el ensayo anterior del retorno separado.

## Cierres pendientes

Preparación y aprobación de documentos/facultades desde los módulos; integración con toda la identidad real; migración controlada y rutas/navegación de piloto; habilitación institucional de FirmAR; validador independiente con confianza argentina, temporalidad, integridad, firmante y continuidad del documento; custodia/restauración; autorización municipal antes de emisión. Esta bandeja no inventa solicitudes para evitar esos pendientes.

Mantener #37 (relojes y autonomía salarial), #40 (Jurídica/Legislativa), #1 (emisión) y #41 (programa enterprise) vinculados. No cambiar haberes, marcaciones, usuarios ni certificados por integrar la vista de firmas.
