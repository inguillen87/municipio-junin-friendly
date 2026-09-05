# GRH, GRH Web y oportunidades de automatización para Noelia

Fecha: 04/09/2026. Revisión de pantallas accesibles por VPN, manuales y código de MuniControl en `615d1cf`.

## Resultado de esta revisión

Se ingresó con la cuenta operativa autorizada en **GRH y GRH_WEB** usando una sesión de navegador independiente. No se tocaron las pestañas que el usuario había dejado abiertas. La herramienta habitual de control del navegador falló al inicializar; la revisión continuó con el navegador de pruebas ya instalado.

Se consultaron menús, formularios y configuraciones de formatos. No se importaron novedades, ejecutaron liquidaciones, generaron transferencias, modificaron empleados ni cambiaron parámetros de los sistemas municipales. No se hicieron consultas a Neon, migraciones ni un despliegue de MuniControl durante esta investigación. No se guardaron credenciales, cookies, identificadores de sesión ni datos nominales en este documento.

El acceso operativo fue comprobado. El intento con la credencial administrativa suministrada no estableció una sesión autenticada; no se probaron variantes. El alcance visible depende de la cuenta y no debe interpretarse como inventario completo del servidor.

## Evidencia nueva en vivo

### Renovación de acceso al cerrar el incremento

La primera sesión documentada abajo accedió a ambas aplicaciones. En una comprobación posterior se renovó correctamente **GRH Web**: 21 formatos, 294 conceptos y seis tipos de liquidación. GRH antiguo rechazó entonces el ingreso operativo. Después de que el usuario reconfirmó la credencial, una sesión nueva de **GRH antiguo ingresó correctamente** y permitió consultar Importación de Novedades, Administración de Reportes y De Ítems. Se descargó el catálogo mediante su botón Excel: 47 definiciones de campo correspondientes a 20 formatos. El rechazo intermedio no prueba que la credencial sea incorrecta; su causa no se determinó. Las pestañas personales no se cerraron ni modificaron.

El catálogo descargado y sus diferencias con el selector se registran en `GRH_OLD_FORMAT_EXPORT_20260904.md`. El intento adicional de descargar XML no produjo un archivo; no se presenta como conseguido.

La cuenta operativa renovada no mostró ImsuTaco/ImsuLega. Los nuevos campos de imputación están sustentados por las capturas y audios de Noelia, no por una comprobación actual de esos formularios. Se registran en `NOELIA_ACCOUNTING_REQUIREMENTS_20260904.md`. No se ejecutó Guardar en ninguno de los sistemas de origen.

| Pantalla | Hallazgo confirmado | Qué no acredita |
|---|---|---|
| GRH → Entorno → Importación de Novedades | Formato, concepto, período, tipo de liquidación, archivo, agrupación y modo forzado | Que cualquier archivo pueda importarse sin adaptar ni validar |
| GRH Web → Importación de Novedades | **21 formatos**, **294 conceptos**, seis tipos de liquidación; además vencimiento de novedades fijas y selección de estado | Vigencia de todos los conceptos o corrección de sus fórmulas |
| GRH Web → Formatos → De Ítems | Definiciones de campo, posición y longitud por formato; aparecen DNI, legajo, importe y cantidad | Escala decimal, codificación, redondeo o semántica completa del registro |
| GRH Web → Ejecutar Reporte | **79 definiciones** visibles; destinos navegador, texto, visualizador y PDF | Que los 79 reportes se usen actualmente en Junín; hay nombres genéricos o heredados de otras implementaciones |
| GRH Web → Planillas de Pagos | Período, fecha, tipo de liquidación, rangos de repartición y convenio, concepto e impresión | Archivo bancario acreditado ni conexión con un banco |
| Inicio de GRH Web | Presentación de e-Sueldos, e-Finanzas, e-Expediente, e-Tributo y e-ciudades | Instalación, licencia, uso o integración activa de esos otros productos en Junín |

### Formatos de importación observados

El selector muestra: Formato Junin, UPCN, FULL TIME, MAYOR y FULL, MUTUALES, AMSA, OSEP CUOTA %, OSEP - CATAST.VOLUN.EST., RETRO, IPV, MERCANTIL, sindicato municipal, OSEP - VOLUN.Estudiante, OSEP - Cta.Cte., OSEP - VOLUN.PUROS, COLEGIO FARMACEUTICO, SMSV - Seguro, RetroactivosGob, OSEP - CATAST.INDIRECT., OSEP - CATAST.VOLUN.PUROS y sac.

No se derivó automáticamente una asociación formato→concepto: son selectores separados en la pantalla. Tampoco debe suponerse que un formato llamado OSEP es el mismo diseño que la **exportación** OSEP pedida por Noelia.

Ejemplos de configuración observada en De Ítems:

| Formato | Campo | Posición informada | Longitud informada |
|---|---|---:|---:|
| MAYOR y FULL | DNI | 0 | 8 |
| MAYOR y FULL | CANTIDAD | 8 | 5 |
| RETRO | LEGAJO | 0 | 8 |
| RETRO | IMPORTE | 8 | 10 |
| AMSA | DNI | 0 | 8 |
| AMSA | IMPORTE | 8 | 11 |

Son metadatos de la configuración consultada, no un contrato ya validado para escribir nómina. Por ejemplo, conocer cinco posiciones de cantidad no permite decidir por sí solo si un valor representa unidades, centésimas o un porcentaje.

**Aclaración importante:** MAYOR y FULL aparece como formato de novedades y también existen conceptos de mayor dedicación/full time. La palabra “Mayores” del feedback no prueba por sí sola una relación con el libro mayor contable. Se mantienen separados el circuito salarial y la integración con GAF hasta aclarar su relación. Esto matiza la interpretación contable inicial registrada en `NOELIA_REPORT_REQUIREMENTS_20260903.md`.

### Reportes que justifican herramientas de trabajo

Entre las definiciones visibles hay: deudas no descontadas, netos negativos, costos y netos por convenio, planilla de imputaciones de sueldo, reporte de imputaciones, historial de liquidación, conceptos mensuales, grupo familiar por agente y totales por concepto.

Esto fundamenta nuevas herramientas de control, pero no demuestra que esos reportes estén correctamente configurados ni que sus nombres definan una regla de cálculo suficiente. No se ejecutaron ni se descargaron resultados nominales.

## Conexiones: lo confirmado y lo pendiente

| Circuito | Evidencia disponible | Situación de MuniControl comprobada en código |
|---|---|---|
| GRH / GRH Web | Acceso operativo en vivo a ambas aplicaciones | Hay datos importados y herramientas propias; este acceso no equivale a sincronización continua |
| Bancos | Reportes y archivos de Noelia; selector de reportes y planillas de pago | Control bancario local implementado; los perfiles TXT siguen sin generación homologada ni transmisión bancaria |
| OSEP / mutuales / sindicatos | Formatos de importación y reportes de retenciones, además de los archivos recibidos | Precontroles físicos implementados para OSEP y Seguro Mutual; otros descuentos y sindicatos sin cobertura comprobada. Todavía falta extracción semántica de los importes y generación homologada |
| ART | Pedido explícito y planillas GALENO/SUSS de Noelia | Cruce y Excel/PDF de revisión ya implementados; no hay envío a la aseguradora |
| Provincia / ANSES / F.931 | Reportes y muestras; procedimiento provincial relatado por Noelia | Precontrol estructural; no se confirmó una API de presentación ni se implementó envío |
| GAF / Hacienda | El inventario anterior registró GRH–GAF; hoy la cuenta operativa muestra la categoría Interfaces Contables | Sin URL de GAF verificada, acceso interior, contrato de asientos, acuses ni conexión comprobada |
| Relojes | Inventario y gateway existentes | Pendiente la conexión y prueba de los aparatos físicos |
| Expedientes, Tributos y atención ciudadana | Nombres comerciales en la portada de GRH Web | No se acreditó que estén instalados o conectados en este municipio |

La raíz del servidor consultado devolvió 404; no ofreció un portal de aplicaciones. No se probaron rutas administrativas, otros puertos ni servicios no enlazados. La carpeta `/GRH_WEB/Manuales/Guias/` devolvió 404, aunque las fichas enlazadas del manual sí respondieron: un directorio sin índice no significa que falten los manuales.

## Próximos incrementos, de menor a mayor

### 1. Importar sin rehacer planillas

Reutilizar la bandeja de novedades ya existente. Incorporar un primer formato real con nombre cotidiano, archivo original, período y concepto; reconocer campos, resolver la persona y mostrar únicamente diferencias o rechazos antes de preparar el lote.

**Ahorro:** evitar transcribir códigos y acomodar columnas cada mes.

**Para cerrarlo:** muestra del mismo formato y definición de decimales/identificador; pruebas de aceptados, duplicados, desconocidos y totales. Los 21 nombres observados no deben convertirse en 21 botones que todavía no funcionan. RETRO es un candidato acotado porque declara legajo e importe, pero la semántica monetaria todavía necesita comparación con una muestra autorizada.

**Actualización del incremento:** el TXT de garantía de agosto permitió contrastar las 18 posiciones y el decimal explícito; el nuevo lector aceptó sus 68 filas en una prueba local, sin guardar datos. La interfaz y validaciones ya están implementadas y probadas. La publicación se registra por separado, no se deduce de este relevamiento.

### 2. Carpeta mensual de entrega

Completar el cierre ya desarrollado, sin crear otro cierre paralelo: reunir los controles del mismo mes y jurisdicción, mostrar faltantes/diferencias y producir el paquete de entrega. Incorporar posteriormente constancia de recepción o rechazo.

**Ahorro:** dejar de reconstruir carpetas y repetir controles entre J42/J55, bancos, ART y reportes provinciales.

**Para cerrarlo:** un conjunto concreto de anexos reproducibles desde la misma corrida; no mezclar un informe local de revisión con un archivo oficial ya presentado.

### 3. Bandeja de excepciones antes de entregar

Agrupar netos negativos, deudas/retenciones no aplicadas, conceptos inesperados y cambios de importe frente al período comparable. Cada alerta debe abrir el legajo y explicar la fuente de la diferencia.

**Ahorro:** revisar las excepciones en lugar de recorrer toda la nómina. Comparar mensual con mensual; no mezclar SAC, vacaciones, quincenas o suplementarias.

**Para cerrarlo:** criterio de comparación, población y períodos inequívocos. Una diferencia es una señal para revisar, no evidencia automática de un error ni motivo para modificar el sueldo.

### 4. Conciliación de sueldos con Hacienda/GAF

Relacionar concepto salarial, repartición y cuenta presupuestaria; previsualizar el asiento propuesto y conciliarlo con la liquidación y el pago. Automatizar el intercambio sólo cuando se conozcan formato, destino, responsable y respuesta del GAF utilizado por Junín.

**Ahorro:** evitar volver a cargar totales en contabilidad y detectar desbalances antes del cierre.

**Para cerrarlo:** URL/sesión de GAF, un asiento real autorizado, plan de cuentas y especificación de intercambio. La existencia de un reporte de imputaciones no suple esos elementos.

## Fuentes y trazabilidad

Pantallas consultadas sin ejecutar procesos:

- `http://172.100.96.4:8080/grh/index.jsp`
- `http://172.100.96.4:8080/grh/actions/importacion.do?do=load`
- `http://172.100.96.4:8080/GRH_WEB/index.jsp`
- `http://172.100.96.4:8080/GRH_WEB/actions/importacion.do?do=load`
- `http://172.100.96.4:8080/GRH_WEB/actions/abmAction.do?do=list&entityName=Formatoitem`
- `http://172.100.96.4:8080/GRH_WEB/actions/SQLReport.do?do=show`
- `http://172.100.96.4:8080/GRH_WEB/actions/process.do?do=show&processName=PlanillaPago`

Manuales contrastados hoy:

- `http://172.100.96.4:8080/GRH_WEB/Manuales/Guias/WebHelp/whdata/whtdata2.htm`
- `http://172.100.96.4:8080/GRH_WEB/Manuales/Guias/WebHelp/__Retenciones_Obras_Sociales.htm`
- `http://172.100.96.4:8080/GRH_WEB/Manuales/Guias/WebHelp/__Planilla_de_pago.htm`

Código contrastado: `assets/payroll-novelty-workbench.js` (CSV canónico actual), `assets/payroll-bank-fixed-width-profiles.js`, `assets/payroll-health-fixed-width.js`, `assets/payroll-f931-prevalidator.js`, `assets/payroll-art-noelia-adapter.js` y `lib/internal-payroll-monthly-close.js`.

Las notas antiguas que aún ubican el cierre mensual y el reproceso como íntegramente pendientes no reflejan el código actual: ya existen implementaciones posteriores. Eso no acredita por sí solo que todos los perfiles, exportaciones y conexiones estén terminados o verificados en Producción.
