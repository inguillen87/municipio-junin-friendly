# ART Provincia desde liquidaciones propias

Este incremento atiende el reporte ART del módulo 2 de Noelia: Excel de todos los agentes liquidados con DNI, CUIL, sexo, días trabajados y sueldo de 993 + 995. Los datos municipales de los manuales y audios permanecen fuera del repositorio.

## Recorrido

1. En **Nómina → Días trabajados ART**, elegir un legajo propio y período. Registrar la cantidad según una constancia municipal, con fecha y fundamento. Otra persona revisa el antes y después y aprueba o rechaza. Las correcciones conservan las decisiones anteriores.
2. Completar el circuito propio de cálculo, confirmación independiente y cierre de la liquidación correspondiente.
3. En **Nómina → ART Provincia**, elegir período y tipos de liquidación. **Revisar ART completo** consulta todos los cierres propios vigentes del alcance.
4. Corregir las observaciones. **Descargar Excel ART completo** y **Descargar CSV de revisión completo** vuelven a verificar la fuente y el acceso. La búsqueda y las páginas sólo cambian la pantalla.

La declaración de días no modifica el programa salarial. Una propuesta pendiente tampoco habilita el reporte. Cero es un valor explícito; un campo vacío permanece sin informar. No se deducen días de horarios, horas, fechas de alta o baja, relojes ni porcentajes.

## Alcance y exactitud

La fuente es MuniControl: contratos propios, identidad propia verificada respecto de las capturas y cierres propios sin reapertura. Incluye las identidades adoptadas mediante el circuito propio publicado; no consulta GRH para producir el archivo. Un empleado creado sólo en MuniControl puede completar el recorrido.

Por cada agente suma los importes monetarios únicos de 993 y 995 de todos los tipos seleccionados. Mantiene centavos exactos; una fracción inferior al centavo bloquea la descarga, sin redondeo. Si falta uno de los valores, no presenta una suma parcial como sueldo.

Los días se cuentan una vez por agente y período. Si una persona tiene más de un contrato liquidado, se señala la ambigüedad y se bloquea el archivo completo hasta revisar el alcance; no se elige silenciosamente un contrato. Una identidad duplicada, sexo faltante, jurisdicción no documentada, días sin informar o aprobación desactualizada también impiden descargar. Un alcance sin cierres muestra cero agentes sin inventar errores ni archivo nominal.

El Excel contiene una hoja con las cinco columnas solicitadas y otra con procedencia, período, tipos y huellas de los cierres. DNI, CUIL, días y sueldo se escriben como texto exacto, sin fórmulas ni macros. El CSV contiene sólo esas cinco columnas. Son archivos para revisión: no certifican recepción, presentación al organismo, firma ni pago.

La API verifica el conjunto completo antes de transmitirlo mediante la respuesta en flujo de Node.js. Así no depende del límite de 4,5 MB de respuestas bufferizadas de Vercel. Mantiene una capacidad global de 32 MiB y responde con una incidencia global si se excede; no entrega subconjuntos. Referencias técnicas: [límites de Vercel](https://vercel.com/docs/functions/limitations) y [respuesta en flujo de Node.js](https://vercel.com/changelog/streaming-now-enabled-by-default-for-all-node-js-vercel-functions).

## Privacidad y recuperación

Cambiar el período, tipos, tarea o cuenta invalida la previa. Ocultar o cerrar la página retira los datos nominales. Perder acceso impide consulta y descarga. No hay persistencia nominal en localStorage ni envío a otra API.

Una respuesta incierta al registrar días conserva en memoria el contenido y la clave del intento original. **Consultar el mismo intento** recupera el comprobante por lectura. Sólo si no existe se habilita el mismo envío; cambiar archivo, destino o contenido no genera otra operación pendiente. Cerrar la página elimina ese estado en memoria.

Se usan las facultades ya existentes: lectura de personal y parámetros; preparación y revisión independiente de parámetros para los días; facultades nominales de lectura y revisión de nómina para ART. Este incremento no agrega perfiles ni asociaciones de permisos.

## Instalación y comprobación

SQL158 agrega una tabla vacía e inmutable para declaraciones y decisiones; SQL159 agrega la consulta completa de ART. El lote añade doce funciones, cinco fachadas de ejecución, sin adaptar funciones previas. Verifica hashes de las fuentes, prerrequisitos, metadatos, permisos, conservación antes/después, durabilidad y repetición sólo de verificación. No ejecuta decisiones o cálculos municipales.

La verificación automática usa PostgreSQL 17 y 18 desechables y empleados sintéticos creados por el escritor propio publicado. Recorre preparación, revisión independiente, reapertura, anulación, recálculo, confirmación y cierre, y prueba las pantallas compiladas de escritorio y móvil. La aceptación municipal de Noelia y la recepción del archivo por el organismo son comprobaciones posteriores, distintas de esta QA.
