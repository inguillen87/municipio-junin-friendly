# Noelia · importación por formato GRH, no exportación de TXT

## Audios revisados
Se procesaron localmente los dos OGG, sin subirlos a servicios externos, con faster-whisper small en español. Las copias de Downloads coinciden en nombre y tamaño con los dos adjuntos de esta conversación. La transcripción es automática; no se usa para identificar hablantes por su voz. El usuario atribuye el primer mensaje a Noelia y el segundo a su respuesta.

- `WhatsApp Ptt 2026-09-29 at 19.25.35.ogg`: 59.838 bytes, 25,75 segundos, SHA-256 local `93b1a30c7728dfbbf3023219fced972480f8ca1dfa5290f6d64cddb4b325528f`. Noelia remite al módulo entregado: elegir un formato específico, menciona OSEP, seleccionar un TXT y cargar masivamente. Dice que encuentra carga manual/CSV, no ese recorrido por TXT.
- `WhatsApp Ptt 2026-09-29 at 19.26.48.ogg`: 35.484 bytes, 18,61 segundos, SHA-256 local `20ca8a163ee956be4eb7d50671b63e2f62e30a0d51388e895603b5b1b0284ca3`. Marcelo distingue generar/descargar un TXT de cargar un TXT. El primer audio describe la segunda operación: IMPORTAR.

La primera pasada acústica no reconoció inequívocamente las siglas OSEP/CSV. Una pasada de comprobación con ese vocabulario produjo ambas; se conserva el resultado original y la revisión en evidencia local. Aquí se parafrasea el pedido, no se presenta una transcripción literal certificada.

## Comparación funcional
El módulo correcto es el 3. En GRH/GRH Web el operador elige el formato conocido, el concepto, tipo/período y archivo; las capturas también muestran opciones de forzada, agrupación por DNI y vencimiento de fijos. El sistema interpreta el archivo según esa definición. Noelia no debería reconstruir diez columnas ni describir offsets para utilizar OSEP.

La versión publicada #63 acepta extensiones TXT/CSV y dispone de diez columnas, columnas explícitas, RETRO y posiciones por LEGAJO. El selector NO tiene los perfiles de OSEP por DNI ni resuelve DNI contra el vínculo de destino. Aceptar la extensión es una mejora distinta de cumplir este flujo. No se encontró evidencia suficiente para atribuir el reclamo a caché o un TXT concreto fallido.

Se reconsultaron en Neon, READ ONLY, las capacidades de la membresía activa de Noelia: incluye preparar/leer novedades, acceso nominal y lectura de personal. Este diagnóstico no exige ampliar sus permisos ni suplantar su sesión.

Para este problema, GRH/GRH Web son la referencia de importación. INSUTACO/INSULEGA de la integración con GAF y la captura/tiempos de GAT no se tratan como formatos TXT intercambiables. No se realizó una nueva navegación de GAF/GAT en esta ejecución.

## Otra diferencia concreta encontrada en los ejemplos entregados
Dentro de AGOSTO.zip existen tres ejemplos de OSEP, inspeccionados en memoria sin imprimir DNI/nombres/importes:
- `osep2608.txt`: 759 registros de 185 bytes.
- `osep 082026 - AGENTES MUNICIPALES.txt`: 731 registros de 206 bytes y una línea final de 25 bytes compuesta por tabulaciones y un espacio. No son 732 agentes.
- `osep 082026 - JARDINES MATERNALES.txt`: 111 registros de 206 bytes.

El escritor de novedades actual tiene un límite de 500 filas por lote. Por ello, incluso después de resolver DNI, un archivo de 759 no queda implementado sólo con un nuevo selector. Debe existir una operación integral o una división explícita, trazable e idempotente, sin guardar la primera parte y omitir el resto. Los diseños de 185 y 206 no se confunden ni se recortan; la fila final vacía debe tratarse explícitamente, no perderse durante una limpieza silenciosa.

## Desarrollo conservado en esta rama
`assets/payroll-grh-input.js` añade nueve definiciones de lectura con posiciones literales de formatoitem: Formato Junín, MAYOR y FULL de 13 posiciones y siete variantes OSEP de 185. El analizador mantiene DNI separado de legajo, distingue cantidad/importe, conserva ceros frente a nulos y reporta todos los errores sin devolver una carga parcial.

La lectura permite hasta 2.000 registros; NO cambia el límite del escritor. Hay pruebas sintéticas con 759 registros completos y del límite 2.000. La agrupación local requiere selección explícita y conserva todas las líneas de origen; no certifica todavía equivalencia con todas las reglas de agrupación del GRH. En decimales sin punto exige escala explícita: el descriptor de tipo 5 por sí solo no se presenta como una homologación de escala o regla salarial.

## Estado de integración y verificación
Se ejecutaron 104 pruebas focales del nuevo analizador y las regresiones de TXT/CSV/revisión, todas aprobadas, sin omitidas. No se ejecutó una nueva construcción completa ni se presenta la prueba sintética de 759 filas como importación real de OSEP.

La escritura que completaba el resolvedor del servidor fue rechazada por la herramienta antes de guardarse. No se aplicó una migración ni se creó un lote. Se retiró el SQL parcial del directorio activo y se conservó como `verification/114-payroll-grh-txt-import.incomplete.sql.txt`. No aplicar ese borrador. La posterior ampliación del análisis de estructura de las muestras OSEP también fue bloqueada y no se repitió por otra vía.

El analizador nuevo NO está integrado a la pantalla, al API ni a la lista de assets del build publicado. No hay despliegue funcional de OSEP en este incremento. No se alteraron permisos, haberes, firmas, relojes ni las ramas de recibos o módulos 8/10. El circuito completo se considera abierto.

## Aceptación pendiente para cerrar la incidencia de Noelia
1. Elegir el perfil conocido por su nombre, el concepto y período, sin reconstruir posiciones manualmente.
2. Leer el archivo completo con su diseño/codificación/escala comprobados; informar las variantes no compatibles, sin quitar dígitos o registros.
3. Resolver cada DNI en el servidor dentro del municipio, fuente y período autorizados; ambiguos o ausentes requieren revisión, nunca elegir el primer legajo.
4. Previsualizar todos los registros y su destino, cantidades e importes, más errores y agrupaciones explícitas.
5. Crear la carga completa con trazabilidad, revalidación e idempotencia, incluyendo archivos superiores a 500 filas; conservar por separado forzada y vencimiento de fijos.
6. Verificar el resultado con Noelia. Una prueba de lectura o el simple soporte de extensión TXT no cierra ese recorrido.
