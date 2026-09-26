# Módulo 7 · liquidación gobernada

## Alcance cerrado

El circuito de Noelia queda modelado como estados separados y auditables:

- **7.1 Anular**: una preparación todavía no confirmada se cancela; una liquidación ya confirmada o cerrada pasa a **Anulada** sin borrar su historial.
- **7.2 Confirmar**: una segunda identidad autorizada confirma únicamente con conciliación exacta, sin diferencias ni bloqueos.
- **7.3 Cerrar**: una liquidación confirmada pasa a **Cerrada** y conserva preparador, aprobador, fuentes agregadas, conciliación y eventos.
- La posterior imputación/contabilización queda fuera de este cierre; MuniControl no afirma haber contabilizado, pagado ni transmitido a GRH/banco.

La misma persona que preparó no puede confirmar, cerrar ni anular la liquidación confirmada. El estado y los botones provienen de `allowedCommands` del servidor; la interfaz no inventa permisos.

## Persistencia y trazabilidad

La migración 109 amplía los estados a `closed` y `annulled`, agrega los comandos `close` y `annul`, preserva la versión esperada e idempotencia, y mantiene la corrida histórica aunque se anule.

Una liquidación anulada deja libre el período para una nueva preparación; una liquidación cerrada sigue ocupando el período. Está prohibido borrar la corrida.

Antes de aplicar 109 se verificaron en Neon los hashes exactos de las tres funciones base. La migración completa se ensayó primero dentro de una transacción real con rollback; no existían corridas mensuales persistidas y las nuevas restricciones resultaron compatibles. Luego 109 se aplicó en la rama operativa y `schema_migrations` quedó con SHA-256 `f0cc505f5e41320e85a29e4d2d4cf518046970c841458cd003cebdbaaeeb7bcb`. La aplicación no modificó filas de nómina.

## Verificación

- 34 pruebas directas/regresivas del ciclo, contrato API, workflow e informe aprobado.
- PostgreSQL 17 aislado: preparar → enviar → confirmar → cerrar → anular, replay idempotente, maker-checker, liberación del período y prohibición de DELETE, todo con rollback.
- Neon: ensayo transaccional con rollback y posterior aplicación confirmada de 109; cero filas de negocio modificadas durante la migración.
- Navegador: escritorio y móvil con los estados y comandos nuevos; la bandeja usa el ancho completo cuando el perfil no puede preparar.
- `npm run build`: 5.376 pruebas aprobadas, cero fallos y dos omitidas.

El CI final repite el SQL en PostgreSQL 17 y 18 y ejecuta la regresión visual antes de considerar publicada la entrega.