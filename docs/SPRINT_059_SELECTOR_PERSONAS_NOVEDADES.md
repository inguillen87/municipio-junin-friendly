# Sprint 059 — seleccionar personas desde Novedades

## Necesidad operativa
Los módulos 5.2 y 5.3 de Noelia describen carga por legajos, masiva o individual,
con o sin importe forzado. La reunión del 09/09/2026 pide importe opcional.
Esta entrega agrega un selector del directorio ya incorporado, sin pedir una
planilla externa ni copiar identificadores. No reemplaza reglas de liquidación.

## Alcance implementado
- Botón Buscar personas en el padrón en carga individual y rápida.
- Botón Elegir personas del padrón en la planilla editable del release concurrente.
- Filtros de nombre/legajo, sector y convenio enviados al directorio autenticado.
- Sólo cohorte administrative_active, paginación real de 25 filas y corte visible.
- Selección entre páginas y búsquedas, resumen lateral, quitar y vaciar selección.
- Seleccionar esta página no significa seleccionar todo el filtro ni todo el municipio.
- Aplica límites del servidor, duplicados y reglas de los parsers existentes.
- La carga individual completa un legajo; carga rápida agrega la novedad común;
  la planilla permite concepto/unidades iniciales editables, sin importe ni forzado predeterminado.
- No hay alta automática de un lote: Validar y previsualizar sigue siendo local,
  Crear lote trazable continúa usando la misma API idempotente.

## Identidad, datos y concurrencia
El selector exige la sesión administrada v2, mismo tenant y permisos de personas
+ preparación. Antes de agregar reconsulta sesión y bootstrap, compara membership,
tenant, binding certificado y límites. Se limpia al cerrar, cambiar de modalidad,
abandonar la página o perder permiso/contexto. Aborta búsquedas anteriores; una
respuesta tardía no modifica la nueva selección. Si cambia el corte se pide
seleccionar nuevamente. Selecciones mayores de 10 minutos deben renovarse.

El endpoint employees existente devuelve más campos que los usados por el selector.
El adaptador conserva únicamente contractId, legajo, nombre, sector, convenio,
companyId y administrativeStatus; no muestra ni retiene DNI/CUIL/sexo/salarios.
No crea almacenamiento local persistente ni exporta el padrón desde el buscador.

Administrativamente activo NO equivale a liquidable ni a elegibilidad del concepto.
La preparación definitiva se valida en backend. La selección no prueba presencia,
no cambia el padrón ni constituye un cálculo salarial. El directorio sigue siendo
el del corte publicado, no un censo actualizado por refrescar la pantalla.

## Publicación y verificación
Partida: árbol de producción e0f305384ada563e7094c25fe9f1bc5873197e95, commit d23052c772e11d192b3f5d265a4bd2d4016f8626.
Sin migraciones, cambios de API, permisos, fórmulas, cierres ni firmas.
Pruebas unitarias del modelo y pruebas Playwright sobre la pantalla real completa,
con API sintética interceptada únicamente en el navegador de pruebas. El workflow
repite suite total, build y regresiones antes de permitir integración. Luego verifica
recursos publicados por SHA-256, rechazo real anónimo y la UI publicada con datos QA.
No se afirma prueba con una cuenta municipal y MFA ni escrituras municipales de QA.
