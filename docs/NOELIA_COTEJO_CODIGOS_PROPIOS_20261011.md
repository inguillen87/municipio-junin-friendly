# Módulo 6: cotejo completo de códigos propios

En **Nómina → Reglas de cálculo**, abrir **Cotejar todos los códigos del maestro con las reglas**, elegir período y tipo, y revisar el conjunto completo. La consulta usa el maestro y programa aprobados recibidos por la API existente. No incorpora el borrador ni evalúa fórmulas.

Por convenio y código distingue regla vigente, uso como entrada, valor auxiliar declarado, ausencia de ambas referencias, definición inactiva y vigencia fuera del período. Conserva códigos de conceptos y auxiliares separados, incluidos antecedentes con códigos auxiliares en el espacio antiguo. Las escalas son fuentes de entrada; se cuentan por separado y no se presentan como fórmulas faltantes. Sólo se consideran entradas usadas por reglas del mes y tipo elegido.

Una coincidencia describe una referencia: no certifica compatibilidad salarial, suficiencia del programa ni homologación municipal. Si el programa corresponde a otra revisión del maestro, esa diferencia queda visible. La ausencia de un programa o maestro aprobado tampoco se presenta como revisión salarial sin observaciones. Las decisiones siguen en el circuito independiente existente.

La descarga CSV es voluntaria y contiene todas las definiciones cotejadas, aunque haya búsqueda o paginación. Incluye período, tipo, revisiones, convenio, clase de código, código, vigencia, estado y acción sugerida. Excluye personas, nombres, importes, fórmulas, referencias libres y UUID. El archivo no es una planilla de liquidación ni una declaración fiscal.

Cambiar período o tipo retira el cotejo y exige revisarlo nuevamente. Actualizar las fuentes, ocultar la página, salir de la tarea o retirar acceso elimina la vista. Una consulta tardía no la restaura. Durante un envío sin confirmar no se habilita un nuevo cotejo ni descarga; el cuerpo y la clave del envío permanecen intactos. No hay almacenamiento del cotejo en el navegador ni llamadas a APIs adicionales.

En escritorio se muestra una tabla paginada; en móvil, cada código presenta convenio, vigencia, estado y acción en una tarjeta. Se conservan teclado, objetivos de interacción de 44 píxeles, página completa y descarga íntegra. Las pruebas usan fuentes sintéticas y el handler existente; no hay migración, nuevos permisos ni operaciones municipales reales.

Implementación, pruebas, CI, publicación y aceptación se acreditan por separado en el resultado privado del sprint.
