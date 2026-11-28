# La corrida propia rechazaba toda novedad real · migración 245 · 19/11/2026

## Qué pasaba

Antes de calcular, la base controla que cada lote nativo de novedades tenga doble revisión: quién lo preparó, quién lo aprobó, que quien decide sea la última aprobación y que membresías y personas sean todas distintas. Ese control vive en cuatro funciones:

| Función | Rechazo |
|---|---|
| `own_run_declared_adjustments_capture_v1` | `DECLARED_ADJUSTMENT_REVIEW_REQUIRED` |
| `own_run_quantity_only_expected_inputs_v1` | `QUANTITY_ONLY_REVIEW_REQUIRED` |
| `own_run_capped_sources_v1` | `CAPPED_REVIEW_REQUIRED` |
| `own_run_monthly_forced_capture_check_candidate_v1` | `OWN_RUN_MONTHLY_FORCED_REVIEW_REQUIRED` |

Las cuatro exigían además que el identificador de persona de cada actor tuviera formato RFC 4122 versión 1 a 5. En un municipio adoptado los identificadores de persona son derivados y no llevan versión ni variante RFC. Medido en la base operativa (sólo totales): el 92 % de los identificadores de persona no cumple ese formato y **ninguno** de los actores que ya prepararon o aprobaron algo lo cumple.

Consecuencia: cualquier período con un lote nativo de novedades aprobado no se podía capturar. Octubre tiene dos (7 renglones, cada uno preparado y aprobado por dos personas distintas) y la captura respondía `DECLARED_ADJUSTMENT_REVIEW_REQUIRED`, que se lee como «falta revisar» cuando no faltaba nada.

Las pruebas no lo detectaban porque usan identificadores aleatorios versión 4, que sí cumplen el formato. El resto de la aplicación (validadores del navegador y del servidor) ya aceptaba el formato canónico.

## Qué cambia la 245

Sólo el control de formato del identificador de persona: UUID canónico en minúsculas y distinto del nulo. No cambia las claves exactas del actor, el formato de la membresía, la cantidad de aprobaciones, que quien decide sea la última aprobación ni que membresías y personas sean distintas.

Las cuatro funciones están fijadas por el atestador de la corrida, y las dos familias (total oficial y cantidades) fijan al atestador. La migración recompone la cadena en el mismo paso:

1. Reemplaza el control en las cuatro funciones. Cada una exige su huella previa, una sola aparición del control y la huella resultante.
2. Reemplaza en el atestador las cuatro huellas. Exige la huella previa del atestador, una sola aparición de cada huella y la huella resultante.
3. Reemplaza en las dos familias la huella del atestador (dos apariciones cada una), con huella previa y resultante.
4. Comprueba que las dos familias sigan completas, con la misma versión y los mismos miembros: el único miembro cuya huella cambia es el atestador.

No concede permisos, no cambia dueños y no escribe datos. No se puede instalar dos veces. Una corrida capturada antes de instalar y todavía sin calcular hay que capturarla de nuevo (la familia registrada cambia); en la base operativa no hay ninguna en ese estado para octubre.

## Ensayo

En una copia aislada de la base operativa, con las funciones reales:

- Ensayo en seco y después instalación: las siete huellas resultantes son las fijadas; dueño, permisos, volatilidad y configuración no cambian; `plpgsql_check` sin errores (los avisos son los que el código ya tenía); familias completas con 62 y 30 miembros.
- La captura de octubre del convenio 1, que se rechazaba, pasa: 81 personas y los dos lotes de novedades incluidos.
- Antes de proponer la instalación se leyó el catálogo de la base operativa: las siete funciones tienen exactamente las huellas previas que la migración exige y las dos familias están completas.

Lo que el ensayo encontró después de este punto está en `docs/ESTADO_REAL_Y_PENDIENTES_20261119.md`.

## Instalación en la base operativa · 19/11/2026

Con decisión expresa de Marcelo y respaldo previo. El archivo instalado es el mismo del ensayo (misma huella SHA-256 que el del repositorio).

- Ensayo en seco sobre la base operativa: mismas siete huellas resultantes que en la copia, familias completas, sin cambios al deshacer.
- Instalación: las siete funciones quedaron con las huellas fijadas; dueño, permisos, volatilidad y configuración sin cambios.
- Después: 1.381 funciones y 232 tablas, igual que antes; 3 capturas y 9 eventos de novedades, igual que antes (la migración no escribe datos); ninguna de las siete funciones es ejecutable por PUBLIC ni por el rol de la aplicación, igual que antes; las dos familias completas con 62 y 30 miembros.

## Pendiente

- Agregar a las verificaciones con PostgreSQL real un caso con identificador de persona derivado, para que este control no vuelva a endurecerse sin que una prueba falle.
