# MuniControl — hoja de ruta competitiva GovTech

**Versión de análisis:** 2026-08-21

**Producto de referencia:** MuniControl Friendly, Municipio de Junín, Mendoza
**Principio rector:** alcanzar y superar la cobertura funcional de las suites municipales existentes sin copiar código, identidad visual, textos ni procesos propietarios, y sin presentar datos sintéticos como verdad municipal.

La ejecución de cada incremento debe cumplir los [principios de experiencia Friendly](./PRODUCT_UX_PRINCIPLES.md): recorridos comprensibles para perfiles municipales no técnicos, complejidad progresiva y datos con fuente, período y estado explícitos.

## 1. Fuentes públicas comparadas

La matriz se basa en las ofertas públicas consultadas el 20 de agosto de 2026:

- CIVITAS — Recursos Humanos: <https://civitas.com.ar/software-recursos-humanos/>
- CIVITAS — Gobierno inteligente: <https://civitas.com.ar/gobierno-inteligente/>
- Intervan / Gestion.ar Municipio: <https://intervan.com.ar/>
- Intervan — Administración financiera: <https://intervan.com.ar/sistema-de-administracion-financiera-afi/>
- Intervan — Recursos Humanos: <https://intervan.com.ar/recursos-humanos/>
- SIGeMi — alcance de producto: <https://sigemi.com.ar/producto/>
- SIGeMi — módulo Personal: <https://sigemi.com.ar/personal/>
- SIGeMi — Compras y portal de proveedores: <https://sigemi.com.ar/compras/>
- SIGeMi — Presupuesto: <https://sigemi.com.ar/presupuesto/>
- OpenGov — plataforma para gobiernos locales y estatales: <https://opengov.com/>
- OpenGov — portal oficial de APIs: <https://developer.opengov.com/docs/quickstart>
- Tyler Technologies — Time & Attendance: <https://www.tylertech.com/products/time-attendance>
- Tyler Technologies — cartera de productos públicos: <https://www.tylertech.com/products>
- Oracle — Human Resources / Workforce Management: <https://www.oracle.com/human-capital-management/human-resources/>
- Oracle — integración de ausencias, tiempo y nómina: <https://docs.oracle.com/en/cloud/saas/human-resources/fautl/how-absences-are-handled-when-integrated-with-time-and-labor.html>
- Oracle — opciones de carga de tiempo y ausencias hacia nómina: <https://docs.oracle.com/en/cloud/saas/human-resources/fapcd/overview-of-time-and-absence-data-for-payroll.html>
- Soluciones digitales para la Administración Pública Nacional: <https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/tecnologias-de-la-informacion/soluciones>
- Laboratorio GovTech LATAM: <https://www.govtechlatam.org/>

Las fuentes de Argentina y GovTech LATAM aportan contexto institucional; no se usan como prueba de capacidades de un proveedor. Las menciones siguientes describen sólo lo que cada fabricante documenta públicamente: no certifican calidad, alcance contratado, localización normativa, seguridad, usabilidad ni funcionamiento en producción.

### 1.1 Método de comparación

- **Capacidad declarada:** aparece de forma explícita en una página o documentación oficial del proveedor.
- **Paridad requerida:** capacidad operativa que al menos dos referentes ofrecen y que un comprador municipal razonablemente esperará.
- **Diferenciación:** resultado medible que MuniControl puede probar y que no surge de repetir una lista de módulos.
- **No verificado:** no hubo acceso a demo, contrato, SLA, arquitectura, modelo de permisos, evidencia de auditoría ni datos de cliente; no se infiere su existencia.
- **Estado MuniControl:** se conserva `completo`, `parcial`, `faltante` o `externo`; una pantalla o prototipo sin fuente real y sin circuito autorizado no cuenta como completo.

La comparación no asigna puntajes numéricos porque las fuentes públicas tienen distinto nivel de detalle. Un ranking con esos datos produciría precisión ficticia.

### 1.2 Corte de evidencia del foundation 005–013 y del control temporal

El foundation transversal de identidad, operaciones y tiempo llegó hasta la migración 013. Las migraciones 005–013 quedaron **implementadas, aplicadas y reaplicadas en una rama Neon QA descartable acreditada**. 010A registra metadatos/readiness; 011 modela calendarios, turnos, reglas y asignaciones; 012 gobierna propietarios globales; 013 gobierna la membresía operativa explícita. Ninguno de estos cortes está desplegado, habilitado ni probado con usuarios en Producción.

| Entorno | Evidencia alcanzada | Límite explícito |
|---|---|---|
| **Local** | Identidad tenant v2 ligada a sesión, MFA y ACL/capability; gobernanza 012 de propietarios globales; membresía 013; Actions read/write; lifecycle 009A; registro 010A; catálogo temporal 010B/011; manifiesto MariaDB→canónico; y perfilado seguro del backup municipal GRH del 19/08/2026. 010B cubre calendarios, turnos diurnos/nocturnos, reglas tipadas y asignaciones con maker-checker, idempotencia y solapamiento semanal cíclico. | Es evidencia sobre un snapshot verdadero, no una conexión viva. La mayor parte del subsistema horario observado es histórica (2000–2012); las reglas no están homologadas para 2026 y todavía no hay correo real, Preview ni artefacto desplegado. Fichadas vivas, cálculo y posting permanecen cerrados. |
| **Neon QA descartable** | 005–013: fresh apply/reapply y fingerprints instalados en `qa-final-iam-013-20260821`. 013 compiló 34 sentencias y revalidó esquema, ACL, funciones, triggers, índices, rol operativo, expiración y auditoría. | QA prueba PostgreSQL y contratos de seguridad, no identidades nominales ni operación municipal vigente. Falta el smoke end-to-end con sesiones v2 reales en Preview y la homologación funcional de fuentes/reglas. |
| **Producción** | **No desplegada para estos cortes.** | No hay identidad v2/Actions/lifecycle 009A ni registro temporal 010A que pueda declararse operativo. Hace falta desplegar bytes autorizados, aplicar sus migraciones y ejecutar smoke/adversariales remotos antes de cambiar este estado. |

Capacidades concretas cerradas en el foundation:

- identidad v2 resuelta por tenant, sesión, MFA y capability, con superficies legacy basadas sólo en email cerradas;
- Centro de acciones con lecturas y escrituras gobernadas, contexto tenant explícito, control de versión, idempotencia y motivo auditable;
- intake de mayor esfuerzo que registra la declaración como `pending_time_rules`: no calcula horas, adicional salarial ni resultado de nómina;
- lifecycle/onboarding administrativo ligado a sesión privilegiada, MFA, release y tenant para crear el tenant con política cerrada, consultar/vincular/revocar legajo y reemplazar scopes sin borrar el historial;
- registro 010A de metadatos temporales versionados para turnos, fichadas, calendario/feriados, reglas municipales y eventos administrativos, sin URL, archivos, credenciales, localizadores externos ni campos nominales en HTTP.

El backup municipal real **sí contiene** fuentes de control horario: 30 turnos, 32 horarios, 9 tolerancias, 574 asignaciones en `legaturn`, 163.634 jornadas esperadas, 958 fichadas, 55 feriados, 873 prenovedades, 31.622 ausencias y 3.448 licencias. También conserva relaciones explícitas `turnos → horarios`, `legaturn → legajo/turno/local`, `esperanza → legajo/turno` y `fichadas → esperanza`. El límite correcto no es “fuentes inexistentes”, sino **fuentes presentes aún no homologadas ni vigentes para operación 2026**: las jornadas esperadas cubren 2011–2012, las fichadas enero de 2012 y los feriados llegan hasta 2008. El snapshot sirve para descubrir, mapear, reconciliar y construir el modelo; no autoriza a presentar sus registros horarios como situación actual. Siguen cerrados la ingestión viva de relojes, la evaluación productiva, las excepciones calculadas, la preliquidación, la publicación y el posting hacia payroll.

El corte del 21/08 agrega insumos operativos recibidos en planillas: 387 filas persona–área–identificador, 49 áreas organizativas y 13 puntos físicos con flota declarada de 11 K20, 1 SF300 y 1 MB360. Siete puntos extraen por red y seis por medio removible; todos declaran Ethernet y posibilidad de Wi-Fi. Estas planillas mejoran la evidencia de captura, pero siguen `discovered_not_homologated`: faltan responsables y cantidades de agentes en todos los puntos, la columna de guardias/turnos está vacía, 15 etiquetas punto–área requieren alias y ningún serial/firmware/protocolo fue verificado. El contrato agregado `contracts/junin-attendance-inputs.v1.json` convierte estos hallazgos en C1–C6 sin guardar filas personales, direcciones ni coordenadas en Git.

## 2. Lectura honesta del mercado

| Dominio | Evidencia oficial publicada | Estado MuniControl | Decisión de producto |
|---|---|---|---|
| Legajos y estructura | [CIVITAS](https://civitas.com.ar/software-recursos-humanos/) declara RRHH centralizado; [Intervan](https://intervan.com.ar/recursos-humanos/) documenta legajo, estructura, puestos e historial; [SIGeMi](https://sigemi.com.ar/personal/) documenta legajos, novedades, accidentes, asistencia y capacitación. | **Parcial avanzado**: núcleo GRH laboral real, estructura, identidad y calidad. | Convertir GRH en fuente interoperable y reconciliada, no reemplazarla a ciegas. |
| Licencias y ausencias | CIVITAS declara incidencias y licencias; Intervan documenta tipos configurables, saldos y reportes; SIGeMi documenta licencias reglamentarias y parametrizadas; [Oracle](https://docs.oracle.com/en/cloud/saas/human-resources/fautl/how-absences-are-handled-when-integrated-with-time-and-labor.html) integra solicitud, aprobación, saldo y transferencia a tiempo/nómina. | **Parcial avanzado**: Título VI versionado, analítica y primer workflow gobernado. | Completar ledger de saldos, turnos, fichadas, feriados, documentación y resolución humana antes de calcular disponibilidad. |
| Asistencia y turnos | CIVITAS declara QR, PIN, facial y geolocalización; SIGeMi importa relojes y genera tardanzas/ausencias; [Tyler](https://www.tylertech.com/products/time-attendance) documenta horarios, overtime, autoservicio, aprobaciones móviles e integración con nómina; [Oracle](https://www.oracle.com/human-capital-management/human-resources/) documenta scheduling, time tracking y reglas laborales. | **Parcial gobernado; fuente histórica real descubierta**: intake de mayor esfuerzo en `pending_time_rules`, registry 010A y catálogo 011 compilados en QA, y grafo GRH verificable de turno–horario–asignación–esperanza–fichada–prenovedad. La cobertura horaria es histórica y aún no prueba vigencia 2026, ingestión viva ni motor de evaluación. | Homologar el backup y las planillas como insumos operativos, cargar contratos versionados y construir 010C. Separar migración histórica, maestro vigente, reglas municipales aprobadas y feed vivo de relojes. Biometría requiere evaluación legal, privacidad y alternativa no biométrica. |
| Nómina | CIVITAS declara convenios, Ganancias y automatización; Intervan documenta fórmulas, simulaciones, controles, ARCA/ANSES/bancos y asientos; [SIGeMi](https://sigemi.com.ar/sueldos/) documenta novedades y liquidaciones; [Oracle](https://docs.oracle.com/en/cloud/saas/human-resources/fapcd/overview-of-time-and-absence-data-for-payroll.html) documenta la transferencia reconciliable de tiempo/ausencias a nómina. | **Parcial analítico**: corridas GRH cerradas y reconciliadas. Cálculo, publicación y posting siguen cerrados. | Construir preliquidación explicable; no recalcular, publicar ni postear sueldos hasta homologar conceptos, reglas, interfaces y casos dorados. |
| Recibo y autoservicio | CIVITAS declara recibo y firma digital; Intervan documenta recibos, licencias, saldos, fichadas e incidencias en autogestión. | **Faltante**. | Entrega verificable, consentimiento/firma compatible, constancia y acceso mínimo por empleado. |
| Identidad, roles y auditoría | [SIGeMi](https://sigemi.com.ar/producto/) declara roles y auditoría de modificaciones; [OpenGov](https://opengov.com/) declara controles de acceso y audit trails en su plataforma. Las páginas públicas no prueban aislamiento multi-tenant ni segregación de funciones. | **Parcial avanzado**: identity gateway v2, MFA, ACL/capabilities, sesiones revocables, alta del primer administrador tenant, gobernanza maker-checker de propietarios globales y asociación/reactivación explícita de identidades existentes implementados hasta 013 y compilados en QA. Persiste la administración de plantillas de rol. Nada de 005–013 está desplegado en Producción. | Desplegar Preview autorizado y activar cuentas nominales con MFA; verificar aislamiento, allow/deny, suspensión, reactivación, revocación y auditoría antes de Producción. El soporte futuro entre gobiernos será JIT aprobado, no acceso perpetuo heredado. |
| Finanzas y presupuesto | Intervan publica presupuesto, contabilidad, tesorería y bancos; [SIGeMi](https://sigemi.com.ar/presupuesto/) documenta formulación, ejecución, ajustes y evaluación; OpenGov publica presupuesto, performance, financial management y controles de gasto. | **Parcial**: presupuesto aprobado 2026, sin ejecución. | Ingestar modificaciones, compromiso, devengado, mandado a pagar, pagado, tesorería y conciliación desde fuentes oficiales. |
| Compras y patrimonio | Intervan publica solicitud, cotización y orden con control presupuestario; [SIGeMi](https://sigemi.com.ar/compras/) documenta reserva, ofertas, adjudicación, recepción, expediente de pago y portal de proveedores; OpenGov publica procurement y contract management de ciclo completo. | **Faltante**. | Circuito solicitud–cotización–adjudicación–recepción–pago, disponibilidad presupuestaria y maker-checker. |
| Tributario y rentas | Intervan publica padrón, cálculos y pagos; SIGeMi documenta cuenta corriente, catastro, recaudación y planes; OpenGov publica tax & revenue collection con portal y cálculos. | **Faltante**. | Padrón contribuyente separado de RRHH, cuenta corriente temporal, reglas versionadas y pagos conciliados. |
| Expediente y documentos | CIVITAS declara digitalización, clasificación y seguimiento asistidos; SIGeMi incluye expedientes y digesto; Intervan publica trámites con carga documental, seguimiento y notificaciones. | **Faltante**. | Expediente inmutable, documentos con hash, circuitos configurables, firma válida y plazos. |
| Ciudadanía, CRM y trámites | CIVITAS declara atención 24/7 y automatización de trámites; Intervan publica Oficina Virtual; SIGeMi declara portal/app; OpenGov publica CRM, 311, permisos y licencias con portales. | **Faltante**. | Identidad ciudadana separada, catálogo, casos, turnos, notificaciones, pagos y seguimiento omnicanal. |
| Activos, obras y territorio | SIGeMi documenta patrimonio y obras públicas; OpenGov publica asset lifecycle, órdenes de trabajo, planificación de infraestructura, app móvil e integración GIS. | **Faltante**. | Activos y órdenes enlazados a evidencia y SLA; mapas con fuente/corte y privacidad por precisión geográfica. |
| IA aplicada | CIVITAS declara agentes para atención, trámites, expedientes y normativa; OpenGov declara respuestas sobre datos con permisos y fuentes citables; Oracle declara agentes dentro del modelo de seguridad HCM. | **Parcial avanzado**: asistente con fact-packs y privacidad por intención. | Herramientas por capability, evidencia citada, evaluación por intención y humano responsable de toda decisión material. |
| Capacitación y tareas | CIVITAS publica e-learning y tareas; Intervan documenta cursos, asistencia, resultados e historial; SIGeMi documenta capacitación y alertas. | **Faltante**. | Centro de conocimiento, competencias, formación y tareas enlazadas a expedientes/casos. |
| Interoperabilidad | Intervan publica interfaces configurables; SIGeMi declara servicios web e integración con sistemas existentes; [OpenGov](https://developer.opengov.com/docs/quickstart) documenta APIs para permisos, presupuesto, compras, activos y datos abiertos. | **Parcial**: adaptadores y contratos por algunas fuentes. | API y eventos versionados, idempotencia, staging, reconciliación y salida exportable para evitar lock-in. |

### 2.1 Qué eleva la vara cada referente

| Referente | Alcance verificable en fuente pública | Implicación ejecutable para MuniControl | No probado por esas fuentes |
|---|---|---|---|
| [CIVITAS RRHH](https://civitas.com.ar/software-recursos-humanos/) / [Gobierno inteligente](https://civitas.com.ar/gobierno-inteligente/) | Nómina configurable, recibo/firma, asistencia, licencias, tareas, formación y agentes para atención, trámites, documentos y normativa. | La demo comercial debe resolver viajes completos de RRHH y atención, no sólo consultas o tableros. | Reglas exactas para Mendoza, saldos auditables, segregación de funciones, aislamiento tenant, calidad de respuestas, SLA y controles de biometría. |
| [Intervan](https://intervan.com.ar/recursos-humanos/) | Profundidad argentina en legajos, puestos, licencias/saldos, salud, liquidación, interfaces externas, autoservicio, compras, finanzas, rentas y trámites. | La paridad local exige integraciones ARCA/ANSES/bancos, simulación y control posterior, no un liquidador genérico. | Calidad UX, modelo de amenazas, evidencia de inmutabilidad, granularidad RBAC, APIs públicas y métricas de implementación. |
| [SIGeMi](https://sigemi.com.ar/producto/) | Suite modular municipal: RRHH/sueldos, finanzas, compras, rentas, expedientes, ciudadanía, obras, BI, roles y auditoría. | La amplitud municipal es table stake; MuniControl debe crecer por contratos modulares sin mezclar identidades ni fuentes. | Arquitectura actual, experiencia móvil, aislamiento multi-municipio, detalle de MFA/sesiones, SLA y exactitud de cada instalación. |
| [OpenGov](https://opengov.com/) | Plataforma conectada para finanzas, presupuesto, compras, permisos, CRM/311, activos/GIS, rentas, HCM y nómina; documenta APIs de varios dominios. | Diseñar desde ahora un modelo canónico y APIs versionadas para que cada módulo sume red, no silos. | Adecuación argentina/mendocina, impuestos y nómina locales, equivalencia jurídica de sus flujos y resultados en Junín. |
| [Tyler Technologies](https://www.tylertech.com/products/time-attendance) | Tiempo, asistencia, scheduling, múltiples turnos, overtime, autoservicio, aprobaciones móviles, dispositivos e integración de payroll para organismos públicos. | S006 debe modelar turnos, reglas, excepciones, aprobación y costo laboral; importar una fichada no alcanza. | Cumplimiento argentino, reglas de Ley 5811, experiencia real, controles tenant y eficacia de biometría/geofencing. |
| [Oracle HCM](https://www.oracle.com/human-capital-management/human-resources/) | Modelo unificado de RRHH, workforce, ausencia, tiempo, nómina, analytics y controles; documenta la transferencia de ausencias/tiempo y actualización de saldos. | El contrato tiempo–ausencia–nómina debe ser explícito, reconciliable y desacoplado de la captura original. | Localización municipal mendocina, costo/tiempo de implantación, simplicidad para municipios y superioridad frente al GRH actual. |

### 2.2 Matriz competitiva priorizada

**P0** protege identidad, datos personales y dinero o habilita el siguiente circuito; **P1** es paridad necesaria para una suite municipal; **P2** amplía diferenciación después de estabilizar los contratos base.

| Prioridad | Resultado de producto | Señal de mercado | Brecha actual | Criterio de paridad | Diferenciación que debe probarse | Sprint |
|---|---|---|---|---|---|---|
| **P0** | Acceso multi-tenant seguro y administrable | SIGeMi publica roles/auditoría; OpenGov publica control de acceso/audit trail. | Foundation v2/MFA/ACL y lifecycle 009A verificados en local/QA descartable; falta despliegue y operación probada en Producción. | Invitación, MFA privilegiado, contexto explícito, capabilities, revocación, SoD y auditoría; cero lectura cross-tenant en pruebas adversariales del artefacto desplegado. | La administración global no hereda acceso operativo; cada acceso explica tenant, rol/capability, fuente y corte. | S005 / foundation 009A |
| **P0** | Contrato canónico de persona–legajo–puesto–área | Civitas, Intervan, SIGeMi y Oracle parten de un núcleo laboral integrado. | GRH real disponible pero no todas las fuentes operativas están homologadas. | Identidades conciliadas, vigencias temporales, vínculo usuario–legajo y calidad/cobertura visible. | Integrar GRH reversiblemente y mostrar discrepancias en vez de ocultarlas o duplicar personas. | S005–S006 |
| **P0** | Tiempo y asistencia explicables | Civitas, SIGeMi, Tyler y Oracle cubren captura, reglas, excepciones y conexión con nómina. | El intake gobernado de mayor esfuerzo termina en `pending_time_rules`; no hay fuente homologada de turnos/fichadas/feriados ni motor de reglas. | Evento original inmutable + turno + calendario + regla versionada + excepción/corrección aprobada; minutos reconciliados. | Simulación antes de confirmar, maker-checker y razón legible para tardanza, falta u hora extra, sin inventar una marcación ausente. | S006 — siguiente fase |
| **P0** | Licencias/ausencias de punta a punta | Civitas, Intervan, SIGeMi y Oracle publican tipos, solicitudes, saldos o aprobaciones. | Título VI y análisis existen; falta ledger operativo completo. | Solicitud, documento, reserva, decisión, notificación, cancelación y saldo reconciliado por día/hora. | Norma versionada, privacidad clínica, advertencia legal y explicación exacta de cada movimiento del saldo. | S007 |
| **P0** | Preliquidación y recibo verificable | Civitas, Intervan, SIGeMi y Oracle conectan novedades con payroll; Civitas/Intervan publican recibo digital. | Hay lectura analítica de corridas GRH, no motor homologado; cálculo, publicación y posting están cerrados. | Conceptos y fórmulas vigentes, casos dorados, simulación, control, cierre y entrega; conciliación al centavo. | Diferencia explicada contra GRH y trazabilidad desde la novedad hasta concepto, asiento, pago y recibo. | S008 |
| **P0** | Autoservicio mínimo del empleado | Intervan publica datos, licencias, saldos, fichadas y recibos; Tyler publica autoservicio de tiempo. | Portal de empleado faltante. | Cada empleado ve sólo sus datos, solicita/corrige por circuito y recibe notificaciones/constancias accesibles. | Mostrar procedencia, vigencia y canal de rectificación; adelantar este corte a S007–S008 sin esperar el portal ciudadano completo. | S007–S008, corte de S012 |
| **P1** | Ejecución financiera y tesorería | Intervan, SIGeMi y OpenGov publican presupuesto/finanzas integrados. | Sólo presupuesto aprobado, sin ejecución oficial. | Crédito vigente, etapas del gasto, bancos, caja y conciliaciones con fuente oficial. | Tablero ejecutivo sin cifras inferidas, trazable hasta asiento/documento y con alertas de calidad. | S009 |
| **P1** | Compras y proveedores | Intervan, SIGeMi y OpenGov publican circuitos de compra/proveedor/contrato. | Faltante. | Reserva, solicitud, ofertas, evaluación, adjudicación, recepción, factura, pago y portal. | Segregación verificable, comparativa reproducible y alertas de riesgo sin acusación automática. | S010 |
| **P1** | Expediente, trámite y ciudadanía | Civitas, Intervan, SIGeMi y OpenGov publican documentos, trámites, portales o CRM/311. | Faltante. | Identidad separada, expediente versionado, firma/notificación válida, estado y SLA omnicanal. | Una sola línea de tiempo ciudadano–expediente–orden–pago con privacidad por rol y evidencia reutilizable. | S011–S012 |
| **P2** | Activos, obras, 311 y GIS | SIGeMi publica patrimonio/obras; OpenGov publica asset lifecycle, work orders, app e integración GIS. | Faltante. | Activo, ubicación, responsable, orden, cuadrilla, evidencia y costo enlazados. | Precisión geográfica por permiso, capas con fuente/corte y resultado de servicio visible al vecino. | S013 |
| **P2** | Agentes municipales gobernados | Civitas, OpenGov y Oracle publican IA integrada a tareas/datos/permisos. | Asistente de consulta parcial; operaciones materiales restringidas. | Herramientas allowlisted, fuentes citadas, permisos heredados, costos/cuotas y derivación humana. | Evaluación por intención, abstención correcta, privacidad por diseño y reconstrucción completa de cada respuesta/acción propuesta. | S014 |

### 2.3 Criterios de paridad y diferenciación

Una capacidad alcanza **paridad** sólo cuando cumple todos estos puntos:

1. resuelve un viaje completo para los roles reales involucrados, incluidos rechazo, corrección, cancelación y revocación;
2. usa una fuente real identificada, con contrato de datos, vigencia, cobertura y reconciliación;
3. aplica tenant, área, capability y segregación de funciones del lado servidor;
4. conserva autor, tiempo, versión, evidencia y motivo suficientes para reconstruir la decisión;
5. pasa pruebas funcionales, adversariales, de accesibilidad y de degradación segura en un entorno aislado;
6. el mismo artefacto probado se valida luego en el entorno desplegado autorizado.

Una capacidad se considera **diferenciadora** sólo si, además de la paridad:

- reduce un tiempo, error, reproceso o incertidumbre contra una línea base publicada;
- explica fuente, corte, regla y límites en el punto de decisión;
- permite integrar, exportar, reconciliar y revertir sin encerrar al municipio;
- demuestra cumplimiento normativo versionado y revisión humana en acciones materiales;
- mantiene la tarea simple para cada rol en desktop y móvil;
- prueba que la IA cita, se abstiene y no amplía permisos.

La evolución se reportará como `declarado → operable en QA → piloto autorizado → probado en Producción`. No se utilizará “completo” como sinónimo de código escrito o pantalla visible.

## 3. Ventajas que deben diferenciarnos

La paridad de funcionalidades no alcanza. MuniControl debe competir con cinco ventajas demostrables:

1. **Verdad y linaje por defecto.** Cada cifra muestra fuente, corte, grano, cobertura, conciliación y límites. Un dato ausente se declara ausente.
2. **Gobierno seguro del trabajo.** Roles por tenant y área, capacidades granulares, segregación de funciones, idempotencia, control de versión y auditoría append-only.
3. **Normativa versionada y explicable.** Licencias, nómina, presupuesto y tributos se calculan con políticas fechadas, evidencia de entrada y revisión humana.
4. **IA contenida por contrato.** Datos nominales y operaciones sensibles permanecen locales; proveedores externos reciben únicamente agregados allowlisted. La IA no aprueba, paga, sanciona ni modifica un legajo.
5. **Implementación reversible.** Adaptadores de fuentes, staging, hashes, previsualización, aprobación y rollback; se integra con sistemas existentes antes de pretender reemplazarlos.

## 4. Arquitectura objetivo

```text
Identidad y tenant gateway v2
  -> capacidades, áreas, MFA, sesión revocable, auditoría
     -> Centro de acciones gobernado en lectura y escritura
        -> RRHH / tiempo / licencias / nómina
        -> presupuesto / compras / contabilidad / tesorería
        -> rentas / proveedores / patrimonio
        -> ciudadano / turnos / reclamos / trámites / pagos
           -> capa analítica y geográfica con linaje
              -> asistente IA gobernado por fact-packs y políticas

Fuentes municipales
  -> adaptadores versionados
     -> staging y controles de calidad
        -> modelo canónico temporal
           -> consultas, métricas y comandos con doble control
```

La plataforma seguirá siendo modular: un gobierno activa sólo los dominios para los que posee autoridad, fuente, normativa y responsables definidos.

## 5. Roadmap priorizado

### S005 / foundation 005–009A — Identidad, Actions y lifecycle tenant-aware — **implementado en local/QA; no desplegado en Producción**

- Invitación y activación de un solo uso sin contraseña inicial ni secretos persistidos en URL, logs o almacenamiento del navegador.
- Identidad v2, tenant, membresía, área, ACL/capability y release resueltos del lado servidor desde una sesión registrada.
- MFA obligatorio para propietarios, administradores y capacidades privilegiadas/restringidas; las superficies legacy basadas sólo en email quedan cerradas.
- TOTP sirve como segundo factor inicial, pero no es resistente al phishing; la meta es ofrecer passkeys/WebAuthn antes de una exposición pública amplia.
- Sesiones registradas, rotables y revocables; expiración absoluta, inactividad y rechazo de contexto/versiones obsoletos.
- Lecturas y escrituras del Centro de acciones gobernadas por tenant, capability, versión, idempotencia y motivo auditable.
- Intake de mayor esfuerzo aceptado únicamente como declaración `pending_time_rules`; ninguna hora ni impacto salarial se calcula todavía.
- Onboarding/lifecycle administrativo ligado a sesión privilegiada: alta con política cerrada, consulta y vínculo de legajo, revocación y reemplazo de scopes conservando historial.
- La identidad global auditada conserva `PLATFORM_OWNER`; el acceso operativo a Junín debe ser una vinculación explícita, no una herencia del rol global. Su identificador no se versiona en Git.
- La migración 013 agrega esa vinculación para identidades managed con MFA y la reactivación versionada. El perfil `TENANT_RRHH_ADMIN_OPERATIVO` permite ver legajos y preparar cambios, pero separa salario, salud, aprobaciones y posting. No crea roles ni credenciales PostgreSQL y no hereda tenants futuros.
- Cuentas reales siguen inactivas hasta que email/entrega, recuperación, rate limit, despliegue y data plane tenant-aware estén verificados en el entorno autorizado.

**Evidencia de cierre del foundation:** contratos y negativas verificados localmente; aplicación/reaplicación y casos adversariales ejecutados en una rama Neon QA descartable con fixtures sintéticos de control plane y fuentes protegidas sólo de lectura. Producción no recibió este corte.

**Aceptación de producto aún pendiente:** ninguna cuenta activada puede leer otro tenant; revocar membresía/sesión surte efecto en la siguiente solicitud; replays y fuerza bruta fallan cerrados; auditoría no guarda secretos. Estos criterios deben repetirse sobre el mismo artefacto desplegado antes de llamar completa a la capacidad.

### S006 / 010A–010C — Tiempo explicable por capas — **010A/010B compilados en QA; C1–C6 planificados con insumos reales**

**010A implementado y compilado en QA:** registro tenant-aware de metadatos y readiness para cinco dominios; workflow borrador–presentado–aprobado/rechazado–retirado/cancelado; SoD por persona, maker-checker, replay histórico, auditoría acotada y proyección sin PII/localizadores. La UI y el browser contractual pasaron en escritorio/móvil y tres zonas horarias. Fresh apply/reapply PostgreSQL quedaron verificados; todavía no hay contratos de fuentes municipales homologados cargados.

**010B/011 implementado y compilado en QA:** el grafo horario real ya descubierto tiene manifiesto MariaDB→canónico y catálogo versionado de calendarios, turnos diurnos/nocturnos, reglas y asignaciones. Fresh apply/reapply dinámico quedó verificado; falta homologación funcional municipal y carga de versiones vigentes. **010C posterior:** conectores vivos, reconciliación, simulación y ledger de excepciones; ningún cálculo o posting se adelanta.

**010C descompuesto con evidencia actual:** C1 homologa Excel/GRH/alias; C2 registra puntos y flota; C3 ingiere red + medio removible; C4 habilita reloj/web/QR/PIN/WhatsApp/geofence puntual; C5 calcula y explica con reglas 011; C6 opera la flota multi-gobierno. WhatsApp entrega desafíos y nunca reemplaza identidad/autorización; ubicación continua y biometría central quedan cerradas por defecto.

- Registro de fuentes aprobadas: dueño, período, cobertura, zona horaria, formato, corte y estado de homologación; una fuente ausente permanece ausente.
- Catálogo versionado de calendarios, feriados, turnos, tolerancias y reglas por tenant, convenio, vigencia y prioridad, con estados borrador–aprobada–retirada.
- Asignación temporal de turno a contrato/persona sin sobrescribir historia y sin deducir horarios desde eventos incompletos.
- Motor determinista de evaluación y simulación que devuelve regla, versión, entradas, minutos y explicación; si falta turno, calendario o marcación, mantiene el caso pendiente.
- Ledger de excepciones y correcciones con motivo, evidencia, maker-checker y resultado antes/después; el evento original permanece inmutable.
- Conectores de fichadas por API/archivo sólo después de registrar una fuente real, mediante staging reversible, deduplicación, cuarentena y reconciliación.
- Tardanza, falta, horas ordinarias y extraordinarias explicables por regla; las declaraciones existentes de mayor esfuerzo continúan en `pending_time_rules` hasta completar este circuito.
- Aprobación de mayor esfuerzo separada del cálculo y de cualquier impacto posterior; payroll/posting continúa deshabilitado.
- Geolocalización sólo para funciones justificadas y con minimización; reconocimiento facial fuera del alcance inicial hasta evaluación normativa, DPIA y alternativa no biométrica.

**Aceptación final de S006:** cada minuto calculado reconcilia contra una asignación de turno, calendario, fichadas, regla versionada y excepción/decisión; el resultado se reproduce con las mismas entradas. 010A sólo acepta metadatos gobernados y conserva todos los flags operativos cerrados. Una entrada incompleta produce `pending_time_rules` o excepción explícita, nunca presentismo, ausencia, hora extra ni monto inventado.

### S007 — Licencias operativas completas

- Solicitud, documentación, validación, decisión, notificación y cancelación.
- Ley 5811 Título VI + políticas municipales versionadas.
- Saldos por clase y período únicamente cuando exista ledger de otorgamientos/consumos confiable.
- Licencias por día o fracción horaria con calendario laboral homologado.
- Salud como dato restringido; motivo clínico no visible en listas generales.
- Escrituración hacia GRH sólo mediante adaptador, aprobación y reconciliación posterior.

**Aceptación:** saldo inicial + otorgado - consumido - reservado = saldo disponible; casos ambiguos requieren RRHH/Asesoría Letrada y no se autoaprueban.

### S008 — Preliquidación y recibo digital

- Cálculo, publicación y posting permanecen cerrados hasta contar con el motor temporal homologado, capabilities separadas y casos dorados aprobados.
- El corte del 02/09/2026 avanza de menor a mayor. C1 y D0 ya existen en la rama aislada como conciliación 701/703 y borradores locales no oficiales: no persisten la observación, no tienen `runId`, responsable validado, aprobación del servidor ni firma digital. B2.1 suma en código un parser servidor estricto y un esquema privado tenant-bound con procedencia declarada, cuarentena, HMAC, auditoría, idempotencia y maker-checker, pero todavía no fue aplicado a Neon ni conectado a una API o bandeja. El orden institucional sigue siendo **S008-B2 operativo → S008-C2 → S008-D**: recepción gobernada del corte, corrida general con conciliación al centavo y maker-checker, y recién entonces Excel/PDF institucionales desde esa misma corrida aprobada. Esta secuencia no adelanta cálculo, publicación ni posting de haberes. F.931/LSD queda como salida asistida posterior, no como integración fiscal inicial.
- El paquete mensual observado aporta archivos de regresión y planillas de control; no habilita presentación fiscal automática ni convierte reglas orales en política productiva. La evidencia detallada se conserva en `docs/CIVITAS_GRH_PAYROLL_EVIDENCE_20260902.md`.
- Catálogo de conceptos, convenios, vigencias, fórmulas, topes y novedades.
- Simulador de recibo con explicación de cada concepto y comparación contra GRH.
- Circuito novedades–cálculo–control–cierre–publicación con maker-checker.
- Ganancias y cargas sólo después de homologación profesional y pruebas doradas.
- Recibo digital verificable, firma/aceptación, entrega y constancia.

**Aceptación:** totales bruto/descuentos/neto y costo empleador reconcilian al centavo; una corrida abierta nunca se publica como cerrada.

La migración técnica **009A de lifecycle no equivale al sprint funcional S009** siguiente: 009A fortalece el control plane; no implementa ejecución financiera.

### S009 — Ejecución presupuestaria, contabilidad y tesorería

- Ingesta oficial de crédito inicial/vigente, compromiso, devengado, mandado a pagar y pagado.
- Plan de cuentas y clasificadores versionados.
- Libro bancos, caja, transferencias, retenciones y conciliación.
- Tablero ejecutivo con ejecución, disponibilidad y flujo; sin cifras si la fuente no está cargada.

**Aceptación:** conciliaciones por etapa y cuenta; todo ajuste conserva asiento origen, autor, motivo y aprobación.

### S010 — Compras, proveedores y patrimonio

- Solicitud, autorización, reserva, cotización, evaluación, adjudicación, orden, recepción y factura.
- Portal de proveedores con documentación, vencimientos, ofertas y estado de pago.
- Inventario/patrimonio con alta, transferencia, responsable, mantenimiento y baja.
- Alertas de fraccionamiento, concentración, conflicto y vencimiento como controles, no acusaciones automáticas.

### S011 — Expediente y documento electrónico

- Carátula, numeración, pases, plazos, tareas, documentos, firmas y archivo.
- Hash y versión de documentos; plantillas institucionales.
- Buscador con permisos, OCR y clasificación; IA sólo propone metadatos/resúmenes.
- Integraciones oficiales de firma digital y notificación cuando sean jurídicamente válidas.

### S012 — Portal empleado y ciudadano

- Empleado: datos laborales mínimos, recibos, licencias, novedades, certificados y capacitación.
- Ciudadano: identidad, trámites, turnos, reclamos, pagos, certificados y notificaciones.
- Proveedor: compras, contratos, facturas, retenciones y pagos.
- Accesibilidad WCAG, lenguaje claro y continuidad omnicanal.

### S013 — Territorio, incidencias y mapa de gestión

- MapLibre y ECharts fijados, empaquetados localmente y sin CDN.
- Capas de reclamos, obras, servicios, activos, cuadrillas y zonas; cada capa con fuente/corte.
- Orden de trabajo, SLA, evidencia antes/después y comunicación al vecino.
- Privacidad espacial: coordenada exacta sólo para operadores autorizados; agregación para tableros.

### S014 — Agentes municipales gobernados

- Orquestador por dominio y capability; herramientas explícitas, no SQL libre.
- Atención 24/7 con catálogo/versiones y derivación humana.
- Borradores de expedientes, respuestas y notificaciones con evidencia citada.
- Detección de anomalías explicable y revisión humana.
- Evaluaciones por intención: exactitud, privacidad, costo, latencia, rechazo seguro y trazabilidad.

### S015 — Gestión estratégica y aprendizaje

- Objetivos, programas, proyectos, responsables, hitos, riesgos y presupuesto asociado.
- Tablero intendente/gobernador con compromisos y resultados comparables.
- Campus interno, perfiles de competencia y trazabilidad de capacitación obligatoria.
- Encuestas y satisfacción con metodología y tamaño de muestra visibles.

## 6. Orden de ejecución inmediato

1. Conservar como baseline los fingerprints y el informe de la QA 005–013; no confundir esa rama descartable con Preview o Producción.
2. Homologar el backup municipal del 19/08/2026 y las tres planillas como insumos reales: documentar `turnos`, `horarios`, `tolerancias`, `legaturn`, `esperanza`, `fichadas`, `feriado`, `prenove`, `ausencia` y `licencia`, sus relaciones, cobertura histórica, nulabilidad y vigencia. Pedir al municipio sólo las definiciones funcionales, reglas vigentes y datos de dispositivos que las fuentes no pueden acreditar; no completar huecos con datos sintéticos.
3. Preparar Preview con data plane runtime no-owner, secretos identity v2 y dos owners MFA; activar cuentas representativas y ejecutar permisos positivos/negativos por rol y tenant.
4. Cargar en 010A/011 únicamente calendarios, turnos y reglas homologados, con versión, vigencia, fuente y aprobadores; mantener cálculo y escritura GRH/payroll cerrados.
5. Incorporar en 010C un conector de fichadas sólo cuando exista fuente aprobada, usando staging, deduplicación, cuarentena y reconciliación.
6. Agregar simulación determinista y ledger de excepciones; probar vigencias, prioridades, cambio de turno, falta de entrada, solapamientos, rechazo, corrección y concurrencia.
7. Habilitar revisión/aprobación temporal sólo después de reconciliar cada minuto. Mantener cálculo salarial, publicación y posting de payroll cerrados.
8. Completar S007 usando el Centro de acciones y adelantar el autoservicio mínimo del empleado: solicitud, saldo, estado y constancia.
9. Recién después iniciar S008; no calcular recibos productivos con reglas inferidas. En paralelo, acordar el formato oficial de ejecución presupuestaria para el sprint funcional S009.
10. Actualizar este benchmark al cerrar cada sprint y después de cualquier demo contractual de un competidor; una demo observada debe registrarse separada de lo publicado.

## 7. Límites no negociables

- No copiar código, diseño, textos, bases ni material protegido de competidores.
- No crear usuarios ficticios en Producción ni contraseñas compartidas.
- No activar biometría/geolocalización por moda; requiere finalidad, proporcionalidad, alternativa y retención definida.
- No permitir que `PLATFORM_OWNER` herede acceso a legajos, sueldos o salud.
- No usar una IA como decisor administrativo, liquidador final ni autoridad legal.
- No calcular horas, saldos, sueldos, ejecución o tasas cuando falten las fuentes necesarias.
- No escribir directamente sobre tablas importadas de GRH; usar casos, eventos, adaptadores y reconciliación.

## 8. Cómo se medirá “mejor que la competencia”

Cada módulo deberá demostrar, no sólo declarar:

- tiempo de implementación y porcentaje de datos reconciliados;
- cobertura funcional real y campos pendientes por fuente;
- tasa de resolución y duración por etapa, con definición publicada;
- disponibilidad, latencia y degradación segura;
- accesibilidad desktop/móvil y tarea completada sin asistencia;
- cero accesos cross-tenant en suite adversarial;
- revocación efectiva, segregación de funciones y auditoría reconstruible;
- exactitud de cálculos con casos dorados y conciliación monetaria/temporal;
- privacidad: mínimo dato, retención, exportación y eliminación gobernadas;
- calidad del asistente por intención, incluyendo abstención correcta.

La demostración de producto se organizará por viajes de rol y no por menú:

1. `PLATFORM_OWNER` crea o administra un tenant sin obtener acceso implícito a sus datos operativos;
2. RRHH vincula usuario–legajo y tramita una licencia con norma, turno, saldo y evidencia;
3. la autoridad habilitada ingresa una declaración temporal y, mientras falten calendario/turno/regla, el sistema la conserva como `pending_time_rules`; sólo una fase posterior permitirá aprobar minutos reconciliados, sin posting automático a payroll;
4. el empleado consulta lo propio, solicita una rectificación y recibe constancia;
5. auditoría reconstruye quién hizo qué, con qué versión, fuente y autorización;
6. el intendente visualiza agregados reales y puede bajar hasta evidencia autorizada sin exponer salud, sueldo nominal ni otro tenant.

Esta hoja de ruta es viva: una capacidad pasa de “parcial” a “completa” sólo con fuente real, contrato de datos, controles, UX operativa, pruebas, evidencia en un entorno aislado y smoke del mismo artefacto desplegado.
