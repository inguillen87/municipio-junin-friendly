# Estado integral de los pedidos de Noelia, Hugo y Mariano

## Actualización acotada del 23/09/2026 · operación nativa de Personal

Esta actualización sobre la base `e2b4a18` sustituye las menciones siguientes a 101/102 como incrementos todavía por publicar. Conserva los cortes históricos y no declara terminados todos los módulos de Noelia, Hugo o Mariano.

| Incremento | Estado comprobado | Límite y pendiente |
|---|---|---|
| [101. Mensuales nativas](NOELIA_NATIVE_MONTHLY_101.md) | Publicado en `405841b`; CI de rama `35808157951` y master `35808473647`, migración en PG17/PG18 con durabilidad y preservación verificadas, Vercel READY y 44 recursos publicados cotejados. | Alta propia → novedad mensual individual por UUID → revisión independiente → exportación de control. Continúa `export_only`; no calcula ni paga haberes. |
| [102. Familia y escolaridad nativas](NOELIA_NATIVE_FAMILY_102.md) | Cierre técnico publicado en `0b8d1a8`; CI `35811024903`, migración en PG17/PG18 y verificación independiente, Vercel READY y ocho recursos cotejados. | Alta propia → hijo/a declarado → certificado en papel/PDF → historial y Excel. No incluye todos los tipos de carga familiar, fotografía, IA ni autoservicio. |
| [103. Catálogo propio de encuadres](NOELIA_NATIVE_EMPLOYMENT_CATALOG_103.md) | Implementado en la rama del incremento: propuesta completa de cuatro clases, revisión independiente y aprobación que publica para altas futuras. | CI, instalación y publicación se registrarán en los recibos de este release. No se acredita todavía una publicación municipal aprobada ni se modifica el encuadre de legajos existentes. |

La evidencia previa está conservada en los recibos privados `release-closure-405841b.private.json` y `sprint-102-close-0b8d1a8.private.json`, cotejados en esta actualización. Las verificaciones de interfaz usaron APIs interceptadas y los controles públicos incluyeron acceso anónimo: **no acreditan una sesión municipal operando legajos reales ni aceptación humana**. Los dos commits publicados forman parte de la base `e2b4a18`; no se realizó una nueva consulta a las bases para esta actualización documental.

Brechas actuales verificadas: `api/internal-native-employees.js` expone creación, consulta inicial y recuperación del intento; faltan rectificación, baja y reingreso nativos con historia y revisión. El circuito de licencias de `lib/internal-leave-workflow.js` y sus fachadas de acciones conserva el ámbito de contratos/fuente GRH y requiere ampliación nativa. El catálogo administrativo 103 **no completa Parámetros (módulo 6)**: siguen pendientes el maestro salarial completo, escalas y fórmulas aprobadas. El motor propio de liquidación, su conciliación, cierre, integración contable y homologaciones tampoco quedan resueltos por 093/101/102/103.

## Actualización comprobada del 22/09/2026

Esta sección actualiza el corte histórico que sigue. Sobre `f192733b9b86507530a5d8e8d05fe64a5ecd4e0b`, septiembre está publicado en ambas bases con corte de fuente del **10/09/2026 a las 15:17:30, sin zona horaria declarada**. Agosto continúa como último mes cerrado; septiembre no se presenta como liquidación cerrada ni como datos del 22/09.

Las altas propias y novedades fijas 093/095 ya integran el producto. El Centro Unificado de Alertas incluye asuntos mediante 100, instalado en ambas bases y publicado con Vercel success. Continúan pendientes el acervo jurídico real, las entregas de avisos y la aceptación integral de los usuarios.

La auditoría de acuses locales de los cinco relojes a las 08:47 UTC encontró 77.258 registros recibidos y dos colas todavía en curso, sin errores activos en ese corte. Esta cifra corresponde a acuses guardados; no es una nueva consulta a Neon ni prueba de cobertura o funcionamiento sin la PC personal. El servidor municipal, su cuenta de servicio y la prueba con la PC apagada siguen pendientes.

El siguiente incremento en validación es [Novedades mensuales nativas 101](NOELIA_NATIVE_MONTHLY_101.md). Cierra el enlace entre alta propia y novedad mensual individual. Los gates de instalación y publicación se certifican separadamente; no se declaran completos aquí. El motor salarial propio, integración contable y homologaciones de salidas siguen pendientes.

## Corte histórico del 21/09/2026

Corte de auditoría: 21/09/2026, actualización sobre `a3767bbb6e2ce82a01fe75212375c7fabdc22709`. Ninguno de los tres circuitos integrales puede declararse terminado. Los incrementos publicados y sus pruebas no equivalen a aceptación municipal, aceptación bancaria, cálculo salarial ni operación autónoma de relojes.

## Noelia

| Pedido | Avance comprobable | Pendiente del alcance original |
|---|---|---|
| 1–2. Datos y reportes | Biblioteca por tarea, consulta histórica, comparación, Excel/PDF, planilla bancaria y paquete de control ZIP. | Generación y homologación de TXT bancarios, OSEP/Mutual y F.931; ART con días comprobados; circuito escolar completo. |
| 3. Importación | Cargas individuales/masivas, perfiles, validación de filas, lotes y reintentos. | Homologación de todos los perfiles y conceptos pedidos contra fuentes aprobadas. |
| 4. Integración contable | Fuentes y requisitos identificados. | INSUTACO/INSULEGA e imputación contable conciliada y operativa. |
| 5. Novedades | Planilla, carga individual/masiva/archivos, revisión y exportación; importe ausente permanece distinto de cero. El incremento 092 agrega registro fijo con vigencia, revisión independiente, historia y exportación de control. | Corrección/anulación masiva auditada e integración de las fijas con el futuro motor. La aprobación mensual es `export_only`; la fija es `control_export_only`. |
| 6. Parámetros | Propuesta, revisión y catálogo efectivo limitado a auxiliares 88/90 con activación separada. | Maestro completo, escalas y fórmulas vigentes; actualización conjunta 606/607/612/550. |
| 7. Liquidación | Históricos, conciliación y autorización de reprocesamiento externo. | Motor salarial propio, confirmación/cierre reproducibles, contabilización y aceptación operativa. |
| DOC-01. Firma y emisión | Especificación e identificación del circuito por usuario incorporadas al plan. | Firma institucional, emisión trazable, permisos y entrega de documentos; el PDF de control actual no acredita firma ni emisión oficial. |

El paquete bancario es control interno: no ordena transferencias ni prueba pago. El catálogo 066 mejora el documento original de autonomía, pero no es un motor completo. El respaldo candidato de septiembre no se activa por terminar una interfaz. No se inventan fórmulas, días trabajados, factores, cuentas ni fechas ausentes.

La fase ESC-IA-01 de este incremento completa el registro administrativo manual de escolaridad: papel declarado sin adjunto o PDF, institución/nivel/curso/ciclo, fechas diferenciadas, motivo e historial. Su instalación y publicación requieren los gates del documento de entrega. Quedan fuera fotografía, extracción IA, autoservicio y aprobación salarial; siguen en ESC-IA-02 a ESC-IA-05.

El siguiente incremento es [Novedades fijas 092](NOELIA_NOVEDADES_FIJAS_092.md): registro y revisión administrativa del apartado 5.4. La instalación y la publicación se verifican en su release. No reemplaza la corrección masiva 5.5 ni el cálculo periódico de nómina.

Fuentes: `MATRIZ_ACEPTACION_NOELIA.md`, `PROYECTO_INTEGRAL_JUNIN_20260919.md`, `NOELIA_BANK_CONTROL_PACKAGE_20260919.md`, `CATALOGO_AUXILIARES_VIGENTES_066.md`, `DIRECTIVAS_CERTIFICADOS_IA_Y_CONEXION_RELOJES_20260915.md`, `FEATURE_FIRMA_EMISION_DOCUMENTAL_20260910.md`; contratos efectivos de `internal-payroll-novelty`, `internal-payroll-reprocessing` e `internal-payroll-monthly-close`.

## Hugo

| Circuito | Avance comprobable | Pendiente |
|---|---|---|
| Captura | PM10 tiene evidencia operativa documentada; hay lectores, colas locales y receptor multirreloj. | Remitente para los otros cinco equipos, inscripción y primer acuse comprobado por equipo. |
| Continuidad | Coordinador e instalador preparados. | Host municipal autorizado, cuenta de servicio, reinicio y funcionamiento con la PC personal apagada. La auditoría no volvió a autenticar el servidor. |
| Jornadas | Reconstrucción de intervalos, nocturnos, causas de revisión, filtros y exportación. | Resolución persistente de incidencias y aprobación mensual operativa. La migración 024 sola no aporta API/interfaz. |
| Novedades | Preparte PM10 para 44/95 hacia la planilla. | Cobertura certificada, reglas/topes/calendario aprobados, otros puntos y consumo salarial sin duplicados. |
| Licencias | Consulta y solicitudes con revisión independiente. | Saldos/reservas/consumo conciliados e impacto salarial integrado. |

Una recepción no certifica cobertura. Una marca faltante no demuestra ausencia. La secuencia reconstruida no determina horas pagables. El siguiente incremento de software independiente del host es el remitente multirreloj; la activación real exige autorización y evidencia del equipo.

Fuentes: `CLOCK_HOST_RECOVERY_RELEASE_20260919.md`, `ATTENDANCE_CAUSE_REVIEW_20260919.md`, migración 024, `attendance-policy-candidates.v1.json`, `lib/attendance-preparte.js`, `lib/internal-leave-workflow.js`, `local-agents/clock-fleet/gateway-config.mjs`.

## Mariano

| Módulo | Incrementos disponibles | Pendiente para el alcance integral |
|---|---|---|
| Registro normativo | Identidad, PDF/hash, artículos, versiones, comparación/exportación y relaciones revisadas. | Incorporación del acervo real y corpus histórico con OCR/cuarentena trazables. |
| Registro contractual | Ficha, partes, importes/plazos/responsable, revisiones, obligaciones y evidencia. | Instrumento/anexos, garantías y actos completos del ciclo contractual con revisión humana. |
| Expedientes | Carátula, documentos exactos, pases/actuaciones y cierre. | Interesados, reserva por expediente/área y aceptación integral con usuarios reales. |
| Vigencia y relaciones | Relaciones administrativas declaradas, cancelación y reapertura con versiones exactas. | Estado temporal jurídico fundado y aprobado, alcance por artículo y cadena de actos. |
| Alertas y agenda | Seguimientos, coordinación, obligaciones, agenda y Centro Unificado de consulta. | Entrega de avisos a destinatarios autorizados, deduplicación, reintento y cancelación. |
| Análisis de proyectos | Búsqueda, lectura y comparación documental. | Observaciones contra corpus autorizado, citas verificadas y revisión humana persistida. |

Alertas `50a9cb0` y relaciones `02c6cd9` cerraron entregas concretas. No certifican por sí solas los seis módulos completos. La última evidencia de base de ese cierre registra cero normas/relaciones/eventos; no se cargó corpus municipal ficticio.

Fuentes: alcance 84–121 del plan integral, migraciones 069/083–090 y documentos de cierre jurídico. Los números de despliegue y las verificaciones vivas pertenecen al informe de cada release.

## Criterio único de cierre

Cada entrega requiere alcance identificable, código y pruebas, CI del commit exacto, migraciones sólo después de gates verdes, publicación confirmada y verificación de producción. Se distingue evidencia sintética de sesión municipal, homologación y operación real. Las dependencias humanas o de acceso se declaran; no se reemplazan por datos o aprobaciones inventados.
