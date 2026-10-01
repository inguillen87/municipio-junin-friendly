# Novedad mensual sobre un alta propia de MuniControl

## Resultado de este incremento

Una persona dada de alta en MuniControl puede seleccionarse por su vínculo laboral exacto, preparar una novedad individual mensual, enviarla a revisión independiente y exportarla para control. El alta ofrece un enlace directo al circuito. Se conserva la misma pantalla de Novedades, sus permisos y sus lotes históricos.

La identidad se verifica por UUID del contrato y registro de alta. El número de legajo es una referencia visible: no alcanza para elegir entre personas o vínculos. La novedad guarda la identidad verificada al prepararla; un cambio posterior bloquea nuevos envíos, aprobaciones y exportaciones, pero permite cancelar o rechazar según los permisos originales. No se reasigna una novedad a otra persona.

El envío guarda una clave y un contenido inmutables hasta recibir confirmación. Si se pierde la respuesta, el reintento consulta la misma operación. Los recibos nativos conservan el estado y las fechas de su evento original aunque el lote avance después. La pérdida de permisos retira los datos consultados de la pantalla; una respuesta tardía no los repone.

## Revisión completa y confirmación · incremento del 01/10/2026

Antes del primer guardado se presenta la persona y su legajo, período, tipo mensual, concepto, centro de costo, mes de ajuste, unidades, importe manual, movimiento, instrumento legal, observación y modo forzado. La confirmación del operador comienza desmarcada y corresponde a una copia inmutable de esa revisión. Editar la novedad, cambiar el vínculo, ocultar la página o retirar acceso invalida la revisión visible. Se distinguen cantidades ausentes de cero y se muestran decimales exactos, incluidos importes mayores al rango seguro de los números de JavaScript.

Al confirmar, el cliente vuelve a consultar el ámbito y permisos actuales y la identidad del mismo UUID; si cambian, no inicia el guardado. La comprobación de identidad no busca otra persona con el mismo legajo. Cuando cambia la identidad consultada conserva los campos de la novedad y exige una nueva revisión. El servidor sigue verificando identidad y autoridad en la escritura existente.

La fachada del servidor y el navegador comprueban todos los campos del recibo, además del vínculo, identidad, período, estado y efectos. Sólo admiten las normalizaciones originales: decimales equivalentes por `trim_scale` y saltos de línea normalizados. Una confirmación distinta no se presenta como éxito; conserva el intento incierto, con el mismo cuerpo y clave. Cambiar de membresía no descarta ni recupera automáticamente ese intento; sólo el ámbito original y sus permisos pueden reintentarlo. Cerrar sesión elimina los datos volátiles.

Este incremento reutiliza la migración 101 y sus fachadas; no instala SQL nuevo, amplía tipos de liquidación o cambia el límite nativo de una fila mensual. Su evidencia separa pruebas locales, CI, publicación y aceptación municipal. No convierte la aprobación de control en cálculo, pago o cierre de haberes.

## Alcance y límites

- Altas propias: una fila, carga individual, tipo mensual. Cantidades exactas e importe opcional; ausencia de importe y cero siguen siendo distintos.
- Segunda persona para aprobar; el preparador no puede aprobar su propia solicitud.
- CSV y Excel nativos identifican origen, contrato, registro, fecha y alcance administrativo. Las exportaciones históricas v1 conservan sus bytes.
- La aprobación sólo habilita exportación de control. No calcula salarios, contabiliza, paga, crea una cuenta ni modifica GRH.
- No homologa conceptos, fórmulas, jornadas, elegibilidad ni importación bancaria. Las observaciones contra GRH publicado siguen siendo observaciones de fuente.

## Contrato y despliegue

La migración 101 agrega dos columnas a la fila existente: registro nativo e identidad declarada. Los lotes v1 conservan ambos campos nulos y su contrato anterior. No hay otra base ni otro libro de novedades.

Las fachadas v2 exigen versión explícita en la API. Los consumidores v1 no pueden mutar o exportar lotes nativos v2. Se conserva el preparador v1 compuesto por 026/029/032/097, el contexto de autoridad y el resolvedor de identidad 093. Se activa RLS sin políticas en las cuatro tablas mensuales; el runtime mantiene acceso exclusivamente a través de las fachadas autorizadas.

El release requiere CI del commit exacto con navegador y PostgreSQL 17/18, luego instalación atómica de 101 en PG18 y PG17, preservación de datos y permisos, promoción a master, Vercel success y verificación de los recursos publicados. La prueba de navegador intercepta las APIs y no es aceptación municipal. Los registros de instalación y publicación se conservan privadamente, sin credenciales ni nombres de personas en la documentación pública.

## Siguiente secuencia hacia octubre

1. Extender familia y escolaridad al contrato propio, conservando procedencia y decisiones administrativas.
2. Completar catálogos, escalas, fórmulas y vigencias aprobadas para los convenios requeridos; documentar cada regla con su fuente.
3. Construir cálculo reproducible y conciliación de haberes sobre esos parámetros, con cierre y correcciones auditadas.
4. Homologar salidas bancarias y de organismos, integración contable y firma/entrega documental.
5. Resolver incidencias y aprobación de asistencia; trasladar los lectores al servidor municipal y demostrar una marcación nueva con la PC personal apagada.

La sustitución de GRH se acepta por proceso y población, con resultados conciliados y usuarios responsables. Terminar este incremento no certifica el motor salarial ni habilita retirar respaldos históricos.
