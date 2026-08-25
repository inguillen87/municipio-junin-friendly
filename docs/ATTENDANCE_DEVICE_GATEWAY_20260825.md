# Gateway de relojes y marcaciones · Junín

Estado: implementación previa a conexión física. Este documento separa lo ya respaldado por fuentes municipales de lo que exige relevamiento o prueba sobre cada aparato.

## Resultado que se construye

```text
reloj o archivo de exportación
  -> gateway local / importador controlado
  -> driver normalizador versionado
  -> lote idempotente
  -> evento crudo inmutable
  -> vínculo de identificador de reloj con contrato laboral
  -> marcación canónica explicable
  -> incidencia o revisión humana
  -> cálculo futuro con turno, calendario y regla aprobados
```

El sistema no guardará imágenes ni plantillas de huellas. La verificación biométrica ocurre en el reloj o controlador local y el SaaS recibe únicamente el identificador técnico, la fecha, el resultado y el tipo de credencial.

## Evidencia disponible

- Inventario municipal de 13 puntos `PM-01` a `PM-13`.
- Equipos reportados: 11 ZKTeco K20, 1 SF300 y 1 MB360.
- Extracción actual: siete puntos por red local y seis mediante pendrive.
- Coordenadas y direcciones informadas para los 13 puntos.
- Padrón auxiliar con 387 personas y un identificador textual único de ocho dígitos; su semántica aún no fue homologada.
- Organigrama con 49 áreas; la columna de turnos rotativos o guardias está vacía.
- Respaldo GRH con tablas históricas de turnos, horarios, tolerancias, asignaciones, esperanzas, fichadas y locales. Sirve para descubrir estructura y casos de prueba, no para afirmar conectividad actual.

El inventario normalizado vive en `data/junin-attendance-inventory.v1.json` y conserva el SHA-256 del Excel fuente.

### Referencias públicas del fabricante

Estas referencias ayudan a preparar la visita técnica, pero no prueban que el firmware municipal tenga habilitado el mismo protocolo:

- la ficha regional del K20 informa comunicación TCP/IP y exportación manual por USB;
- la ficha global del SF300 informa TCP/IP y USB Host, en modalidad autónoma o conectada;
- la ficha regional del MB360 informa TCP/IP, USB Host y autenticación por rostro, huella, tarjeta o contraseña;
- ZKBio Time.Net documenta comunicación con terminales autónomas por Ethernet, Wi-Fi o USB y gestión de transacciones, usuarios e informes.

Fuentes: [K20](https://zktecolatinoamerica.com/producto/k20/), [SF300](https://www.zkteco.com/en/SFSeries/SF300), [MB360](https://zktecolatinoamerica.com/producto/mb360/) y [ZKBio Time.Net](https://zkteco.com/en/zktime_net/zkbio_time_net).

La revisión de integración oficial deja tres decisiones adicionales:

- K20 es candidato a importación USB: su manual describe exportaciones de asistencia, pero no publica un contrato TCP suficiente para escribir un driver confiable.
- SF300 confirma TCP/IP y USB Host; la compatibilidad anunciada con software ZKTeco no equivale a una especificación pública del protocolo del terminal.
- MB360 es candidato prioritario a ADMS únicamente si la unidad municipal acredita firmware compatible, menú ADMS y HTTPS. La lista oficial de BioTime Cloud condiciona esa integración a la variante y versión instaladas.

Fuentes complementarias: [manual K20](https://zktecolatinoamerica.com/download/k20-manual-de-usuario/), [ficha SF300](https://s3.zktecoip.com/files/20240123/SF300%20Datasheet%20202401.pdf), [manual MB360](https://zktecolatinoamerica.com/download/mb360-manual-de-usuario/), [compatibilidad BioTime Cloud](https://zktecolatinoamerica.com/download/lista-de-compatibilidad-biotime-cloud-2-0/), [centro oficial de SDK](https://www.zkteco.com/en/SDK) y [API ZKBio Time](https://www.zkteco.com/en/ZKBioTime/ZKBioTime).

Por eso no se implementa a ciegas `/iclock/cdata`, puerto 4370 ni un SDK de terceros. El primer driver físico se cerrará contra un archivo USB real; el segundo será ADMS/servidor sólo después de homologar el MB360 municipal.

## Límites honestos antes de conectar

No están acreditados todavía, por reloj:

- número de serie, MAC, IP, puerto y firmware;
- protocolo o SDK efectivamente habilitado;
- reloj interno, zona horaria y desvío;
- cantidad de usuarios y eventos almacenados;
- formato real de exportación por pendrive;
- credencial administrativa por canal secreto;
- responsable local y responsable de RR.HH.;
- identificador de usuario usado en el equipo;
- radio de geocerca autorizado.

Por ese motivo los equipos se registran como `draft`, presentado en la interfaz como
“Pendiente de homologación”; nunca como conectados.

## Dos modalidades de conexión preparadas

### Gateway de red

Un servicio local dentro de la red municipal consulta o recibe eventos del reloj y los envía por HTTPS al backend. El token del conector se muestra una sola vez; el backend conserva sólo su SHA-256. El lote se puede reintentar sin duplicar fichadas.

La configuración parte de `config/attendance-gateway.example.json`. La copia operativa debe llamarse `config/attendance-gateway.local.json`, está excluida de Git y nunca contiene el token: la credencial se entrega al proceso mediante `ATTENDANCE_CONNECTOR_TOKEN`. El agente trabaja en modo `dry-run` salvo que el operador agregue `ATTENDANCE_GATEWAY_CONFIRM_SEND=true`.

### Comandos operativos seguros

Todos estos comandos son para una rama descartable y una base QA acreditada. Ninguno habilita un reloj por sí solo.

```powershell
# Verifica el XLSX original por nombre, firma y SHA-256; no escribe en PostgreSQL.
npm.cmd run attendance:inventory:preflight -- --source-artifact="<ruta>\P3-PUNTOS DE MARCACION.xlsx"

# Aplica y revalida el esquema 022 sólo cuando .env.local acredita una rama QA aislada.
# El aplicador rechaza explícitamente cualquier target productivo.
npm.cmd run db:attendance:schema

# Importa los 13 puntos y 13 equipos lógicos. Exige sesión MFA QA reciente y no crea conectores.
npm.cmd run db:attendance:import-junin -- --tenant-slug=junin-mendoza --source-artifact="<ruta>\P3-PUNTOS DE MARCACION.xlsx" --execute

# Inspecciona un archivo sin red ni escritura remota.
npm.cmd run attendance:gateway -- --config config/attendance-gateway.local.json --input "<ruta>\archivo-exportado"
```

El envío real requiere, además, que el conector ya haya sido provisionado en el backend y que el proceso reciba `ATTENDANCE_CONNECTOR_TOKEN` y `ATTENDANCE_GATEWAY_CONFIRM_SEND=true`. No se debe copiar el token al JSON, al historial de PowerShell ni a un ticket.

El adaptador específico para ZKTeco se seleccionará sólo después de verificar serie, firmware y protocolo de cada modelo. Hasta entonces el registro de drivers cierra ante identificadores desconocidos. El driver `simulator` no forma parte del registro operativo: existe únicamente mediante el opt-in explícito `includeSimulatorForTests` en pruebas locales y no se puede persistir como transporte ni como driver de equipo o conector.

### Importación por archivo

Para los seis puntos reportados con extracción por pendrive se preparó una bandeja
controlada. Quedará operativa cuando un archivo real por modelo homologue el driver:

1. el operador selecciona punto y equipo;
2. el importador calcula SHA-256 del archivo;
3. el driver CSV se configura con columnas explícitas;
4. se previsualizan filas aceptadas, duplicadas y rechazadas;
5. la confirmación crea un lote trazable e inmutable.

Nunca se infieren columnas por posición ni se asume que el número de ocho dígitos sea DNI, legajo o usuario del reloj.

El decoder `csv-generic` ya admite un mapeo explícito en la librería, pero el agente operativo v1 no acepta que cada lote cambie ese mapeo: permitirlo volvería mutable la interpretación histórica. Cuando llegue el primer export real, su encabezado y codificación deben congelarse como configuración versionada del conector o como un driver específico del modelo antes de habilitar el envío.

## Contratos y controles

- Hora civil, zona IANA, offset y UTC deben describir el mismo instante.
- La identidad de evento combina tenant, fuente, dispositivo e ID de origen; si el aparato no entrega ID, se deriva uno determinista del contenido normalizado.
- Un replay idéntico se colapsa. La misma identidad con contenido diferente bloquea el lote.
- Los eventos crudos son append-only; una corrección crea otro evento de revisión.
- El resultado informado por el reloj (`accepted`, `rejected` o `unknown`) forma parte del hash y del hecho crudo. Sólo `accepted` con identidad única queda registrado automáticamente; `unknown` exige revisión humana y `rejected` nunca puede aprobarse como fichada.
- Identificadores de empleado se convierten con HMAC antes de persistirse.
- Ninguna respuesta pública contiene token, hash de token, plantilla biométrica ni identificador crudo del reloj.
- El rol de runtime ejecuta fachadas `SECURITY DEFINER` allowlisted y no posee CRUD directo sobre tablas.
- PostgreSQL rechaza `simulator` tanto en equipos como en conectores; la ingesta también lo bloquea antes de persistir un lote.
- La ingesta no calcula horas, saldo, presentismo, licencias ni nómina.

## Reconciliación de persona y lugar

El padrón permite preparar referencias externas, pero no asignar personas automáticamente. Hay departamentos que aparecen en más de una sede: Servicios Públicos aparece en siete puntos y Obras Públicas en dos. La relación correcta debe guardar:

- contrato laboral canónico;
- identificador usado por el reloj, convertido con HMAC;
- punto o conjunto de puntos autorizados;
- vigencia;
- fuente y estado de verificación;
- persona que propone y persona que revisa.

Los eventos sin vínculo válido quedan `unmatched`; siguen visibles para revisión y nunca desaparecen.

## Geolocalización, WhatsApp y biometría móvil

- Reloj fijo: el evento hereda el punto físico verificado del dispositivo. No se simula GPS.
- Marcación móvil futura: captura puntual de ubicación con consentimiento, precisión, timestamp y evaluación contra geocerca. El seguimiento continuo queda deshabilitado por defecto.
- WhatsApp futuro: puede entregar un desafío de un solo uso o avisar una incidencia. No prueba por sí solo presencia física.
- Biometría móvil futura: autenticación local del sistema operativo y credencial firmada; no se transporta la huella.

## Visita técnica por aparato

1. Fotografiar etiqueta de modelo y serie sin publicar credenciales.
2. Registrar firmware, fecha/hora, zona y desvío contra una fuente confiable.
3. Verificar IP/MAC/puerto, DHCP o reserva y conectividad saliente del gateway.
4. Identificar protocolo disponible: SDK, push/ADMS, pull o exportación.
5. Contar usuarios y eventos sin exportar plantillas biométricas.
6. Generar un lote pequeño de prueba con entrada y salida de una identidad autorizada.
7. Guardar un archivo de muestra por modelo y documentar columnas/codificación.
8. Confirmar responsable local, responsable de RR.HH. y ventana de sincronización.
9. Aprobar punto, radio y sedes permitidas.
10. Ejecutar replay, evento fuera de orden, reloj adelantado y corte de red.

## Fases siguientes

1. **Inventario verificable:** 13 puntos, equipos, estado, faltantes y mapa.
2. **Gateway técnico:** CSV genérico, exportación fija, salud e ingesta idempotente. El simulador queda limitado a pruebas automáticas y no puede persistir hechos municipales.
3. **Piloto físico:** un edificio, un modelo, grupo reducido, sin impacto en nómina.
4. **Identidad:** crosswalk reloj-contrato con doble control.
5. **Reglas:** turno, calendario, tolerancia y excepciones versionados.
6. **Explicabilidad:** entrada/salida, anomalías y decisión humana auditada.
7. **Preliquidación:** exportación reversible; integración salarial sólo tras homologación.
8. **Escala multi-tenant:** credenciales por conector, rotación, observabilidad y SLA por municipio.
