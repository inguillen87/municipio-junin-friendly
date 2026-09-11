# Sprint 054 · Identificación de agentes para exportar

## Requerimiento de origen
El usuario pide que F/M salga completado, sin corrección repetida en Excel. La anotación fotografiada en WhatsApp del 10/09/2026 12:54:30, segunda imagen, dice tomar el sexo de la ficha del legajo. El módulo 1–2, página 2, pide ART con DNI, CUIL, sexo, días y sueldo = 993 + 995. Se mantiene ese significado: sexo no se deduce de nombre ni del prefijo del CUIL. M/F de tipo de liquidación no es el sexo de la persona.

## Implementación
- Consulta protegida `payrollexportroster` por conjunto de liquidación, tenant y fuente verificada; requiere nómina + lectura de legajos.
- F/Femenino y M/Masculino se normalizan desde el valor explícito. X se conserva; un destino F/M lo remite a revisión. No se convierten números sin un catálogo comprobado.
- Un agente de una liquidación histórica puede estar inactivo hoy. El padrón de esa liquidación no se filtra por el estado activo actual. Los reportes operativos de personal conservan su filtro de activos.
- Planilla de identificación PDF/Excel/CSV sin subir archivos. Identificadores textuales conservan ceros. Búsqueda y revisión filtran también la descarga completa.
- Base de trabajo ART desde conceptos conservados, con suma exacta 993 + 995. Falta fuente aprobada para días; quedan pendientes, nunca 30 por defecto, cero ni número de fichadas. No se afirma que la base sea una presentación lista.
- Cada exportación reconsulta permisos y huellas de datos; un cambio o rechazo cancela la descarga. Se muestran los cortes de identificación y de importes por separado.

## No entregado como resuelto
Este sprint no instala el colector, no aprueba liquidaciones, no aplica firmas, no cambia salarios, no importa el backup nuevo ni genera TXT de pago/fiscales finales.

## Próximos cierres
1. Colector permanente municipal: servicio en host de Cómputos con ruta al reloj, lectura autenticada, cola local durable y recepción idempotente por HTTPS. Sin dependencia de la computadora de Marcelo.
2. Incorporación incremental del respaldo nuevo: analizar diferencias con el corte anterior; preservar operaciones MuniControl, cierres y fuentes. GRH es origen de migración, no diseño permanente ni destino de nuevas operaciones.
3. Días ART: establecer campo/regla por período con Noelia, considerando licencias y bajas. Conciliar contra su planilla entregada. Sólo entonces emitir la planilla ART completa desde la base.
4. Fuentes salariales vigentes: conceptos y auxiliares por convenio, revisiones/versiones. 88/90 y cambios conjuntos según módulo 6; no aplicar porcentajes de memoria.
5. Redundancia: restauración en el tiempo, copia cifrada independiente y ensayo de recuperación. Una rama de QA no acredita una política de backup ni una réplica independiente.

## Aceptación
Pruebas de normalización, códigos no mapeados, X, documentos, estados históricos, importes nulos/cero, filtros, autorización y exportación. Navegador con datos sintéticos: XLSX real, PDF real, móvil, bloqueo por cambio de fuente y sesión rechazada. Un test sintético no equivale a ingreso municipal con MFA ni a presentación ante ART.
