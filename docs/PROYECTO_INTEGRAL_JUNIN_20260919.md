# Proyecto integral MuniControl - Municipalidad de Junin

Version de trabajo: 19/09/2026. Propietario tecnico: Marcelo. Responsables funcionales de referencia: Hugo (Personal/asistencia), Noelia (Contaduria/liquidacion) y Mariano (Juridica). Este documento organiza desarrollo y aceptacion; no concede atribuciones administrativas a una cuenta ni declara completadas las funciones propuestas.

Actualizacion 23/09/2026: la fase B se detalla en [Asistencia, calculo y aprobacion de Hugo](ASISTENCIA_CALCULO_Y_APROBACION_HUGO_20260923.md), con seis sprints y casos de aceptacion para evitar horas sumadas o descontadas sin fundamento. El parque comun de catorce puntos, con seis incorporados actualmente e incluyendo PM10, se precisa en [Un parque municipal de relojes](CLOCK_FLEET_UNIFIED_20260923.md). Los estados fechados del 19/09 conservados debajo son historicos y no describen la conectividad actual.

## 1. Objetivo y decisiones que se conservan

MuniControl sera el sistema operativo propio, no un visor permanente de GRH. El traspaso se realiza por dominio, poblacion y fecha efectiva. Los UUID nativos no dependen del legajo externo. GRH/GRH Web/GAF/GAT son fuentes autorizadas de migracion, evidencia funcional o compatibilidad durante la transicion; no destinos de escritura automatica bidireccional.

Se conserva lo desarrollado: tablas, funciones, identidades, legajos nativos, relojes, acuses, parametros, novedades, documentos juridicos y auditoria. Un backup nuevo entra como candidato conciliable y nunca se restaura encima de las operaciones propias. El candidato septiembre ya persistido en PG18 no esta activo para los usuarios; el corte de fuente del dia 10 no acredita el cierre mensual ni novedades posteriores.

La ventana operativa se organiza por gestion anterior completa mas gestion actual, con meses iniciales completos y dos anos extra opcionales. Los antecedentes necesarios para antiguedad, derechos, licencias, retenciones, obligaciones y auditoria permanecen disponibles aunque sean mas antiguos. La historica conserva detalle recuperable; los resumenes comparativos cubren las gestiones requeridas. No se archiva ni destruye normativa por cumplir ocho o diez anos: la historia juridica y contractual tiene su propia politica.

## 2. Evidencia y estado observado hoy

Fuentes de requisitos: propuesta de seis modulos de Mariano recibida en esta conversacion; documentos versionados `MATRIZ_ACEPTACION_NOELIA.md`, `NOELIA_REPORT_REQUIREMENTS_20260903.md`, `CIVITAS_GRH_PAYROLL_EVIDENCE_20260902.md`; instrucciones y acuerdo paralelo de relojes del 10/09. Se confirmo que estan presentes los PDF originales de los modulos 1-2, 3, 4, 5, 6 y 7, y el DOCX de reunion del 09/09. En esta sesion se profundizo su matriz ya extraida; no se afirma haber navegado GRH/GAF/GAT ni releido todas las capturas originales.

| Dominio | Evidencia real | No confundir con |
| --- | --- | --- |
| Relojes adicionales | Cinco colas de captura local con lecturas del 19/09; supervisor Windows de usuario | Cinco envios recibidos: no estan configurados |
| PM-10 | 143 acuses en Neon; 11.706 registros confirmados en el resumen local | Conexion actual: captura bloqueada por LAYOUT_NOT_CONFIRMED al iniciar la revision |
| Autonomia de host | Las dos tareas existentes usan cuenta guill y LogonType Interactive | Servicio municipal independiente de la PC: no esta instalado |
| Receptor multirreloj | Endpoint ZK40 publicado; cero inscripciones adicionales en la consulta | Todos los PM dados de alta y enviando |
| Septiembre | Candidato sellado en copia PG18, 147 tablas previas preservadas | Fuente activa ni nomina propia cerrada |
| Juridica | Registro versionado, articulos, PDF, comparacion, exportacion, revision documental y seguimientos | Registro contractual, expediente completo o dictamen IA |
| Noelia | Circuitos y generadores parciales en plataforma, muestras y reglas documentadas | Compatibilidad bancaria final o liquidacion autonomamente homologada |

La referencia de conectividad del 18/09 identifico PM02/03/05/06/10/14 accesibles por TCP; PM01/09 sin respuesta; PM04/07/08/11/12 sin ruta municipal seleccionada y PM13 sin direccion aportada. Es un diagnostico fechado, no estado vivo. IP/series/credenciales/topologia permanecen en evidencia privada. Ningun cambio de orden en una planilla renumera PM ni reasigna su historia.

## 3. Arquitectura funcional y autonomia de relojes

Flujo: reloj/archivo -> colector municipal -> cola durable por identidad -> HTTPS y acuse validado -> evento original inmutable -> identidad/contrato por fecha -> jornada/regla/calendario -> excepcion revisable -> aprobacion de Personal -> novedad de nomina -> preliquidacion -> control -> cierre -> artefactos -> constancia del banco/organismo.

El colector debe residir en un equipo o VM municipal encendido permanentemente, con disco local y acceso a los relojes mediante LAN o VPN de equipo. Una VPN abierta solo por el usuario al iniciar sesion no cumple el objetivo. Las delegaciones sin ruteo central requieren ruteo autorizado o colector local; no se expone el puerto del reloj a Internet. El navegador y Vercel no sustituyen la conectividad de esa red privada.

Un coordinador de procesos reutiliza los lectores actuales y conserva el adaptador PM10. Cada equipo conserva serie verificada, cola, bloqueos y acuses propios. Captura, transporte y calculo son componentes independientes: un receptor caido no borra la captura; un reloj sin ruta no bloquea a los otros; una identidad no vinculada queda pendiente. Estado de proceso, captura, acuse y cobertura son cuatro hechos distintos.

Instalacion prevista: Windows Task Scheduler con cuenta de servicio local limitada, inicio al arrancar y sin contrasena personal; alternativa Linux mediante systemd y cuenta dedicada. Codigo/configuracion de lectura y solo directorios de estado escribibles. Credencial de captura y credencial HTTPS separadas; no son cuentas del portal ni del banco. Las conexiones requieren cifrado valido, sin desactivar verificacion TLS.

Traspaso del host: registrar origen/destino/version; detener el propietario anterior al final del ciclo; copiar colas y acuses privados conservando hashes; comprobar los bloqueos retenidos y no transplantar un PID como identidad; verificar configuracion por serie; ejecutar captura y envio limitado; comprobar idempotencia; ensayar reinicio y sesion cerrada; confirmar acuses mientras la PC de Marcelo esta apagada. Solo entonces se retira la tarea provisional. No hay dos lectores simultaneos para una misma identidad.

Criterio CLK-01: todos los puntos habilitados muestran su ultima captura y acuse demostrables, mas una lista de los puntos todavia sin ruta/inscripcion; no una cifra global que oculte faltantes. Criterio CLK-02: corte de Internet conserva cola; recuperar red envia sin duplicados; ACK perdido no duplica; conmutar USB/red tampoco duplica. Criterio CLK-03: reinicio y cierre de sesion municipal demostrados, sin dependencia de la PC del desarrollador. Criterio CLK-04: clave/serie/formato rechazados conservan bloqueo y evidencia; no se rearman automaticamente para forzar lecturas.

## 4. Hugo: asistencia explicable y novedades aprobadas

El resultado de una jornada necesita contrato vigente, asignacion de horario, calendario/feriado, regla aprobada, marcaciones vinculadas y licencias/justificaciones que afecten ese tramo. Una fichada sola es incompleta; un periodo sin cobertura de captura no prueba ausencia; MAX(salida)-MIN(entrada) no basta para todos los turnos. Se contemplan turnos partidos/nocturnos, varios pares, tolerancia, descansos, feriados, superposiciones, permisos por horas y cambios de contrato.

El motor devuelve segundos/minutos, pares utilizados, marcas descartadas con motivo, regla/version y cobertura. Tardanza, exceso sobre jornada y ausencia son propuestas explicadas. Topes de extras, redondeos y conversion a dias requieren reglas fechadas; no se infiere un importe desde el codigo del dispositivo.

Circuito: calculado -> requiere datos/revision -> presentado -> aprobado/devuelto/rechazado -> consumido por nomina. Toda nueva evidencia crea una revision; una revision ya consumida no modifica silenciosamente un periodo cerrado. Una licencia solicitada, aprobada y contabilizada no son el mismo estado. La reserva y el consumo de saldo deben conciliar con el libro de movimientos.

Contrato propuesto `attendance-approved-novelties.v1`: tenant_id, person_id, employment_contract_id, evaluation_id, revision, period, timezone, result_type, quantity, unit, rule_version_id, evidence_refs, coverage_status, approval_id, approved_at, idempotency_key, supersedes_revision. El actor/aprobacion se resuelve en servidor; no se confia en un campo supplied_by_client. Nomina asigna concepto/valor y comprueba cierre, alcance y duplicidad nuevamente. Este contrato no esta publicado como integracion operativa por este documento.

Aceptacion Hugo: caso normal, turno nocturno, marca faltante, licencia parcial, feriado, hora extra con tope, devolucion y correccion; reconstruir cada minuto y cada decision. Repetir una revision aprobada no genera dos novedades. Un cambio de norma puede abrir una tarea de revision, nunca aplicar un descuento salarial por si solo.

## 5. Noelia: de la novedad al paquete de entrega

Regla de experiencia: elegir periodo, tipo de liquidacion y alcance una sola vez; conservar esos filtros hasta la conciliacion y todas las salidas. El boton Preparar paquete produce artefactos de la misma corrida/version aprobada, sin volver a transcribir ni leer hojas locales desvinculadas. Debe existir vista previa, lista de faltantes y totales antes de habilitar la salida final.

| Manual de origen | Resultado comprometido en el plan | Prueba de aceptacion |
| --- | --- | --- |
| 1-2 Datos/Reportes, pp.1-3 | Catalogo cotidiano por periodo, banco, jurisdiccion y reparto; Excel/PDF/TXT desde la misma fuente | Misma poblacion, importes y filtros en pantalla y archivos; nada oculto fuera de pagina |
| 3 Importacion de novedades, pp.1-8 | Perfiles por concepto/entidad, validacion, filas rechazadas, confirmacion e idempotencia | Dos envios del mismo archivo no duplican; diferencias quedan explicitadas |
| 4 Integracion sueldo-GAF, pp.1-3 | INSUTACO concepto/reparticion/partida/cuenta e INSULEGA institucion/funcion | Suma de imputaciones igual a corrida aprobada; excepciones bloquean contabilizacion |
| 5 Novedades, pp.1-4 | Individuales, masivas, manuales y fijas con vigencia; importe opcional y correccion auditada | Ausencia de importe no pasa a cero; anular conserva original, motivo y sustitucion |
| 6 Parametros, pp.1-6 | Conceptos, auxiliares, escalas y formulas por convenio y vigencia; copia con vista de impacto | Comparacion por convenio/legajo y doble control antes de activar |
| 7 Liquidacion, pp.1-3 | Preparar, simular, Confirmar liquidacion, anular/reliquidar, cerrar e imputar | Bruto, descuentos, neto y costo reproducibles por concepto; original cerrado inmutable |

No se pierden detalles documentados: mayor dedicacion 44 y Full Time 95; OSEP 601/602/603/605, tratamiento separado de 604/685; perfil Retro de 678; carga conjunta de formulas 606/607/612/550; auxiliares 88/90 con alcances distintos por convenio; responsabilidad jerarquica 80 con alta/vencimiento. La matriz original detalla los restantes codigos y sigue siendo fuente. Las capturas inconsistentes, factores 0,81, 16,5% y 45%, offsets y redondeos no se convierten en reglas generales sin cotejo y aprobacion fechada.

| Salida | Perfil / alcance que debe conservarse | Condicion de liberacion |
| --- | --- | --- |
| Credicoop | TXT observado 30 posiciones y control 66; J42/J55; ahorro/corriente segun pedido | Layout/encoding/orden aceptados; cuenta validada y total igual al neto aprobado |
| Santander y Nacion | GT_PAGOS observado 200; caja de ahorro, J42/J55; no inventar cuenta corriente | Muestra oficial comparada campo a campo y archivo importado sin rechazo |
| Transferencias varias | TXT observado 167 + Excel; nombre correcto en pantalla | Beneficiarios/cuentas/importe exactos, sin dobles transferencias |
| OSEP / Seguro Mutual | OSEP185/206 y Mutual121 segun perfil y poblacion | Conceptos, jurisdiccion y sumas del mismo corte conciliados |
| ART Provincia | DNI, CUIL, sexo, dias y sueldo=993+995 de agentes liquidados | No llenar dias ausentes con30; bloquear campos obligatorios no verificados |
| Escolaridad | Activos con hijos, presentacion, ciclo/nivel/curso/vencimiento, Excel | Poblacion activa distinta de liquidada; dato extraido/revisado y documento enlazados |
| F.931 / paquete provincial | Tres TXT total/J42/J55, mensual y suplementarias; ancho observado463 | Confirmar layout y poblaciones; no asumir particion simple ni envio ARCA automatico |

Cada adaptador debe fijar version, vigencia, muestra de referencia, encoding, BOM, fin de linea, posiciones, relleno, decimales, duplicados, nombre y totales. Anchos observados no certifican por si solos un archivo utilizable por el banco. Los XLS con formulas no extraidas deben validarse mediante herramienta compatible o exportacion fiel, sin inventar sus expresiones.

Seguridad de pagos: la revision de cuenta/CBU y su modificacion requieren controles propios; separar generacion, aprobacion, descarga, entrega al banco, aceptacion y pago. Guardar hash de archivo, idempotencia de remesa, resultado bancario y rechazo por fila. Un segundo click no crea una segunda remesa; regenerar identifica su misma version. No usar cuentas de pruebas ni ejecutar transferencias reales para demostrar el generador. La credencial GRH no equivale a autorizacion para operar la banca.

## 6. Mariano: seis modulos relacionados, no seis archivos aislados

| Modulo | Base existente o limite | Siguiente resultado verificable |
| --- | --- | --- |
| Registro Normativo | Registro/PDF/articulos/versiones, comparacion, exportaciones, revision documental y seguimientos publicados | Identidad normativa estable, tipos Ordenanza/Decreto/Resolucion, relaciones revisadas y acervo historico |
| Registro Contractual | No se declara un ciclo contractual operativo | Partes, objeto, instrumento, anexos, montos/moneda, plazo, clausulas, obligaciones, garantias, responsable y modificaciones versionadas |
| Expedientes y documentacion | Fichas/seguimientos no equivalen a expediente | Caratula, numeracion, asunto, interesados, documentos, pases, actuaciones, decisiones, permisos y cierre trazable |
| Motor de Vigencia y Relaciones | Ultima version documental no determina vigencia | Estado juridico temporal por norma/articulo, relaciones y actos de aprobacion con fundamento |
| Alertas y Agenda | Seguimientos internos persistidos; no avisos automaticos certificados | Responsable, proxima actuacion, calendario de obligaciones y avisos con entrega/reintento/cancelacion |
| Inteligencia/Analisis Juridico | Lector/comparador documental no equivale al analista integral solicitado | Revision de proyecto contra corpus autorizado, observaciones citadas y revision humana antes de dictamen |

### 6.1 Bandeja de asuntos municipales

Un asunto vincula proyecto normativo, norma/version/articulo, expediente o contrato/clausula. Tiene titulo, tipo, area responsable, responsable vigente, proxima actuacion, fecha objetivo y estado. Ciclo propuesto: borrador -> asignado -> en revision -> devuelto con observaciones -> respondido con evidencia -> revisado -> cerrado. Cancelacion o reapertura crean eventos con motivo; no sobrescriben el historial. La asignacion deriva de membresias vigentes, nunca de texto libre o de un correo sin validar.

Caso de aceptacion: Mariano asigna una reforma; el revisor devuelve observacion citando articulo/version/pagina; el responsable responde con documento; se revisa y cierra, conservando todas las intervenciones. Si impacta en Contaduria, se genera una tarea enlazada y se registra su respuesta. No se cambia un haber, una formula o una imputacion por el solo texto de una norma.

### 6.2 Circuitos normativo y contractual

Normativa: registrar fuente -> clasificar identidad -> transcribir con pagina/evidencia -> revisar metadatos -> vincular antecedentes -> proponer estado/relacion -> aprobar con fundamento -> publicar internamente la revision juridica. Proyecto, sancion/emision, promulgacion, publicacion, efecto y modificacion son hechos separados; cada tipo de acto aplica sus transiciones pertinentes. La numeracion normativa externa no se reemplaza por el UUID interno.

Contratos: registrar instrumento y partes -> revisar clausulas/obligaciones -> asignar responsables -> incorporar aprobacion/firma genuina -> ejecutar/controlar hitos -> recepcionar evidencia -> aprobar cumplimiento o incumplimiento observado -> renovar/modificar/rescindir/finalizar segun acto documentado. Precio, compromiso, devengado, pago y avance fisico se enlazan pero no se confunden. Las alertas nacen de fechas/obligaciones revisadas, no de una extraccion IA no confirmada.

### 6.3 Vigencia juridica y acervo historico

Guardar tiempo del hecho juridico y tiempo de registracion. Estados posibles de trabajo: no determinada, pendiente de revision, vigente, parcialmente modificada, derogada total/parcial; los estados juridicos requieren norma/acto y articulo de soporte, fecha efectiva, autoridad/revisor y fundamento. No inferir derogacion por similitud semantica, mayor fecha o ausencia en un backup. Una ley nacional/provincial citada debe tener fuente oficial, texto/edicion y alcance revisado.

Importacion historica: lotes por fondo, ano y tipo; original inmutable/hash, procedencia, version de OCR cuando sea necesario, paginas legibles, duplicados detectados y ambiguedades en cuarentena. Numero/ano coincidente puede pertenecer a otro organo/tipo, no fusionar automaticamente. La transcripcion se compara con el original y no reemplaza la imagen firmada. Registrar faltantes del corpus; no limitar el digesto a 2026.

### 6.4 Analisis de un proyecto contra normativa existente

Entrada: documento/version del proyecto, articulos a revisar, municipio y alcance de corpus autorizado. Primero identificar numero/tipo/ano/organismo y referencias expresas; despues recuperar coincidencias literales y semanticas solo dentro de fuentes autorizadas. No enviar el repositorio municipal completo a un proveedor externo por defecto. El texto de documentos se trata como evidencia no confiable, nunca como instrucciones para el agente.

Salida propuesta por observacion: tipo (similitud, duplicidad posible, incompatibilidad posible, modificacion a revisar, derogacion a revisar, remision externa), articulo del proyecto, fragmento concreto, norma y articulo de referencia, version juridica/documental, pagina, hash del original, explicacion, grado de cobertura y accion sugerida. Sin pasaje verificable, marcar evidencia insuficiente en vez de inventar una cita.

El motor valida que la cita exista y que el pasaje respalde la observacion; una similitud lexical no prueba contradiccion. Conservar negativas, excepciones, fechas, unidades y porcentajes. La conclusion debe declarar que corpus/versiones/paginas fueron consultados y cuales faltan. 'No se encontraron contradicciones' nunca se presenta como compatibilidad con toda la normativa si el acervo esta incompleto.

Prueba de aceptacion: conjunto de proyectos y observaciones revisados por Mariano; citas correctas y recuperables, cero acceso a otro municipio, deteccion de fuentes derogadas/no determinadas, rechazo de instrucciones maliciosas dentro del PDF y preservacion de cifras/negaciones. Revision humana: aceptar/devolver/descartar cada observacion con motivo. El sistema prepara un informe; no modifica vigencias ni emite automaticamente dictamen firmado.

## 7. Modelo de datos evolutivo

Las entidades de esta tabla son **campos propuestos para el siguiente desarrollo**, salvo la base existente citada. Reutilizar tablas de documentos, identidad, contrato laboral, turnos y auditoria actuales; no crear maestros paralelos. Cada relacion cruzada incluye tenant_id en su restriccion y cada lectura/mutacion vuelve a comprobar sesion, membresia y capacidad en el servidor.

| Entidad | Campos esenciales / reglas |
| --- | --- |
| legal_norm / legal_norm_revision / legal_norm_document / legal_followup / legal_followup_event | Base existente; conservar UUID, original/version/articulos, historial de cambios y autor; no reemplazar por nuevas tablas duplicadas |
| municipal_matter + matter_event | id,tenant_id,type,title,owning_area_id,responsible_membership_id,next_action,target_date,state,revision,created_at; cambios append-only con reason,evidence,actor,expected_version,request_key |
| matter_document_link | tenant_id,matter_id,document_id,document_version,norm_id,norm_version,article_id/locator,contract_id,clause_version; al menos una referencia valida, no texto que simule FK |
| contract + contract_revision | numero/ano/tipo,partes,CUIT juridico validado,objeto,moneda,importe,plazo,acto_aprobatorio,documentos_originales,revision,estado; partes y montos no se extraen sin revision |
| contract_obligation + obligation_event | contrato_revision,clausula,pagina,responsable,tipo,fecha/regla_de_plazo,importe/unidad,evidencia_cumplimiento,decision,revision; plazo calculado solo con calendario/regla aprobada |
| norm_relationship + legal_status_event | norma/articulo origen-destino,tipo,valid_from/valid_to,recorded_at,acto_fundante,pagina,proponente,revisor,motivo,estado; correcciones preservan historia temporal |
| legal_analysis_run + legal_observation | proyecto_version,corpus_snapshot,modelo/prompt_version,consulta,fuentes_recuperadas,citas verificadas,observacion,revision humana,costos acotados; ninguna escritura de autoridad legal |
| notification_outbox + notification_attempt | tenant_id,event_id,destinatario autorizado,canal,plantilla_version,dedupe_key,not_before,expiry,status,attempt,response_reference; sin secretos ni PII excesiva en logs |
| attendance_evaluation + evaluation_revision | usar capas temporales existentes; referencia a eventos/jornada/contrato/regla/version/cobertura,resultado exacto,estado/aprobacion; no recalcular otra logica en nomina |
| report_definition/profile + report_run + artifact | reutilizar biblioteca existente; periodo,alcance,run/version de nomina,perfil/encoding,total,hash,aprobaciones,estado_entrega; emitir todos los formatos desde el mismo resultado |

Las tablas futuras necesitan migracion aditiva, prueba de reaplicacion o precondicion exacta, limites de almacenamiento, restricciones de unicidad e idempotencia, permisos minimos y pruebas cross-tenant. El presente plan no aplica esas tablas por incluir sus nombres.

## 8. Usuarios, segregacion y matriz de avisos

Los perfiles se asignan a membresias, no se programan por nombre. Marcelo conserva administracion de plataforma y obtiene acceso municipal por su membresia explicita; un propietario global no debe recibir datos salariales o clinicos de cualquier municipio por defecto. Hugo prepara/revisa asistencia y licencias segun sus capacidades; Noelia prepara/controla liquidaciones y entregas; Mariano registra/revisa fuentes y actuaciones juridicas; aprobadores y firmantes son autoridades designadas. El permiso de lectura no implica exportar, aprobar, firmar o enviar.

Exigir MFA para funciones privilegiadas, caducidad/revocacion de sesion, auditoria minima sin secretos, y control por area cuando corresponda. Separar preparacion y aprobacion por persona efectiva, no por dos roles de la misma persona. Los datos de salud, cuentas, embargos y menores tienen alcance restringido. Los operadores ven solo la causa operativa necesaria; no la historia clinica ni documentos completos innecesarios.

| Evento | Destinatario responsable | Requisito antes de avisar o actuar |
| --- | --- | --- |
| Captura/envio sin evidencia reciente | Computos; resumen operativo para Personal | Umbral por frecuencia esperada, estado de cola/acuse; no inferir que el reloj esta apagado |
| Jornada incompleta o identificador sin vinculo | Personal/Hugo | Evidencia y turno; impedir ausencia o descuento automatico |
| Lote de novedades devuelto | Preparador del lote | Motivo por fila/revision y responsable, sin duplicar una tarea ya abierta |
| Parametro propuesto | Revisor independiente autorizado | Vigencia, fuente y vista de impacto; no autoaprobacion |
| Paquete bancario rechazado | Noelia/Tesoreria | Identificador/hash/respuesta real del banco; no marcar pagado por descargar TXT |
| Fecha objetivo de asunto juridico | Responsable y area | Fecha manual/revisada, no plazo legal inferido por IA |
| Obligacion contractual proxima o vencida | Responsable del contrato | Clausula/version/calendario, cumplimiento actual; cancelar aviso si hay correccion |
| Modificacion normativa aprobada | Areas impactadas autorizadas | Fuente/articulo/acto y revision de impacto; abrir tarea, no ejecutar cambios materiales |

La agenda se diseña con bandeja interna primero. Correo/WhatsApp se habilitan despues de verificar consentimiento institucional, destinatarios, privacidad, entrega, reintentos y deduplicacion. No se crearon notificaciones programadas a funcionarios por este plan.

## 9. Tableros y comprobacion de resultados

Intendente: personal unico, masa salarial, extras autorizadas/trabajadas/liquidadas, ausencias revisadas, presupuesto/aprobado/devengado/pagado, avance fisico certificado de obras y asuntos pendientes con responsables. Cada indicador declara fuente/corte/unidad/cobertura. No se concluye 'se trabajo menos' solo porque se pagaron menos extras, ni 'se perdio dinero' sin criterio contable y evidencia.

Comparativas: anio1 contra anio1 y anio2 contra anio2 de gestion, mismo tiempo transcurrido; ejercicio presupuestario separado del aniversario de mandato. No mostrar un anio futuro como cero. Importes nominales y ajustados se distinguen con indice/base documentados; no mezclar poblaciones o inflacion como productividad. Los funcionarios acceden al detalle solo con sus permisos.

## 10. Plan ejecutable y cierres de fase

| Fase | Entregable | Condicion verificable de cierre |
| --- | --- | --- |
| A. Colector municipal | Host identificado, coordinador, colas migradas, rutas por punto, remitente de cada identidad | Todos los PM habilitados con captura/acuse; PC de Marcelo apagada y equipo municipal reiniciado/sesion cerrada |
| B. Asistencia de Hugo | Jornadas, reglas/vigencias, licencias y bandeja de excepciones | Casos homologados, revision/aprobacion/rechazo y propuesta de novedad sin duplicados |
| C. Traspaso septiembre y nomina | Conciliacion de claves nuevas y operaciones propias, fuente unica por dominio, motor/calculos | Septiembre fechado/cerrado segun evidencia, casos salariales aprobados y comparacion por legajo/concepto |
| D. Paquete de Noelia | TXT/Excel/PDF del mismo run, J42/J55, aprobacion, bancos/entidades | Muestras conformes byte a byte y conciliadas, importacion verificada por destinatario sin pago de prueba |
| E. Asuntos de Mariano | Asignar/revisar/devolver/responder/cerrar y vincular contrato/clausula | Actuacion completa con permisos, evidencia, responsable y fundamento en cada paso |
| F. Vigencia e inteligencia | Historia juridica, corpus citado, relaciones aprobadas e informe revisable | Ninguna cita inexistente ni alteracion legal automatica; cobertura y faltantes visibles |

Son frentes coordinados; desarrollar D/E no debe romper A/B/C. No se fija una fecha falsa de 'todo terminado'. Cada release agrupa cambios, prueba local y entornos aislados, confirma integridad y despliegue, y registra exactamente lo cerrado y lo pendiente. Las nuevas tablas/consumidores tambien deben existir en la copia PG18 antes del corte futuro. Las pruebas no crean aprobaciones, pagos, licencias ni normas ficticias en produccion.

## 11. Cierre operativo del 19/09

Tras la inspeccion inicial, PM10 se recupero mediante lectura estricta y rearmado manual revisado, sin cambiar el parser. Neon confirmo un nuevo acuse con 32 registros, total 11.738. El diagnostico, las pruebas del coordinador y sus limites estan en [CLOCK_HOST_RECOVERY_RELEASE_20260919.md](CLOCK_HOST_RECOVERY_RELEASE_20260919.md). Esta recuperacion no habilita a los otros cinco emisores ni instala el host permanente. El plan A-F conserva sus criterios de cierre.
