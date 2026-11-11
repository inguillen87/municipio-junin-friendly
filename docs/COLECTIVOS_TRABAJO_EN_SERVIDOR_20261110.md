# Jornada y antigüedad: conjuntos recuperables en el servidor

## Comportamiento

La revisión y el registro de un archivo completo se guardan en PostgreSQL. La página envía el archivo una vez, consulta el avance y confirma una comparación completa identificada por su hash. Cerrar, minimizar o cambiar de pantalla no cancela el trabajo guardado.

La preparación no registra propuestas ni decisiones. Cuando termina, el conjunto queda en `prepared`. La confirmación explícita inicia `running`. El servidor procesa bloques pequeños y conserva cada comprobante canónico en la misma transacción que su avance. Una entrega repetida de la cola no repite un bloque ya confirmado.

Estados: `preparing`, `prepared`, `running`, `paused`, `complete`, `cancelled`. La interfaz puede recuperar los conjuntos de la misma cuenta y ámbito sin volver a subir el archivo. Las comparaciones viajan en páginas de hasta 200 registros; sólo se habilita la confirmación después de recibir toda la población con el mismo hash. La paginación visual y la búsqueda no reducen el alcance aprobado.

## Autorización y exactitud

- El alta del trabajo conserva el contexto obtenido de una sesión autenticada de la aplicación. El trabajador no crea identidades ni sesiones.
- Cada bloque vuelve a verificar sesión, membresía, persona, permisos, áreas, fuente y padrón. Una sesión vencida o revocada pausa la ejecución; reanudar requiere una sesión válida del mismo actor y ámbito.
- La preparación y la decisión siguen siendo independientes. Los escritores originales de jornada y antigüedad mantienen sus controles de persona, correo y membresía.
- Los comandos individuales, sus claves y sus comprobantes permanecen intactos. El trabajo sólo coordina su ejecución.
- Un error dentro del bloque revierte los eventos y el avance de ese bloque. Los bloques anteriores permanecen confirmados. Detener los pendientes tampoco revierte aprobaciones anteriores.
- Un valor desconocido permanece `null`; no se convierte en cero. Los valores decimales se conservan como cadenas exactas.
- Esta operación declara parámetros. No calcula ni paga haberes.

## Componentes

| Componente | Función |
| --- | --- |
| Migración `225-own-collective-jobs.sql` | Registro durable, población y autoridad vinculadas al trabajo, comparación, confirmación, bloques y comprobantes |
| `/api/internal-own-collective-jobs` | API autenticada de creación, consulta, confirmación, reanudación y detención |
| `/api/internal-own-collective-worker` | Consumidor privado del tópico `own-collective-jobs` |
| `/api/internal-own-collective-dispatch` | Recupera trabajos que quedaron pendientes de publicación en la cola |
| `assets/own-collective-jobs-panel.js` | Interfaz común de Jornada y Antigüedad, con datos privados retirados al ocultar la vista |

Los mensajes de la cola contienen únicamente el identificador del trabajo y su generación. La generación impide que una entrega antigua avance un trabajo que fue pausado, reanudado o detenido. El trabajador confirma el bloque antes de publicar la siguiente generación; si falla esa publicación, la reentrega y el barrido periódico recuperan el trabajo.

El consumidor depende del aislamiento de `queue/v2beta`: esta ruta no debe publicarse como una función HTTP común. El SDK solo no reemplaza ese aislamiento. El despachador programado exige un `CRON_SECRET` de al menos 32 caracteres y compara su credencial en tiempo constante. El secreto nunca forma parte del repositorio ni del archivo municipal.

## Instalación y publicación

1. Ejecutar las pruebas de API, cola, cliente, PostgreSQL y navegador con datos sintéticos. Comprobar que la aplicación completa compila.
2. Confirmar el proyecto, la rama y la base de destino; cotejar los hashes y permisos de los lectores y escritores existentes con la inspección previa. Aplicar la migración 225 en una transacción con límites de espera. La migración rechaza objetos preexistentes y no reemplaza escritores ni controles de IAM.
3. Configurar el secreto del despachador y verificar que el plan del proyecto admite la programación declarada. No cambiar de plan automáticamente.
4. Publicar el commit integrado, con las tres funciones, el trigger privado, el barrido periódico y ambos archivos de interfaz incluidos por `build-friendly.mjs`.
5. Verificar dominio, commit servido, protección de la ruta del trabajador y rechazo del despachador sin credencial. Un despachador sin trabajos debe responder con contadores en cero.
6. Crear y confirmar los conjuntos mediante la sesión auténtica de la persona autorizada. Verificar al finalizar el número de comprobantes y su correspondencia con los eventos individuales. Un despliegue correcto, por sí solo, no constituye la aprobación de archivos municipales.

Para revertir la interfaz, primero detener por el circuito autorizado los trabajos que deban dejar de ejecutarse y conservar sus comprobantes. No borrar las tablas de trabajos ni el historial de propuestas y decisiones. El regreso a una versión anterior de la página no debe interpretarse como una reversión de decisiones registradas.

## Verificación reproducible

```sh
node --test tests/own-collective-jobs-*.test.js
node --import ./scripts/lib/project-chromium.mjs scripts/verify-collective-working-time-ci.mjs --output=verification/collective-server-browser
node scripts/verify-own-collective-jobs.mjs --psql /ruta/absoluta/a/psql --output /ruta/absoluta/a/result.json
```

El verificador SQL exige PostgreSQL 17 en un destino local de QA expresamente identificado. Utiliza IAM y fuentes sintéticos y ejecuta los lectores y escritores canónicos originales; no mide la latencia de producción. La prueba de navegador usa una fuente HTTP sintética persistente fuera de la página y comprueba el cierre y la recuperación real de pestañas. Sus contadores no representan aprobaciones municipales.

Las pruebas deben cubrir publicación fallida después del commit, entrega repetida y antigua, confirmación con hash incorrecto, cambios de población y permisos, decisión por el mismo autor, interrupción dentro de un bloque, recuperación con sesión nueva y conservación de valores desconocidos. Las mediciones locales se reportan como tales.
