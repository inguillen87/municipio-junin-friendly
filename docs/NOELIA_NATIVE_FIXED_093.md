# Alta propia y novedad fija individual

Este corte permite preparar una novedad fija para un vínculo creado en MuniControl mediante 067, sin inventar su presencia en GRH. Continúa el registro individual de 092: propuesta, revisión por otra persona, historial y exportación de control. No calcula haberes, no crea liquidaciones y no acredita por sí solo la autonomía de nómina para octubre.

## Flujo disponible

1. Registrar el alta propia con el procedimiento existente y sus permisos. La confirmación ofrece «Preparar novedad fija».
2. La pantalla de nómina consulta el vínculo exacto y muestra «Alta propia de MuniControl». Navegar no crea una propuesta. También puede elegirse una persona mediante el directorio autorizado; escribir un legajo conserva la consulta exclusiva de GRH.
3. Informar concepto, centro, tipo, cantidad o importe, instrumento y fechas respaldadas; revisar antes de guardar. No hay importes, reglas del concepto 80 ni vencimientos inferidos.
4. Otra persona con permiso específico revisa la propuesta. Una corrección o anulación pendiente conserva la última versión aprobada.
5. Consultar el período y exportar el control, con procedencia explícita y sin mezclar corte GRH con fecha de alta propia.

## Identidad y autoridad

La selección transporta el UUID del contrato; el servidor verifica su municipio, binding certificado, persona y registro original de alta. El token incluye la procedencia y fechas del vínculo. Un cambio de identidad, pérdida de autoridad o versión concurrente bloquea la operación; no se busca otra persona por el mismo legajo ni se reasigna el borrador.

Se mantienen sesión MFA, capacidades nominales de lectura, `payroll.fixed.prepare`/`payroll.fixed.approve`, vínculo laboral verificado del operador y separación entre proponente y revisor por membresía y persona. No se crean roles, permisos, cuentas o vinculaciones. La búsqueda general requiere además el permiso ya existente `workforce.employee.read`; la continuación directa desde un alta consulta sólo la fachada de nómina.

La fuente histórica de 040, commit `9a91a56453a91ef4a8deba72c2b4f853545de8a2`, incluye `workforce.employee.read` en `NOMINA_GESTION_INTEGRAL`. Eso no certifica la asignación ni autoridad efectiva de una sesión municipal actual: su aceptación requiere comprobarla con la persona autorizada, sin inferir vínculos por nombre o correo.

## Compatibilidad y despliegue

093 es aditiva sobre 067 y 092. No instala 041, no importa respaldos, no convierte novedades previas ni toca el módulo histórico 044. Los sujetos GRH existentes conservan sus cinco campos, tokens y snapshots; los contratos propios tienen una forma cerrada con origen y registro de alta, y corte GRH nulo. Las reglas del API están en [el contrato del registro](NOELIA_FIXED_NOVELTIES_CONTRACT.md).

Se recuperó también la fuente histórica 041 desde `9a91a56453a91ef4a8deba72c2b4f853545de8a2`, sin ejecutarla. El archivo conserva SHA-256 `b235da9a87b9fe09f12db8fda4cad704d93dd820b1888c15bebff7e57f3bb20b`. El 21/09 se cotejaron sus catorce cuerpos de funciones, normalizando saltos de línea: todos coinciden con PG17 y PG18. Esto recupera la referencia necesaria para ampliar parámetros; todavía no certifica la estructura completa, permisos o casos salariales de ese dominio.

La migración conserva las barreras de capacidad de 092, recibos idempotentes, permisos y bloqueos. Antes de publicar se exige ejecutar SQL real en PostgreSQL 17 y 18, además de la regresión y navegador. Las pruebas locales del navegador interceptan todas las APIs con fixtures sintéticos y no escriben datos municipales. Aprobar esas pruebas no demuestra que un operador real pueda ejecutar el circuito en producción.

## Límites pendientes

- La aceptación municipal del circuito con operadores reales y revisión independiente sigue siendo una verificación separada.
- El alta propia no presupone elegibilidad de conceptos, convenios, importes ni fórmulas; deben provenir de reglas y actos respaldados.
- Este corte cubre novedades individuales permanentes, no corrección masiva, cálculo salarial, cierre, contabilización ni salida bancaria.
- La revocación del acceso impide consultar o reenviar. Ante una respuesta incierta se conserva el mismo cuerpo y clave para comprobar el resultado; no se crea un segundo intento con otro vínculo.
