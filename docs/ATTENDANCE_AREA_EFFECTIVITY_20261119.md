# Vigencia de área de los contratos adoptados · migración 244

## El problema

La asistencia por áreas asigna cada marcación al área a la que pertenecía el contrato **ese día**. Para un contrato con alta propia, esa fecha sale del alta. Los contratos adoptados desde GRH (hoy, todos) conservan la procedencia de la adopción, que prueba la titularidad pero no desde qué día pertenecen a su área: `attendance_area_history_v1` respondía `AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED` y ninguna persona aparecía en ningún área.

El diseño original (`docs/ATTENDANCE_AREA_HISTORY_20261116.md`) pedía «una fuente de vigencia diaria explícita con otro contrato versionado». Es esta.

## Qué hace

Una **declaración municipal de vigencia**: el municipio declara que, desde una fecha, cada contrato adoptado activo pertenece al área que figura en su legajo.

- **Dos personas.** Una prepara (capacidad `employee.record.propose`) y otra distinta aprueba (`employee.record.approve`). Se compara membresía, persona y correo, en la función y también en la tabla. Quien preparó puede retirar su propia preparación.
- **Lo que se declara no se escribe a mano.** La persona elige la fecha, el alcance y la referencia documental. El servidor arma la lista y sella, por contrato, el área del legajo y el punto de su cadena de rectificaciones.
- **Alcances.** «Los que todavía no tienen declaración vigente» (para completar) o «todos los que están en condiciones» (reemplaza la fecha de cada uno).
- **Inmutable.** Propuesta, lista y decisión son sólo de alta. No hay edición ni borrado.
- **Sin datos personales en pantalla.** La lectura devuelve totales por área, exclusiones contadas y huellas; nunca un contrato, un legajo o un nombre.

Pantalla: **Personal → «Vigencia de área de los contratos adoptados»**.

## Reglas de resolución (`attendance_area_history_v2`)

1. Un contrato con alta propia recibe exactamente la respuesta de v1.
2. Un contrato adoptado se resuelve sólo si, en este orden: su cadena está probada (imagen aprobada de la adopción → rectificaciones contiguas → fila actual, y ciclo laboral); el día pedido cae en un intervalo laboral activo; existe una declaración aprobada que lo incluye; el área no cambió después del sello; y el día pedido es igual o posterior a la fecha declarada.
3. Rige **la última declaración aprobada** que incluye al contrato. Declarar de nuevo permite corregir una fecha; por eso los días anteriores a la nueva fecha dejan de estar acreditados para ese contrato.
4. Una rectificación posterior que cambie el área (aunque después vuelva) exige una declaración nueva: `AREA_HISTORY_EFFECTIVITY_REQUIRED`.
5. Nada se infiere hacia atrás: antes de la fecha declarada responde `AREA_HISTORY_DECLARATION_NOT_EFFECTIVE`.

Los cuatro consumidores instalados (`attendance_area_population_v1`, `attendance_area_workdays_read_v1`, `attendance_expected_devices_effective_v1`, `attendance_expected_devices_subject_v1`) pasan de v1 a v2. La migración compara la huella exacta de cada cuerpo antes y después; cualquier diferencia detiene la instalación sin cambiar nada.

## Quiénes quedan fuera y por qué

| Motivo | Qué hacer |
|---|---|
| Legajo sin repartición o sin sector completos | Completarlo con una rectificación de legajo y declarar después con el alcance «los que faltan». |
| Alta anulada | Nada: no corresponde declararle área. |
| Contrato inactivo | Nada. |
| Antecedente que no se pudo verificar | Revisión técnica antes de declarar. |
| Alta propia | Nada: su área rige desde el alta. |

## Ensayo

Sobre una copia aislada de la base operativa, en orden 243 → 244, con `plpgsql_check` sin hallazgos en las funciones nuevas:

- 787 contratos declarables en 124 áreas; 61 sin repartición completa y 3 altas anuladas quedan fuera.
- Antes de declarar: 848 `AREA_HISTORY_DECLARATION_REQUIRED`. Después de aprobar: 787 resueltos desde la fecha declarada y bloqueados el día anterior.
- El área más numerosa devuelve sus 121 contratos por la función de población ya instalada, en 0,7 s.
- Rechazos verificados: misma persona, versión cambiada, sin capacidad, fecha futura, segunda preparación pendiente, clave repetida con otro contenido, inserción directa sin pasar por la función, edición, borrado y vaciado de las tablas, y transacción que no sea READ COMMITTED.
- Las fachadas rechazan una sesión que no existe.

## Lo que esta migración no resuelve

- La población de un área sigue informando `AREA_HISTORY_UNRESOLVED` mientras existan contratos sin área acreditada (los 61 sin repartición, las altas anuladas) o contratos de GRH no adoptados. Es un aviso de que la dotación no está certificada completa; los contratos acreditados sí aparecen.
- Después de la vigencia, cada contrato necesita su declaración de relojes esperados (`EXPECTED_DEVICES_DECLARATION_REQUIRED`), que ya tiene su pantalla.
- Un cambio de área con fecha propia (sin perder los días anteriores) necesita un escritor de cambios con fecha efectiva. No existe todavía.

## Reversa

No borra datos. Para volver atrás se devuelve a los cuatro consumidores la llamada a v1 (el mismo reemplazo, invertido, con las mismas huellas); las tablas y declaraciones quedan como historia.
