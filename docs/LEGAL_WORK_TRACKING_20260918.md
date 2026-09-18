# J2.1 · Asuntos y actuaciones, circuito interno completo

## Alcance

Dentro de Jurídica se incorpora una bandeja con asuntos, responsable, referencia institucional, próximo paso y fecha de seguimiento manual. Permite registrar, asignar, modificar estado, cerrar y reabrir conservando cada actuación y su fundamento. El código AJ es interno: **no sustituye un expediente oficial ni declara un acto jurídico**. No usar para asuntos reservados; en esta primera versión los perfiles del Registro Normativo del municipio comparten el acceso.

Consulta con `legal.norm.read`; escritura con `legal.norm.register` y sesión MFA activa. No se agregan permisos a personas ni se exige un legajo laboral. La API y el SQL revalidan identidad, municipio, sesión y facultades. El responsable debe estar activo en el mismo municipio y tener acceso de consulta. Cambiar la asignación no cambia los permisos del área.

Dos tablas: cabecera y revisiones append-only. Claves compuestas impiden cruces de municipio. No hay DELETE de asuntos ni reescritura del historial. Cada confirmación exige versión esperada, motivo e idempotencia por actor. Cerrar/reabrir son actuaciones internas con las mismas garantías, no resoluciones oficiales.

## UX y uso

Entrada en `/juridica?area=asuntos` o el botón Asuntos y actuaciones de la cabecera de Jurídica. Carga del módulo React sólo cuando se solicita, sin duplicar el registro. Bandeja real, estado vacío sin fixtures, filtros aplicados, Mis asignados, contadores del mismo corte, cards responsivas y ficha con estado actual e historial. Una fecha superada sólo indica seguimiento interno pendiente, no incumplimiento legal.

Preparar → revisar → confirmar → ficha guardada. Pérdida de respuesta mantiene el intento en la ventana para consultarlo o reenviarlo con la misma clave. No hay reenvío automático ni se permite crear otro intento ocultamente. El piloto no promete recuperación de un formulario tras cerrar forzadamente el navegador; no conserva documentos o borradores en almacenamiento del navegador.

El guardado se protege con versión optimista, candado transaccional breve por municipio y verificación de capacidad. Máximo inicial 100 actuaciones por asunto, 20 filas por página, texto limitado; el límite bloquea nuevas versiones sin borrar antecedentes. No se guarda contenido binario ni se agregan servicios pagos.

## Verificación antes de publicación

El esquema se instaló en la rama QA existente, **no en producción**, y se ensayó con usuarios, roles y municipios sintéticos dentro de una subtransacción revertida. 22 comprobaciones aprobaron con los helpers reales de identidad de esa rama: creación/replay, cambio de contenido con clave repetida, lectura limitada, aislamiento municipal, cambio de responsable, concurrencia de versiones, cierre/reapertura, historia intacta, fechas inválidas y revocación. Los datos de prueba quedaron revertidos; el esquema QA permanece para reproducibilidad.

Se ejecutaron 34 pruebas Node nuevas y ocho grupos de navegador con código React/HTTP reales y almacenamiento/identidad sintéticos. El navegador local utilizó modo offline; el recorrido HTTP loopback y la regresión de la revisión actual se ejecutan en CI antes de promover. Las pruebas no hacen escrituras municipales reales.

La publicación debe incorporar la migración 076, su checksum y comprobación de tablas vacías/RLS/fachada autorizada; después un solo avance de master y cotejo de los assets. El archivo SQL por sí solo no acredita migración aplicada. La verificación productiva no crea asuntos de prueba con identidades de funcionarios.

## Fuera de este cierre

No se ejecutó la migración de septiembre ni la reparación 075 bloqueada previamente. La edición/baja/reingreso de legajos sigue en #43. Formalización del expediente, archivos privados por asunto, permisos reservados, pases con recepción, contratos, obligaciones automáticas y firmas son etapas posteriores de #40/#42. Esta entrega sí cierra el seguimiento interno persistido, no declara esos módulos terminados. Los documentos originales permanecen en el Registro Normativo; la referencia textual aquí no crea un vínculo documental validado.
