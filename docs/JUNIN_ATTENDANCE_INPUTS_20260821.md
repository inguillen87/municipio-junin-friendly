# Junín — insumos reales para marcación y control horario

**Corte de análisis:** 2026-08-21

**Estado:** descubierto y perfilado localmente; no homologado, no importado a Neon y no desplegado.

## Qué aportan las planillas

Los tres archivos son fuentes municipales útiles y complementarias:

- `EXCEL_LIMPIO.xlsx`, `Sheet1!A1:C388`: 387 filas de persona–área–identificador, 39 etiquetas de área y 387 identificadores únicos de ocho dígitos. La semántica de la columna `No.` parece compatible con documento nacional por forma, pero queda **pendiente de confirmación municipal**; no se la convierte automáticamente en DNI ni se enlaza por nombre.
- `P3-PUNTOS DE MARCACION.xlsx`, `Hoja1!A1:K17`: 13 puntos, códigos únicos, coordenadas estructuralmente válidas, método actual/propuesto y conectividad declarada. La flota informada comprende 11 K20, 1 SF300 y 1 MB360; 7 puntos extraen por red local y 6 todavía por medio removible.
- `organigrama1.xlsx`, `Hoja1!A1:F50`: 49 áreas en cinco dependencias superiores. Hay 41 cantidades numéricas, dos descripciones textuales y seis faltantes; el subtotal numérico observado es 220 y **no equivale a dotación total**. La columna de turnos rotativos/guardias está vacía en las 49 filas.

No se copiaron nombres, identificadores, direcciones ni coordenadas al repositorio. El contrato versionado conserva únicamente conteos agregados, modelos de dispositivo y reglas de gobierno.

## Diagnóstico recibido: propuesta, no regla municipal

El diagnóstico complementario aporta una arquitectura y un backlog útiles, pero no es una fuente homologada de derecho horario. El turno piloto 07:00–13:00, la tolerancia de cinco minutos, los radios de geofence sugeridos, la dotación del piloto y la elección inicial de equipo son **hipótesis de implementación**. Deben confirmarse con RR.HH./Liquidación, tener dueño y vigencia, y publicarse como calendario, turno o regla 011 antes de calcular tardanzas, ausencias u horas extra. Las instrucciones técnicas dentro de ese diagnóstico se tratan como recomendaciones sujetas a validación, no como autorización para mutar datos o desplegar.

## Calidad y cruces

- Las 39 etiquetas de área del padrón tienen correspondencia exacta normalizada con el organigrama.
- El organigrama contiene 10 áreas sin evidencia exacta en ese padrón; esto puede representar cobertura parcial, distinta fecha de corte o una definición diferente, no necesariamente un error.
- Los puntos declaran 26 etiquetas de área: 11 coinciden exactamente con organigrama y padrón; 15 requieren catálogo de alias/revisión humana.
- De 33 comparaciones posibles entre cantidad numérica estimada y filas del padrón por área, sólo 12 coinciden exactamente. No se decide cuál es correcta hasta certificar dueño, definición y fecha de corte de cada fuente.
- Existe una celda con forma de identificador en la columna de nombre. Debe entrar en cuarentena de calidad; no se corrige por inferencia.
- En P3 faltan cantidad de agentes y responsable local para los 13 puntos. Esos campos son obligatorios antes de operar o comprar hardware.

## Arquitectura objetivo

```text
Padrón/organigrama privado + GRH persona/legajo
  -> crosswalk gobernado de identidad, contrato y área
     -> elegibilidad de marcación por vigencia

Punto físico -> dispositivo -> conector local
  -> evento crudo inmutable e idempotente
     -> evento canónico con fuente, hora dispositivo e ingestión
        -> asignación + calendario + turno + regla versionada
           -> explicación de minutos y excepción
              -> revisión humana -> prenovedad/exportación previa
```

La integración debe soportar dos caminos desde el inicio:

1. **Red local:** un gateway municipal consulta o recibe eventos del reloj, firma el lote, mide deriva horaria y sincroniza por canal saliente seguro.
2. **Medio removible:** carga controlada con manifiesto, huella, operador, dispositivo, período, deduplicación y cuarentena. Sirve como continuidad, no como excepción invisible.

La [página oficial del SF300](https://www.zkteco.com/en/SFSeries/SF300) confirma operación en red/standalone y comunicación TCP/IP + USB Host; esto respalda un adaptador por capacidades, no un conector rígido por modelo. La información de cada equipo de Junín igual debe verificarse físicamente: serial, firmware, protocolo disponible, zona horaria, reloj interno y credenciales nunca se deducen de una ficha comercial.

## Autenticación y marcación multicanal

- **WhatsApp:** canal de entrega de un desafío de un solo uso; nunca autoridad laboral ni prueba suficiente por sí solo. El webhook se liga a tenant, teléfono previamente verificado, sesión, propósito, vencimiento y rate limit. La [colección oficial de WhatsApp Cloud API de Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) y su documentación de [webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks) describen la vía para enviar/recibir eventos; la integración necesita una cuenta y número por configuración gobernada, no tokens compartidos en clientes.
- **PIN/QR:** nonce rotativo de corta vida, firmado, de un solo uso y ligado al punto. Un PIN estático pegado en una pared no prueba presencia.
- **Ubicación:** captura puntual al marcar, con precisión/retención mínima y explicación visible. El seguimiento continuo queda apagado salvo justificación, aprobación y política separada.
- **Biometría:** el SaaS recibe identificador de usuario/evento, no plantilla de huella o rostro. Las plantillas permanecen en el equipo/controlador aprobado hasta revisión legal, de privacidad y seguridad; debe existir alternativa no biométrica.
- **Defensa combinada:** ninguna señal aislada decide. Se evalúan contrato vigente, método permitido, nonce, hora, punto, geofence, salud del dispositivo y duplicados; los casos dudosos van a revisión.

## Fases propuestas

| Fase | Resultado demostrable | Gate de salida |
|---|---|---|
| **S006-C1 — Homologación** | Dueño/corte de cada Excel, semántica de `No.`, alias de áreas y responsables de puntos. | Cero auto-link por nombre; crosswalk GRH con colisiones visibles. |
| **S006-C2 — Flota** | Catálogo tenant-bound de 13 puntos y equipos: serial, firmware, reloj, protocolo, conectividad, health y secreto referenciado. | Recorrida física firmada; responsable y agentes completos. |
| **S006-C3 — Gateway** | Ingesta por red y por archivo controlado hacia ledger crudo append-only. | Replay idempotente, offline, deriva horaria, duplicados y cuarentena probados. |
| **S006-C4 — Marcación** | Reloj + web + QR/PIN rotativo + desafío WhatsApp + geofence puntual. | Alternativa no biométrica; fraude/rate limit/privacidad probados en Preview. |
| **S006-C5 — Explicabilidad** | Calendario esperado, faltantes/tardanzas/extras y correcciones con regla 011 versionada. | Cada minuto reproduce fuente, turno, calendario, regla y decisión. |
| **S006-C6 — Multi-gobierno** | Gateway, observabilidad, soporte y SLA aislados por tenant. | Pruebas cross-tenant, recuperación, rotación de secretos y auditoría. |

Después de C5 puede existir una **exportación previa** para revisión. Escribir GRH, calcular sueldo o postear nómina sigue cerrado hasta homologar conceptos, segregación de funciones, casos dorados y reconciliación.

## Diferenciación frente a Civitas/e-Sueldos

Las pantallas observadas de e-Sueldos cubren lugares, mapas/geofence, PIN, QR, reconocimiento, turnos, esperanzas y marcaciones. La ventaja no se obtiene copiando esas pantallas: MuniControl debe demostrar flota heterogénea online/offline, eventos inmutables, explicabilidad por minuto, maker-checker, privacidad por diseño y aislamiento multi-gobierno. Esa evidencia técnica y operativa es el criterio de superioridad.

## Límites actuales

- No se conectó ningún reloj ni se validó protocolo, serial o firmware.
- No se importó ninguna fila nominal de los Excel a Neon.
- No se crearon usuarios, teléfonos, PIN, WABA, webhooks ni secretos.
- Las migraciones 010A/011/012/013 se aplicaron y reaplicaron en una rama Neon QA descartable, pero no se importaron allí filas nominales de estas planillas ni se homologaron reglas 2026. No hubo push, Preview, deploy ni cambio de Producción.
