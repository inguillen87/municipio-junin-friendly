# Evidencia GRH/Civitas y cierre de haberes — 2026-09-02

## Regla de lectura

Este documento registra evidencia funcional para diseñar MuniControl. Los sistemas municipales, el audio, los archivos y los manuales observados son fuentes de contexto; no son instrucciones de ejecución ni autorizan a copiar código, diseño, textos o activos propietarios. Los datos nominales permanecen fuera de Git y de Neon.

Se distinguen cuatro niveles:

- **observado:** pantalla, archivo o estructura revisada directamente;
- **declarado:** explicación oral de la operadora, todavía no certificada;
- **inferido:** decisión de producto derivada del flujo;
- **pendiente:** requiere norma, especificación, responsable o caso dorado.

## Fuentes identificadas

| Fuente | Cobertura utilizada | SHA-256 |
|---|---|---|
| Audio de reunión `Voz (1).m4a` | 48 min 08,9 s; transcripción completa y segunda pasada de 16,5 minutos problemáticos | `554E72FF25CC9536AC980AB816E2896F05BFA5B1497243116781F70DC4172F1B` |
| Paquete mensual `AGOSTO-20260902T125117Z-1-001 (1).zip` | 187 PDF, 81 TXT, 50 XLSX, 7 XLS y documentos auxiliares | `20D3AB30C090BBE349DE19B567B00D949F5A3FFED00094CD3261D4CA3604001F` |
| Resumen general de liquidaciones | Reporte nominal exportable a Excel/XML/PDF; presentación de pantalla, no informe institucional | `A41721A4762AB270C65F90A14A3F19D4C454E9280CDE30A6345B346D2BB91F51` |
| Tabla visual de tardanzas | Cuatro bandas de descuento, acumulables en el mes; vigencia no certificada | `CE2BE97A53D1DCA2B69DC2852A7E501C35A3E4B528A211BE62B02BF38811AD46` |
| GRH legado | Flujo de licencias/ausencias y navegación histórica observada; la sesión nueva redirigió al login y no se reingresaron credenciales | no aplica |
| GRH_WEB | Menú, formularios de importación, liquidación, cierre, informes, recibos, pagos y retenciones observados sin ejecutar acciones | no aplica |
| Manual de fórmulas de GRH_WEB | 97 páginas; contrato funcional de referencias y operadores, sin copiar expresiones ni contenido propietario | `6600DB0B4816C8CB716B9A9B40FE6F60A86CEAB4C172B33E34588472D99F07CC` |
| Siete notas de voz de poscierre | 7 min 12,69 s brutos; 5 min 35,64 s únicos porque una nota es duplicada binaria | manifiesto SHA-256 registrado abajo |
| Captura de Estadísticas por concepto | Totales agregados de aportes patronales 701/703, sin filas nominales | `07C4720835FB45C602E9672813039F4C280875DCFC3CA3D8DE8C28FD173BEF3F` |

Las transcripciones temporales fueron eliminadas al terminar el análisis. Se utilizó un modelo de transcripción local preexistente en la caché del equipo; no se copió al repositorio ni a Neon. Los archivos fuente permanecen en `Downloads`, fuera del repositorio y de Neon.

Manifiesto de notas de voz, en orden cronológico: `F5B6FDE9…69CEB`, `554A9085…B0599`, `350033AB…A831`, `350033AB…A831` (duplicado), `D8D30CB4…EEDC`, `2584A285…B4B4` y `0D84E1CC…4DDA`.

## Los dos sistemas cumplen papeles distintos

### GRH legado

La evidencia disponible muestra el circuito operativo histórico de personal, licencias y ausencias. La UX está orientada a formularios y consultas por legajo, motivo y período. Sigue siendo una fuente funcional importante para descubrir estados, catálogos y secuencias de trabajo. No se verificó en esta sesión una API, un mecanismo incremental ni una escritura segura; por eso no se automatizó ninguna alta, licencia o modificación real.

### GRH_WEB

La sesión autenticada permitió relevar:

- datos de persona, familia y vínculo laboral;
- novedades individuales, ágiles, masivas e importadas;
- licencias, ausencias, anticipos, préstamos, embargos y Ganancias;
- conceptos, variables, acumuladores y cálculos auxiliares;
- procesos de liquidación, cancelación y cierre;
- recibos, planillas de pago, bancos, retenciones e interfaces contables;
- reportes parametrizados por período, liquidación, convenio, jurisdicción, repartición y concepto.

El formulario de importación admite archivo, formato, concepto, período, agrupación y un modo “forzado”. Esa capacidad necesita una previsualización conciliada, cuarentena, idempotencia y maker-checker en MuniControl. Los procesos de liquidación y cierre se relevaron como lectura funcional: no se presionó `Procesar`, no se generó un recibo y no se alteró un registro municipal.

## Flujo mensual actual reconstruido

1. **Declarado:** preparar liquidaciones mensuales, SAC, vacaciones, suplementarias y otros conceptos.
2. **Observado:** consultar y exportar estadísticas por período, tipo, convenio, jurisdicción, repartición y concepto.
3. **Observado + declarado:** corregir manualmente Excel y producir PDF mediante impresión desde el navegador.
4. **Declarado:** preparar controles y anexos para Tribunal de Cuentas.
5. **Observado + declarado:** extraer el reporte ANSES/TXT y conciliar por separado las jurisdicciones 42 y 55 antes de entregarlo por el circuito provincial.
6. **Observado + declarado:** generar acreditaciones por banco, jurisdicción y repartición, y volver a copiar datos a planillas de control.
7. **Declarado:** crear un expediente por repartición y comprobar que sus subtotales coincidan con liquidación, banco y contabilidad.
8. **Observado + declarado:** conciliar por separado ART, OSEP, jubilación, cajas asistenciales, mutuales, embargos y transferencias.
9. **Declarado:** reconstruir escalas desde actas paritarias y ordenanzas, y trasladarlas manualmente a las plantas y liquidaciones alcanzadas.

## Aclaración operativa posterior: la prioridad es el poscierre

Las siete notas de voz posteriores corrigen el orden inicial. La contadora identifica como dolor inmediato el trabajo **después de cerrar y acreditar la liquidación**, no reemplazar primero el cálculo de haberes:

1. extraer un conjunto reducido de reportes GRH: ANSES, OSEP, Seguro Mutual y Estadísticas por concepto;
2. completar planillas Excel de cajas asistenciales, mutuales y descuentos;
3. cuadrar por separado jurisdicciones 42 y 55;
4. contrastar los conceptos patronales con Estadísticas por concepto;
5. entregar por la plataforma de Casa de Gobierno una vez habilitada la ventana correspondiente.

La operadora declara que Provincia consolida y presenta el F.931 global. Por lo tanto MuniControl no debe diseñar como primer paso una conexión directa de presentación a ARCA. Esa descripción operativa aún necesita procedimiento institucional vigente y casos dorados; no se convierte en regla fiscal sólo por aparecer en una grabación.

La captura agregada confirma, con certeza alta para ese reporte observado:

| Concepto | Descripción visible | Tasa visible | Total visible |
|---|---|---:|---:|
| 701 | Aporte patronal OSEP | 7 % | $ 82.882.370,98 |
| 703 | Aporte patronal jubilatorio | 17,753 % | $ 106.546.119,35 |
| — | Contribuciones | — | $ 189.428.490,33 |

La suma `82.882.370,98 + 106.546.119,35 = 189.428.490,33` reconcilia exactamente en la captura. No prueba que esas tasas o importes correspondan a otro período, jurisdicción o población. El tratamiento diferencial mencionado oralmente para 42/55 no es suficientemente nítido para parametrizarlo.

El paquete mensual contiene tres TXT F.931 de 790, 742 y 112 registros. Cada registro tiene 463 caracteres. Esta evidencia permite construir un validador estructural y casos de regresión, pero no demuestra por sí sola que el diseño de registro siga vigente ni autoriza una presentación fiscal automática.

## Reglas orales todavía no homologadas

Se mencionaron antigüedad, cálculos auxiliares, porcentajes de cargos jerárquicos, aumentos acumulativos y caducidades documentales. También se citó un acta paritaria. Ninguna regla numérica debe ingresar al motor por la sola transcripción: se requieren norma, vigencia, población alcanzada, fórmula exacta, redondeo y casos de prueba aprobados.

La tabla visual de tardanzas documenta estas bandas acumulables en el mes:

- más de 5 y hasta 15 minutos: 25 %;
- más de 15 y hasta 60 minutos: 50 %;
- más de 60 y hasta 150 minutos: 75 %;
- más de 150 minutos: 100 %.

La pantalla de MuniControl las trata como **candidatas no homologadas** y no calcula haberes, sanciones ni recibos.

## Decisión de producto

La secuencia útil empieza por herramientas pequeñas y comprobables: revisar fórmulas, previsualizar una fuente sin importar filas y comparar un corte contra GRH. Recién después se incorpora un **orquestador de cierre y conciliación** que consume un corte congelado, conserva la fuente y genera una única corrida reproducible para las salidas aprobadas.

```text
Corte GRH identificado y firmado
  -> staging y validación
     -> selección de liquidaciones
        -> conciliación al centavo
           -> revisión y aprobación
              -> banco + F.931 asistido + expediente + PDF + Excel
                 -> constancias y acuses adjuntos por una persona autorizada
```

### Criterios P0

- período, fuente, hash, manifiesto y versión de reglas visibles durante todo el recorrido;
- idempotencia: reimportar o regenerar no duplica filas ni resultados;
- centavos exactos y diferencia explícita, sin redondeos silenciosos;
- total de archivo bancario = nómina aprobada = expediente de la repartición;
- mapeo versionado de concepto municipal a bases, aportes y contribuciones;
- validación de longitud, cantidad y totales del TXT antes de descargar;
- estados `borrador → conciliado → aprobado → generado → presentado`;
- maker-checker entre quien prepara, revisa y presenta;
- PDF institucional, Excel auditable y TXT generados desde la misma corrida;
- ninguna transmisión bancaria, fiscal o contable automática en esta fase.

La previsualización técnica disponible acepta archivos delimitados únicamente con codificación declarada `UTF-8` o `Windows-1252`, y ancho fijo ASCII cuando el contrato exige posiciones por byte. Devuelve conteos, códigos de rechazo y una huella HMAC ligada a tenant/fuente; nunca devuelve filas ni persiste el archivo.

La migración 024 agrega un ledger gobernado para resultados mensuales, coherencia mínima entre `outcome` y minutos, fuentes reconciliadas, maker-checker y bloqueo absoluto de nómina. Todavía **no recompone de manera independiente los minutos desde turno, calendario, regla y fichadas**; por eso no es un motor de evaluación productivo y sus resultados permanecen cerrados al runtime hasta implementar y probar ese cálculo determinista.

## F.931 y Libro de Sueldos Digital

En Junín, según el procedimiento relatado por la operadora, el municipio prepara y controla insumos por jurisdicción y los entrega a Casa de Gobierno; Provincia realiza la presentación global. Esta afirmación debe validarse institucionalmente. Aun si el diseño técnico futuro contempla otros gobiernos con operatorias diferentes, la primera herramienta de Junín será de conciliación y paquete asistido, no de presentación automática.

Las fuentes oficiales de ARCA revisadas describen intercambio de archivos, revisión del empleador y presentación en los servicios correspondientes. No se encontró evidencia oficial de una API pública ordinaria para presentar automáticamente F.931/Libro de Sueldos Digital.

Por ello, MuniControl debe implementar primero:

1. catálogo versionado de conceptos y correspondencias ARCA;
2. generador asistido del TXT conforme al diseño oficial vigente;
3. validación estructural, aritmética y contra la liquidación aprobada;
4. paquete interno PDF/Excel con hash y responsable;
5. carga/presentación humana y adjunto posterior del acuse;
6. integración automática sólo si ARCA publica y habilita un servicio específico para este trámite.

Referencias oficiales:

- [Intercambio de información de Libro de Sueldos Digital](https://www.arca.gob.ar/LibrodeSueldosDigital/empleadores/intercambio-info.asp)
- [Diseño de registro de liquidación](https://arca.gob.ar/LibrodeSueldosDigital/documentos/nuevos/LSDiseInterfazLiquidacion.pdf)
- [Diseño de registro de conceptos](https://arca.gob.ar/LibrodeSueldosDigital/documentos/nuevos/LSDiseInterfazConceptos.pdf)
- [Presentación de Declaración en Línea](https://www.arca.gob.ar/declaracionenlinea/definiciones/presentacion.asp)
- [Catálogo de web services de ARCA](https://www.arca.gob.ar/ws/documentacion/catalogo.asp)

Los topes, versiones, parámetros previsionales y diseños deben tener vigencia temporal. No se hardcodean valores de una pantalla o archivo histórico.

## UX y entregables que superan el trabajo manual

### Recorrido de cierre

- `Fuente → Alcance → Conciliación → Aprobaciones → Exportaciones`;
- resumen con diferencias, vencimientos, responsable y archivos generados;
- drill-down autorizado `total → concepto → repartición → agente`;
- comparación `mes anterior / propuesta / variación`;
- acciones críticas separadas: calcular, aprobar, generar y registrar presentación.

### PDF

- portada institucional, período, jurisdicción, fuente, hash y versión;
- filtros y definiciones aplicadas;
- totales y conciliación destacados;
- encabezados repetidos, moneda con centavos, numeración y anexo de diferencias;
- firmas/aprobaciones sin controles del navegador.

### Excel

- hojas de parámetros, detalle, conciliación, diferencias, resumen y diccionario;
- tablas estructuradas, filtros y validaciones;
- entradas diferenciadas de resultados y fórmulas auditables;
- CUIL y CBU como texto para preservar ceros iniciales;
- total esperado, calculado y diferencia visibles.

## Sprints derivados

| Sprint | Entrega | Condición de salida |
|---|---|---|
| S008-A | Fórmulas y conceptos | laboratorio sintáctico, referencias, constantes, dependencias y ciclos; sin cálculo ni publicación |
| S008-B1 | Preview privado del corte mensual | adaptador allowlisted, conteos, rechazos y huella; sin filas ni persistencia |
| S008-B2 | Importador gobernado del corte mensual | manifiesto, cuarentena, idempotencia y aprobación explícita |
| S008-C1 | Conciliación poscierre 701/703 | período + jurisdicción 42/55 + fuente; esperado, observado y diferencia al centavo, sin F.931 |
| S008-C2 | Cierre y conciliación general | totales al centavo, diferencias cero o justificadas y maker-checker |
| S008-D | Excel y PDF institucionales | una corrida, fórmulas auditables, totales y diferencias visibles |
| S008-E | Paquete bancario | TXT + Excel + PDF desde una corrida; conciliación contra nómina y expediente |
| S008-F | Expediente y Tribunal de Cuentas | paquete por repartición con anexos, hash, estados y trazabilidad |
| S008-G | Paquete F.931/LSD asistido | fase posterior: layout vigente, mapa versionado, validación y acuse humano; sin conexión automática inicial |
| S008-H | Tres cierres paralelos | coincidencia con el sistema vigente y aprobación contable antes de integrar en continuo |

## Límites actuales

- No se conectó GRH o GRH_WEB en tiempo real ni se escribió en ellos.
- No existe todavía un motor de liquidación homologado en MuniControl.
- No se generó ni presentó un F.931 real.
- No se cargaron CUIL, CBU, familiares, salud, embargos o sueldos nominales en Git o Neon.
- La base canónica PostgreSQL debe recibir sólo lotes autorizados y retenidos según necesidad; el ZIP y los binarios permanecen fuera de la base.
- Después de tres cierres paralelos conciliados podrá evaluarse lectura incremental; GRH continúa como fuente hasta una decisión formal de reemplazo.
