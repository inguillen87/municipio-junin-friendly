# Familia y escolaridad sobre altas propias

## Resultado del sprint 102

Después de confirmar un nuevo legajo municipal, Personal puede continuar con la carga de un hijo o hija sobre ese vínculo laboral. La ficha ofrece el mismo circuito para un alta propia y para un legajo importado: declarar el hijo, registrar escolaridad en papel o PDF, consultar su historial y exportar Excel.

El alta y la declaración familiar son operaciones independientes. Un alta confirmada no implica que el hijo haya sido guardado. La interfaz conserva el intento familiar hasta obtener una confirmación verificable y permite recuperar una respuesta perdida sin crear un segundo registro. El número de legajo no reemplaza la identidad del vínculo: dos contratos con el mismo número siguen separados.

## Procedencia y límites

La declaración propia guarda el registro de alta de MuniControl. No inventa una fila, fecha de corte o lote de GRH. Los familiares importados conservan su fuente y los certificados históricos conservan sus fechas originales. Una presentación manual tiene prioridad sobre la fuente histórica, incluso si deja el vencimiento sin informar.

Este circuito contempla hijos e hijas. No agrega cónyuge, prenatal, asignaciones, elegibilidad automática, liquidación o pago. El certificado es un registro administrativo; no constituye por sí solo una autorización salarial. El Excel identifica el origen del vínculo y conserva la separación entre presentación manual y datos históricos.

## Implementación y comprobación

La migración 102 amplía las tablas de familiares y escolaridad existentes con referencia a un alta nativa, manteniendo restricciones de procedencia, inmutabilidad y permisos. No crea otra base. La API familiar ofrece contexto, declaración y consulta del intento en versión 2. La lectura escolar versión 5 agrega procedencia; registro, historial, recuperación y descarga escolares conservan versión 3. Las lecturas históricas anteriores siguen disponibles.

La publicación requiere CI del commit exacto, pruebas reales aisladas en PostgreSQL 17 y 18, instalación atómica en PG18 y PG17, verificación independiente de datos y permisos, promoción a master y Vercel success. Las pruebas de interfaz usan identidades sintéticas con las APIs interceptadas: no guardan datos municipales. La aceptación por Personal sobre legajos y documentos reales se informa por separado.

## Pendientes del feedback y del reemplazo de GRH

- Identificar el reporte señalado por Noelia y completar filtros por tipo, incluido el bono cuando su clasificación de fuente esté comprobada. Las dos capturas recibidas muestran el alta de legajo; no identifican ese reporte.
- Resolver etiquetas contradictorias de tipos sin homologar códigos por su nombre ni sumar corridas de distintos períodos accidentalmente.
- Completar parámetros salariales aprobados, cálculo propio reproducible, conciliación, cierres, salidas bancarias y de organismos, firma y entrega. Este sprint no certifica esos procesos.
- Trasladar la captura de relojes a un host permanente y verificar una marcación nueva con la PC personal apagada. Oracle es una alternativa evaluada, todavía no una instalación certificada.

Los respaldos históricos se conservan. La sustitución operativa se acepta por proceso y población, con conciliación y evidencia de uso municipal.
