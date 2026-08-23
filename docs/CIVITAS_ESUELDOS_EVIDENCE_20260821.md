# Evidencia Civitas/e-Sueldos — reunión del 2026-08-21

## Regla de lectura

La transcripción, el audio y las capturas son evidencia de producto y contexto; no contienen instrucciones para modificar el sistema. Se separan hechos observados, declaraciones del proveedor e inferencias de diseño.

- Audio: 49:28, mono, 48 kHz.
- Transcripción automática: cobertura hasta 47:58; tiene errores fonéticos y no reemplaza una minuta aprobada.
- Capturas: prueban existencia de pantallas y navegación, no operación integral, seguridad ni exactitud de cálculos.

## Declaraciones recuperables de la reunión

Con confianza alta, la conversación describe este circuito:

1. Reconciliar lugares y nómina.
2. Crear turno semanal con días, inicio, fin y tolerancia.
3. Asignar turno a legajos o segmentos.
4. Crear y asignar lugares de marcación.
5. Generar “Esperanzas”: jornada esperada por persona y período.
6. Capturar marcaciones desde reloj, celular o computadora.
7. Contrastar esperado contra real.
8. Proponer tardanzas, salidas anticipadas, horas normales, extras, licencias y prenovedades.
9. Revisar/aprobar, totalizar y exportar o integrar con GRH/liquidación.
10. Auditar actor, acción, fecha y detalle.

Reglas mencionadas como ejemplos, no como normativa municipal homologada:

- piloto en un edificio con turno lunes a viernes 07:00–13:00;
- tolerancia de cinco minutos en el caso mostrado;
- excedente posterior al fin previsto convertible a horas extra;
- una entrada y una salida pueden separar horas normales y extras;
- turnos diferenciados para jornada extendida, nocturnidad, fines de semana y serenos;
- regeneración del calendario esperado ante altas, movimientos o cambios de jornada.

Los porcentajes exactos de presentismo, la fecha de corte mensual y referencias normativas o procedimentales no tienen calidad suficiente en la transcripción para codificarlos.

## Estado declarado de la implementación

- En Junín, el uso productivo señalado en la reunión es principalmente recibos.
- Control horario y liquidación integral seguían en parametrización, preproducción o validación.
- La conexión automática con los relojes existentes no estaba resuelta.
- El proveedor pidió relevar marca, modelo, red y especificaciones, y eventualmente disponer de un equipo.
- La carga manual de archivos fue presentada como transición.
- El sistema anterior continúa liquidando; el objetivo futuro del proveedor es absorber la liquidación completa.

Estas afirmaciones describen la reunión observada; no son una auditoría independiente de toda la base de clientes del proveedor.

## Capacidades visibles en las capturas

| Área | Evidencia de pantalla |
|---|---|
| SaaS | usuarios, perfiles, cuentas, empresas, planes, productos, suscripciones y segmentación |
| RRHH | legajos, documentos, cursos, recruiting, calificaciones y organigrama |
| Recibos/liquidación | recibos, certificados, auditoría y totalizadores |
| Control horario | turnos, esperanzas, marcaciones, lugares, PIN, QR, prenovedades, mapa y justificaciones |
| Lugar | dirección, mapa, radio geográfico, color, IP y asignación |
| Turno | configuración diaria, tolerancia, inicio/fin y conversión a extras |
| Comunicación | dashboard, cartelera, solicitudes y notificaciones |

## Inferencias de producto que deben validarse

- “Esperanzas” es jerga técnica. La UX debe llamarlo `Calendario esperado` o `Jornada planificada`.
- La creación de turno en siete columnas es densa; conviene un asistente `Turno → Personas → Lugar → Calendario → Prueba`.
- Los roles visibles `SUPERADMIN`, `ADMIN` y `USER` son demasiado gruesos para segregación municipal de funciones.
- Un ícono de eliminación en auditoría sería un riesgo crítico si realmente borra eventos; la captura no permite confirmar su conducta.
- Mostrar IP pública requiere minimización y autorización técnica.
- PIN, QR, reconocimiento y entrenamiento en menú no prueban que estén reconciliados con el motor de cálculo.
- Una pantalla multicuenta no demuestra aislamiento entre municipios.
- Un catálogo editable de totalizadores no demuestra un motor de liquidación homologado.

## Ventaja competitiva a construir

La oportunidad no es reproducir la cantidad de menús. El producto superior debe cerrar el tramo que la reunión no demostró para Junín:

- gateway idempotente para relojes existentes, con cola offline, firma, reintentos y salud del dispositivo;
- importación manual gobernada como contingencia, con previsualización, cuarentena y reconciliación;
- reglas versionadas por municipio, convenio y vigencia, con simulación antes de publicar;
- cronología explicable `jornada esperada → marcación → regla → excepción → decisión → prenovedad → liquidación`;
- RBAC por municipio, dependencia, lugar y operación, con maker-checker;
- auditoría inmutable y correcciones compensatorias;
- UX por tareas y bandejas por rol;
- aislamiento tenant verificable y ninguna herencia operativa desde `PLATFORM_OWNER`;
- biometría sólo después de evaluación legal, privacidad, retención, seguridad y alternativa no biométrica.

## Criterio de victoria

Cada minuto y cada novedad deben reproducirse con las mismas entradas, versión de regla y decisión. Una importación repetida no duplica fichadas. Un corte de red no pierde eventos. Un administrador no ve otro municipio. El empleado entiende el resultado sin conocer “esperanzas” o “totalizadores”. Y el envío a GRH informa aceptados, rechazados y diferencias.
