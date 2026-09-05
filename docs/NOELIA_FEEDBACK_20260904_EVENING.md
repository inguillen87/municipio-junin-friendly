# Feedback de Noelia y alcance del siguiente incremento

## Fuentes revisadas completas

Los tres audios del 04/09/2026 se procesaron localmente en español. Las grabaciones suman aproximadamente 2 minutos 33 segundos. La transcripción automática es apoyo para identificar tareas; términos dudosos se contrastan con los archivos y no se convierten en reglas de cálculo.

| Audio | Duración aproximada | SHA-256 |
|---|---:|---|
| WhatsApp Ptt 2026-09-04 at 20.23.21.ogg | 80 s | ed632bdd24c17e1d67fa4eae327ee5d9f1ef3dd2f3a48eb452f96dc2c8601500 |
| WhatsApp Ptt 2026-09-04 at 20.25.00.ogg | 50 s | 8c98ba612036578fbd080a2941bbf5d764ffab9aa40970c8cd401f711794245c |
| WhatsApp Ptt 2026-09-04 at 20.28.06.ogg | 23 s | b86b625a91160e3ad07a865fe0d3c91664f6bb3a3cbbb08ea1c7f2bb1e202713 |

No se enviaron los audios a un servicio de transcripción externo ni se almacenaron en Neon. Los originales permanecen en Downloads.

## Correcciones al relevamiento general

1. **No priorizar UPCN para la operación de Noelia.** La existencia de ese formato en GRH no implica que lo utilice. Ella limita las prioridades a cinco familias: OSEP, Mayor/Full, Retro, Colegio Farmacéutico y Formato Junín.
2. **OSEP entrega archivos con varios descuentos distribuidos en columnas.** Se necesita identificar las columnas correspondientes al concepto, no interpretar todo el archivo como un importe único. Formato de entrada y exportación OSEP son tareas distintas.
3. **Mayor/Full pertenece al circuito salarial.** Noelia menciona los conceptos 44 y 95, coincidentes con la referencia de mayor dedicación y full time del catálogo observado. La automatización desde personal/relojes requiere una tabla de porcentajes y condiciones que todavía enviará. No equivale a libro mayor ni integración GAF.
4. **Cláusula de garantía: Excel → TXT → RETRO.** El audio menciona el código 195. La carpeta suministrada contiene `GARANTIA PROV (195)/195082026.txt` y planillas identificadas con el mismo código, lo que corrobora la referencia operativa. No certifica la fórmula de garantía ni quién paga cada componente.
5. **Presentismo/tardanzas y garantía requieren reglas adicionales.** La grabación menciona estos efectos y una planilla con fórmulas. No se implementarán descuentos salariales ni fórmulas nuevas a partir de una frase ambigua; quedan pendientes la tabla, vigencia, población, redondeo y casos de comparación.
6. **AGOSTO es el archivo mensual de trabajo completo.** Incluye liquidación mensual, suplementarias, acreditación, ART, controles y comprobantes. No es únicamente una muestra de fórmulas ni el respaldo de una sola corrida.

El pedido del usuario sitúa expresamente la investigación interior de GAF para cuando el municipio habilite el acceso. Se continúa con GRH/GRH Web y herramientas propias sin presentar GAF como conectado.

## Caso RETRO contrastado con un archivo real

Fuente: ZIP `AGOSTO-20260902T125117Z-1-001 (1).zip`, entrada `AGOSTO/LIQUIDACION MENSUAL/GARANTIA PROV (195)/195082026.txt`.

- 68 filas no vacías.
- Todas tienen 18 caracteres de contenido, con terminación CRLF.
- Las primeras ocho posiciones contienen un legajo numérico.
- Las siguientes diez contienen siete dígitos, punto decimal y dos decimales.
- Las posiciones coinciden con la configuración RETRO consultada en GRH Web: LEGAJO 0/8 e IMPORTE 8/10.
- No se imprimieron ni incorporaron a Git documentos, legajos o importes del archivo.

Esto permite admitir **ese diseño concreto** sin inferir centavos implícitos ni la fórmula que produjo el importe. El concepto se selecciona expresamente en MuniControl: no se deduce del nombre del archivo. Período y tipo de liquidación también deben quedar explícitos.

## Incrementos definidos

### A. Cargar TXT RETRO en la bandeja de novedades

Reutilizar el circuito actual de previsualización, preparación, aprobación y exportación. Incorporar la lectura del TXT original además del CSV actual. Explicar filas rechazadas y bloquear el lote completo si una fila no cumple el diseño, sin descartar datos silenciosamente.

No agregar una nueva pantalla, no modificar permisos, no escribir en GRH y no calcular la garantía. Las reglas de negocio y conflictos con novedades existentes continúan verificándose en el servicio actual.

### B. Descargar carpeta de respaldo de un cierre aprobado

Empaquetar la copia PDF existente, conciliación y referencias de fuentes de **la misma corrida y versión**. Mantenerla dentro del cierre actual con una sola acción visible y descargar sólo después de consultar nuevamente el detalle autorizado.

Esta primera carpeta **no es el archivo mensual completo de Noelia**: no contiene automáticamente los originales de ART, bancos, OSEP ni las constancias oficiales. No se mezclarán documentos locales por la mera coincidencia de mes y jurisdicción. El vínculo entre cada archivo y la corrida debe construirse antes de ampliar el paquete.

## Secuencia posterior

1. Validar RETRO con el área usando el archivo original, sin repetir conversiones.
2. Homologar una primera entrada OSEP utilizada por Noelia y avanzar por las cinco familias prioritarias, no por todos los nombres del catálogo.
3. Incorporar las tablas de Mayor/Full y garantía cuando lleguen, con simulación y comparación contra el Excel.
4. Ampliar el respaldo a una carpeta mensual vinculada a fuentes, corridas y constancias.
5. Investigar GAF cuando haya acceso y una definición del intercambio contable.

El estado de implementación, pruebas y publicación se informa separadamente. Este documento registra evidencia y alcance, no es por sí solo una certificación de Producción.

## Comprobación del incremento implementado

- RETRO: lector estricto, centavos enteros, detección de duplicados, preservación del archivo ante errores y previsualización integrada al circuito actual. El archivo autorizado de agosto pasó con 68/68 filas, sin subirlo a un servicio externo ni guardar el lote. Las pruebas automatizadas usan datos sintéticos.
- Carpeta de respaldo: ZIP sin dependencias nuevas con la misma copia PDF existente, `conciliacion.csv`, `fuentes.csv` y `LEEME.txt`. No copia originales ni crea una presentación oficial. Reconsulta la autorización y versión antes de descargar, igual que la copia PDF.
- No se modificaron API, permisos, esquemas ni migraciones. Las nuevas operaciones de preparación siguen usando el servicio de novedades ya existente.
- La revisión visual de RETRO cubrió escritorio de 1280 px y móvil de 390 px; se corrigió el alineado de la etiqueta de previsualización en móvil.
- Las pruebas focales cubren filas inválidas, conceptos explícitos, importes grandes, cambio de sesión, autorización revocada, versión obsoleta, descarga y errores recuperables.

La generación local del ZIP no guarda una carpeta en Neon. La reconsulta al descargar usa el servicio actual; esto no significa ausencia absoluta de consumo de red o cómputo.
