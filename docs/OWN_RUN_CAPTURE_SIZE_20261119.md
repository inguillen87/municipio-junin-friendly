# Migración 246 · tope de la captura de una corrida propia

**Qué cambia.** `own_run_capture_v1` rechazaba toda captura de más de 4 MB (payload + cuerpo + 8 KB). La migración lo lleva a 32 MB, el mismo tope que ya tiene la columna `payload` de `own_payroll_run_capture` y que ya admiten los resultados. No cambia el límite de 1.000 capturas ni ningún otro control.

**Por qué.** Cada captura incrusta el estado completo del programa y del maestro propio, sin filtrar por convenio. La captura de octubre del convenio 1 (81 personas) pesa 2,65 MB, y 1,63 MB son el programa. Con un segundo convenio en el programa ninguna captura entra, tampoco la del convenio 1. Medido el 19/11/2026 en una copia de ensayo con el convenio 6 agregado: capturas de 7 a 8 MB.

**Cómo.** Mismo mecanismo que la 245: reemplazo exacto con huella previa, cantidad exacta de apariciones y huella resultante. La captura está fijada por huella en `municipal_adoption_ready_v1` y en el atestador; el atestador fija también la de `municipal_adoption_ready_v1`, y las dos familias fijan la del atestador. Todo se recompone en el mismo paso y las familias tienen que seguir completas.

**Verificación.** 19/11/2026, copia nueva de la base de producción: instalación en una transacción, las dos familias completas, la captura con la huella esperada y una segunda corrida rechazada con `OWN_RUN_CAPTURE_SIZE_ALREADY_INSTALLED`. En la copia de ensayo de octubre, con la misma recomposición, la captura de los 292 contratos del convenio 6 se guardó y se calculó.

**Alternativa no elegida.** Que la captura guarde sólo la parte del programa y del maestro del convenio de la tanda. Mantendría las capturas chicas, pero cambia el contenido de la captura y lo que verifican los cálculos; queda para una revisión del motor.

**Instalación en producción.** Pendiente. Es reversible sólo con otra migración; no escribe datos.
