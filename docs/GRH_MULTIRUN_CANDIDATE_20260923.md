# Respaldo 22/09: extracción multiliquidación y lote candidato

## Cambio respecto de a70daa9

La auditoría previa identificaba tres supuestos incompatibles. Ahora el extractor conserva el ID fuente y la clave empresa/legajo/fecha/período/mes/tipo de cada asignación. Un legajo en dos corridas se conserva; duplicar la misma asignación o su ID se rechaza. La conciliación distingue filas de asignaciones y contratos únicos. Los cierres se transportan por corrida, no por fecha global.

El perfil conocido 22/09 es explícito y candidate_only. Los perfiles previos y el predeterminado se conservan. Los consumidores ordinarios del perfil, incluido el importador de curados y la proyección pública, rechazan este candidato. Sólo el verificador de lectura usa allowCandidateRead:true. El importador canónico v1 continúa rechazando schemaVersion 2. No activar el modo fixture, cambiar los cierres ni eliminar asignaciones para sortear esas barreras.

## Ejecución local sobre el respaldo privado identificado

Fuente lógica SHA-256 8FD91C34E3757A19F3F772631F5734D4934050D4823BC6127B61220236155A8E. Corte 2026-09-22T15:16:58, sin zona horaria declarada. El SQL nunca se ejecuta; se lee y transforma fuera del repositorio.

Resultado de la extracción estricta y del verificador independiente del lote: 625 corridas analíticas, 850 asignaciones del snapshot para 849 contratos, 496.081 movimientos válidos, 216.413 hechos mensuales y 2.452 conciliaciones. Las exclusiones por fechas/años permanecen enumeradas en el manifiesto privado: estos conteos no son todas las filas de las tablas SQL.

La extracción curada también completó su validación de fuente y conteos: 2.452 legajos, 31.750 ausencias, 3.448 licencias, 3.650 familiares y 845 afiliaciones. No se suben estos registros, manifiestos nominales ni SQL al repositorio público.

Septiembre conserva M/O/P abiertas y V cerrada según la fuente; la última mensual cerrada sigue siendo agosto. La conciliación administrativa conserva 876 activos, 849 en snapshot y 27 fuera del snapshot. Pertenecer al snapshot no prueba pago ni cálculo confirmado.

## Cierre de esta fase y límites

Cierra la extracción y aceptación de archivos candidatos, no la migración productiva. El verificador valida huellas, tamaños, rutas confinadas, contratos, corridas, referencias y cantidades sobre los archivos generados. No abre una conexión de base ni autoriza promover la fuente. Las pruebas CI usan sólo datos sintéticos y preservan compatibilidad de perfiles antiguos.

Pendiente: contrato de publicación/consumo multiliquidación en la base, migración idempotente probada en rama aislada, conciliación contra la fuente actualmente publicada, respaldo restaurable y promoción del lote sin sobrescribir operaciones nativas. Hasta entonces los datos mostrados en producción no se declaran actualizados al 22/09.
