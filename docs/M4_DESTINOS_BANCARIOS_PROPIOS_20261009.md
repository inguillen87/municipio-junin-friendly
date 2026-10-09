# M4 — datos bancarios de las asociaciones propias

El destino anual permite conservar concepto bancario, movimiento bancario, acreedor de neto e Indica neto por separado. La cuenta bancaria, el banco, el acreedor general y la cuenta contable mantienen sus referencias anteriores. Declarar estos datos no genera asientos, recalcula sueldos ni ejecuta pagos.

En Nómina → Asociaciones contables, una asociación nueva comienza con los datos bancarios no informados. El operador declara cada referencia y su documento de respaldo; otra persona revisa el conjunto completo antes de aprobarlo. Acreedor de neto distingue **no informado**, **ninguno** y **acreedor declarado**. Indica neto distingue **no informado**, **No** y **Sí**. No se asignan valores por defecto desde otro campo ni se interpretan como instrucciones para cambiar el neto salarial.

Las asociaciones anteriores conservan exactamente sus quince campos, versiones y huellas. Para completar sus nuevos datos, se cierra la vigencia anterior y se agrega una nueva; el historial no se enriquece ni sobrescribe. Los intentos pendientes conservan sus cuerpos y claves originales, también tras instalar SQL150.

Los registros nuevos tienen un marcador interno `bankDestinationVersion: own-accounting-bank-destination.v1` y las cinco propiedades `bankConceptReference`, `bankMovementReference`, `netCreditorKind`, `netCreditorReference`, `indicatesNet`. El marcador exige el registro completo de veintiún campos. Sólo una declaración de acreedor puede llevar su referencia; las otras dos conservan `null`. Los indicadores requieren booleanos JSON o `null`, nunca cadenas ni números.

La imputación propia conserva estos datos dentro de cada destino, sin reevaluar los importes originales. La copia CSV de control de una distribución aprobada vigente agrega cinco columnas si contiene destinos del nuevo formato. Incluye todos los conceptos de todas las páginas aunque exista búsqueda, con referencias e importes como texto literal seguro. Los grupos anteriores conservan su formato de 32 columnas y su huella original; una mezcla de destinos conserva lo no informado de los registros antiguos. La consulta de una propuesta, el cambio de fuente, sesión, permisos o visibilidad siguen invalidando la descarga según el circuito existente.

SQL150 reemplaza únicamente `own_accounting_definition_v1(jsonb,jsonb,jsonb)` con comprobación del código anterior. No crea tablas o funciones nuevas, modifica filas o permisos, ni reinstala SQL147/148. El lote de instalación exige conservación de todos los demás objetos y filas, ensayo con rollback y verificación en una transacción independiente.

Esto completa la conservación y revisión de estas referencias de M4. El circuito contable de asientos, conciliación y pago requiere sus fases propias y aceptación municipal.
