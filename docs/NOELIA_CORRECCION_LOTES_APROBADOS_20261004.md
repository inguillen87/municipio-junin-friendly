# Corrección de lotes aprobados · módulo 5

Estado de preparación del candidato, 04/10: pantalla, modelo, API y SQL121 implementados y probados localmente con datos sintéticos. **La preparación no acredita instalación o publicación.** La producción de partida conserva la anulación administrativa de #100. No se declara cerrado el módulo 5 completo ni el cálculo del módulo 7. El resultado posterior del despliegue debe comprobarse contra el mismo commit.

## Recorrido

1. Consultar los lotes aprobados y elegir el conjunto completo. La selección se conserva entre páginas y al buscar; un límite de 100 lotes o 5.000 filas rechaza el conjunto sin recortarlo.
2. Elegir expresamente los campos que se modificarán en todas las filas: período, tipo, concepto, centro de costo, mes de ajuste, unidades, centavos, movimiento, instrumento legal, observación y modo forzado. Los campos restantes mantienen sus valores. Retirar un valor admite ausencia sólo en campos opcionales; cero se informa como texto exacto.
3. Obtener una previa de lectura verificada por el servidor, con antes/después, identidad conservada y validaciones para cada fila. Consultar o previsualizar no crea una propuesta.
4. Confirmar y enviar una propuesta. Se releen todo el conjunto, permisos, ámbito, identidades y previa antes del primer envío. Hasta la revisión siguen vigentes las aprobaciones y valores originales.
5. Otra persona autorizada, distinta del proponente y de los preparadores originales, aprueba o rechaza el conjunto. Aprobar cambia todos los valores elegidos en una misma transacción y conserva su historia; rechazar no modifica los originales.

Las novedades propias mantienen el escritor publicado de una fila Mensual. La selección mixta no convierte automáticamente otro tipo, identifica otra persona ni crea un contrato. Los lotes históricos conservan los tipos admitidos por el contrato existente. Una corrección que crea destinos repetidos o deja alguna fila sin unidades ni importe se rechaza íntegramente.

## Conservación y acceso

- La vista se retira al ocultar la página o cambiar cuenta, sesión, fuente o permisos. No se guarda en localStorage ni se envía a otra API.
- Un envío incierto bloquea otras escrituras. Recuperar consulta sólo su comprobante; si falta, un segundo clic voluntario reenvía exactamente el cuerpo y clave originales. Cambiar de membresía no permite sustituir ese intento.
- Las propuestas, decisiones y comprobantes son inmutables. Los guardas de filas y lotes exigen una revisión persistida en la misma transacción; un identificador o configuración de sesión no los autoriza.
- Los comprobantes anteriores de crear, presentar y aprobar mantienen todos sus valores y fechas. Sólo las ramas de recuperación de los dos escritores existentes consultan los originales conservados; no se agrega otro escritor o resolvedor.
- Los lotes corregidos continúan disponibles para consulta, exportación administrativa, segunda corrección y anulación administrativa publicada en #100.

## Validación local y cierre pendiente

Pruebas PostgreSQL reales: 680 controles en cada versión 17 y 18, incluyendo los 537 anteriores sin cambios. La corrección recorre 26 lotes y 39 filas sintéticas; una falla inyectada después del primer lote revierte todo. Se comprueban cantidades exactas, nulos/ceros, rechazo de decimales excedentes y destinos duplicados, comprobantes originales después de dos correcciones y anulación, aislamiento y permisos de las fachadas. Se agregaron seis controles de instalación; no se retiró ninguno anterior.

Navegador local: 20 recorridos con handler HTTP y fachada reales, respuestas SQL sintéticas y todas las APIs interceptadas. La selección completa compara 793 filas; se verifica revisión independiente, búsqueda, revocación, visibilidad, reintentos y controles de teclado a 320/390 px. Se mantienen además 14 recorridos de anulación, 22 de decisiones y 38 de novedades propias. Son pruebas de software; no aceptación de Noelia ni operaciones municipales.

El paquete conservador SQL121 está probado en PostgreSQL local 17/18. Conserva todas las tablas, filas, secuencias, permisos, roles, esquemas, vistas y metadatos anteriores. Se auditan por separado las nueve adaptaciones de funciones, los cuatro CHECK ampliados, las dos columnas opcionales de historial y las tres tablas nuevas vacías. Rechaza reinstalación, destino equivocado o deriva de fuente, controles o permisos. La generación no conecta ni ejecuta SQL. La auditoría local dentro de una transacción no acredita durabilidad municipal: ésta exige una lectura separada después de instalar el candidato comprometido.

También pasaron las precondiciones exactas en lectura en ambas bases existentes. Pendiente antes de publicación: CI del candidato exacto, instalación revisada y conservación/durabilidad municipal, comprobación del mismo SHA y archivos en producción. No hubo instalación municipal, push, merge o deploy de esta corrección.

No calcula, anula, confirma, cierra ni paga haberes. No resuelve OSEP completo, el límite de 500 del importador, los frentes rechazados, la operación física de relojes o las firmas. La autonomía integral continúa en el [plan de cierres](PLAN_CIERRES_MUNICONTROL_20260930.md).
