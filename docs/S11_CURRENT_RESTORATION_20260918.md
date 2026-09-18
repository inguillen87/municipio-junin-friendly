# Septiembre: ensayo sobre la restauración del esquema actual

## Resultado y alcance

El 18/09/2026, entre 02:23:16 y 02:24:43 UTC, terminó el ensayo del delta GRH sobre una restauración privada actual de MuniControl. No reutilizó la restauración de 120 tablas de los ensayos anteriores: verificó conservación de **145 tablas** entre public y los esquemas privados de respaldo. El puerto de ensayo es 55441, sólo loopback, en una instancia independiente de los colectores. El código rechaza otro host, base, puerto o un identificador de rama Neon antes de abrir una transacción de cambios.

Se verificaron nuevamente los archivos base y candidatos y se obtuvo el mismo paquete revisado `d5f8f6a150377400d23c0af4c97aa3d58875218479907ffd2d56e3a6b3890abe`. Contiene 11.430 diferencias; **no son 11.430 personas o liquidaciones nuevas**.

| Fuente | Base | Candidata | Altas | Modificaciones | Ausencias en candidata |
| --- | ---: | ---: | ---: | ---: | ---: |
| Corridas | 620 | 624 | 4 | 2 | 0 |
| Snapshot salarial | 854 | 847 | 847 | 0 | 854 |
| Movimientos | 489.459 | 495.237 | 5.791 | 2 | 13 |
| Hechos mensuales | 214.164 | 216.411 | 2.248 | 811 | 1 |
| Conciliación de legajos | 2.450 | 2.452 | 2 | 855 | 0 |

El cambio de snapshot sustituye la foto mensual y no representa 854 bajas laborales. Ausencia en el respaldo tampoco se convierte por sí sola en baja. El candidato conserva 875 administrativos activos, 847 activos incluidos en el cálculo abierto y 28 fuera; agosto figura cerrado y septiembre abierto, conforme a la fuente. No es una liquidación ejecutada por MuniControl.

El importador comprobó la proyección completa de cada entidad antes de sellar el delta. Repetir el mismo paquete devolvió el mismo registro, sin una segunda inserción. El lector del candidato siguió vedado al rol de aplicación. Después de ROLLBACK, las 145 tablas mantuvieron sus conteos y huellas, y el esquema agregado desapareció. **No se seleccionó septiembre en producción ni se ensayó todavía toda su activación administrativa/contable.**

## Un defecto real del respaldo que quedó identificado y corregido en ensayo

El archivo completo de producción se capturó con pg_dump 17.11. SHA-256: `e06e7e2178c889a480ee0d373cf292b674c97562c4d9f746a7301eabc1493a93`. Al restaurarlo sin intervenciones adicionales, COPY de `person_identity` falló porque `is_valid_cuil` dependía de `normalize_digits` sin esquema durante el search_path vacío de la restauración.

La reparación propuesta `075-restore-safe-identity-functions.sql` fija el search_path de ambas funciones a pg_catalog, public, pg_temp. Valida el SHA de la definición preexistente y conserva cuerpo, propietario, ACL, volatilidad, strictness y modo invocador. Es repetible y rechaza cambios previos inesperados; no deshabilita CHECK ni transforma datos.

Con la reparación local, terminaron las secciones de datos y post-data del archivo. Un ensayo SQL independiente comparó 20.007 entradas: reproducción del fallo original, resultados idénticos bajo search_path vacío, resistencia a una función homónima en otro esquema y replay. También comprobó las identidades restauradas y sus restricciones. Los roles del entorno local son propios del ensayo: esto no certifica la reproducción del plano administrativo de Neon ni el login real.

## Capacidad sin resultados engañosos

El importador 061 todavía comprobaba una sola base. Ahora su preflight y postflight suman **todas** las bases de `pg_database`, incluidas las plantillas; mantienen 512 MiB como límite, 16 MiB de reserva y 24 MiB como crecimiento máximo previsto para esa etapa. Faltas, resultados ambiguos o números inválidos bloquean la operación.

En el ensayo local, el delta ocupó 17.473.536 bytes adicionales. Su clúster local pasó de 465.094.184 a 482.567.720 bytes. **Estas cifras no representan ocupación ni ahorro de Neon**: la restauración reconstruyó índices y tiene otras bases diferentes. La lectura productiva de las 02:30:28 UTC conserva 516.833.280 bytes; su margen sobre la reserva es 3.260.416 bytes, insuficiente para importar esa etapa sin más trabajo.

Se identificó diferencia de tamaño en índices entre producción y restauración, pero no se ejecutó compactación en producción y no se atribuye ahorro. Reconstruir índices también consume espacio temporal y puede bloquear consultas: la selección de mantenimiento debe demostrar capacidad durante el proceso, límites de espera y conservación. No eliminar índices, cambiar cuotas ni borrar históricos como sustitución de esa comprobación.

## Estado de publicación y bloqueo puntual

Se intentó aplicar la reparación 075 mediante una transacción explícita de Neon, con rama, hashes y registro de migración fijados. **La herramienta la bloqueó antes de ejecutarla.** Una lectura posterior verificó cero registros 075 y las dos configuraciones sin modificar. No se reemplazó esa operación por otra vía ni se declaró aplicada por haber probado el archivo en local.

El código y los ensayos se preparan para una entrega agrupada en el repositorio. El despliegue web por sí solo no aplica esta migración ni activa la fuente. Confirmar esos estados de forma independiente.

Pendientes concretos: aplicar y verificar la reparación del respaldo cuando la operación esté habilitada; preparar mantenimiento/retención con restauración demostrable; conciliar la capa administrativa y todos los consumidores con los legajos/datos nativos actuales; probar publicación y recuperación posteriores a COMMIT; promover una única fuente activa y comprobar por legajo/concepto. Para octubre autónomo se mantienen los circuitos de Noelia/Hugo y sus reglas aprobadas; para Mariano, expedientes y obligaciones documentales. Esta entrega no declara terminados esos módulos.

Fuentes técnicas primarias: documentación PostgreSQL 17 de pg_restore, CREATE FUNCTION, VACUUM y REINDEX. Los informes y dumps con información municipal permanecen en carpeta privada local, fuera de GitHub y de los artefactos públicos de CI.

## Regresión de este incremento

La regresión completa terminó con 3.624 pruebas aprobadas, cero fallos, omisiones o cancelaciones. Incluye el rechazo de objetivos de ensayo incorrectos antes de BEGIN, la contabilización de todas las bases, el límite exacto de reserva y los contratos de la reparación 075. Los controles reales de PostgreSQL se ejecutaron sólo en el entorno privado restaurado: no se sustituyen por los mocks de Node ni se consideran una migración productiva.
