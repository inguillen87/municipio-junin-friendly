# Expedientes jurídicos Fase 1 - release 20/09/2026

## Alcance

Primer registro nativo de expedientes vinculado a la Bandeja de Asuntos. Esta fase incorpora número/año externo, carátula/asunto, área de origen, responsable validado, estado Abierto/Cerrado, revisiones append-only y vínculo FK al asunto municipal.

El UUID interno no reemplaza la numeración del expediente. Una corrección de carátula crea otra revisión y conserva el número/año. Cerrar y reabrir también crean eventos; no se reescribe el historial.

Los expedientes se crean desde un asunto existente. La relación legal_matter_case_link referencia matter_id y case_id reales con tenant_id; no se usan cadenas de texto que simulen claves foráneas.

## UX/UI

Se agrega la página Expedientes con búsqueda por número, carátula, área o responsable, filtro Abierto/Cerrado, paginación y tarjetas. Desde un asunto aparece Expedientes vinculados; si no existe uno, la pantalla ofrece Crear expediente para este asunto.

Antes de guardar se compara la propuesta. El responsable se elige entre membresías activas habilitadas para Jurídica. Una pérdida de permiso borra borradores e historial de la vista. URLs con parámetros extra se rechazan antes de ejecutar el bootstrap privado.

El detalle muestra asuntos vinculados y permite volver al asunto. Un usuario de sólo lectura puede consultar el expediente y su historial, pero no recibe candidatos ni controles de edición.

## Storage y límites

No se almacenan PDFs, bytes, interesados, pases ni actuaciones documentales en esta fase. No se reutiliza la biblioteca de nómina para Jurídica. Documentos/pases se incorporarán mediante migración aditiva posterior sobre este expediente, evitando storage paralelo improvisado.

## Base de datos

Migración 083 instalada en PostgreSQL 18.6 aislado y PostgreSQL 17.11 operativo. SHA-256: 1392f1998c5c7147e0f5d639706bd38c3219b209e6c6174f14641cad8290aabc.

La función legal_case_operation_v1 tiene la misma huella pg_get_functiondef en ambos destinos: 83cf0d6cd5769b09ca5ecfa31a0d3af5d42d4111af2e6b69b933e6359c199f78.

En ambos destinos: 0 expedientes y 0 eventos al instalar. El rol aplicativo no tiene SELECT/INSERT/UPDATE/DELETE directo sobre legal_case_event, no ejecuta el helper legal_case_record_v1 y sí ejecuta la fachada controlada.

## Verificación

La regresión completa pasó 3.893 pruebas, 0 fallos. El contrato/API específico pasó 16 pruebas. La migración compiló en PostgreSQL 18 dentro de una transacción revertida antes de instalarse.

La página compilada pasó 9 recorridos de navegador con datos sintéticos: vacío real, creación desde asunto, revisión previa, 320/390 px, corrección de carátula, pérdida de respuesta sin duplicado, cierre/reapertura, sólo lectura, revocación y navegación inválida sin consulta privada.

Las pruebas de navegador interceptan APIs privadas y no crean datos municipales. No se modifican nómina, relojes, VPN, GRH ni planes.