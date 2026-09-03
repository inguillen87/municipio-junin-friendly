# Inventario funcional GRH y GRH_WEB — 02/09/2026

## Alcance y nivel de evidencia

Relevamiento de navegación realizado en modo lectura sobre las dos aplicaciones municipales accesibles por VPN:

- GRH clásico: interfaz basada en `frameset`;
- GRH_WEB: interfaz web posterior sobre el mismo catálogo funcional.

Ambas carcasas exponen **155 rutas funcionales únicas** y 178 enlaces visibles al contar accesos repetidos. El análisis no creó, editó, confirmó, anuló, cerró, importó ni exportó registros municipales. Con una sesión operativa vigente se inspeccionaron además, sin enviar formularios, los contratos de diez circuitos prioritarios. Esto confirma el árbol completo y una muestra profunda de los campos y estados de mayor valor; no equivale a certificar una por una las reglas internas de las 155 rutas.

No se copiaron credenciales ni datos personales. Los dominios sensibles detectados incluyen legajos, grupo familiar, antecedentes disciplinarios y médicos, salarios, bancos, embargos, retenciones, Ganancias y recibos.

## Verificación autenticada del 02/09/2026

- La cuenta operativa suministrada ingresó correctamente a GRH_WEB.
- La cuenta administrativa suministrada fue rechazada por GRH_WEB exactamente como fue entregada; no se probaron variantes ni se guardaron secretos.
- GRH clásico conservaba una sesión autenticada y permitió inspeccionar el formulario de proceso de liquidación.
- Las comprobaciones fueron de navegación y lectura. No se pulsaron acciones como `Procesar`, `Cerrar`, `Anular`, `Aceptar`, importar o exportar.

Los circuitos observados a nivel de formulario fueron:

| Circuito | Contrato funcional observado |
|---|---|
| Novedad de liquidación ágil | Legajo, período, tipo de liquidación, concepto, área, mes de ajuste, unidades, importe, movimiento e instrumento legal |
| Novedad masiva | Selección múltiple de legajos, período, movimiento y concepto antes de procesar el lote |
| Informe de novedades | Legajo, período y seis tipos de liquidación |
| Ausencias y licencias | Legajo y catálogo de 28 tipos de licencia |
| Licencias anuales | Legajo y período |
| Planilla de pagos | Período, fechas, rangos de repartición/convenio, concepto y modo de visualización |
| Reporte de liquidación | Período, rango de meses y rango de legajos |
| Recibo de sueldo | Período, pago/depósito, tipo de recibo, leyenda, observación y rangos organizativos |
| Cierre de liquidación | Tipo, período y fecha con ejecución directa, sin una previsualización explícita visible |
| Proceso de liquidación clásico | Liquidación previa, fechas, forma de proceso, destino, vacaciones/SAC y alcance por legajo, convenio, repartición o totalidad |

## Fórmulas y conceptos que MuniControl debe gobernar

El manual interno de fórmulas confirma una separación por convenio entre maestro de conceptos, fórmula, condición y resultado. La notación observada distingue resultado en importe y unidades, novedades de importe y unidades, cálculos auxiliares y variables del legajo. También admite aritmética, comparaciones, operadores lógicos y ramas condicionales.

Esto valida la dirección del laboratorio de fórmulas de MuniControl, pero no lo convierte todavía en un motor de liquidación. El producto debe preservar cuatro límites:

1. versionar la fórmula y el convenio que la utiliza;
2. simular con casos dorados antes de publicar;
3. explicar cada resultado y diferencia;
4. impedir que un importe manual `forzado` saltee el circuito sin motivo, aprobación y auditoría.

Los conceptos se agrupan funcionalmente en haberes remunerativos, haberes no remunerativos, retenciones del empleado y contribuciones patronales. Las novedades fijas tienen vigencia; las variables pertenecen a un período concreto. Los acumuladores deben entrar a una fórmula mediante un cálculo auxiliar, no como una suma opaca.

## Contrato de mejora frente al sistema legado

MuniControl no debe copiar una pantalla que ejecuta directamente. Para cada proceso sensible debe cerrar el siguiente recorrido:

1. **Preparar:** seleccionar fuente, período, alcance y responsables.
2. **Validar:** detectar duplicados, conceptos inválidos, superposiciones y totales incompatibles.
3. **Previsualizar:** mostrar altas, bajas, diferencias, excepciones y efecto esperado sin escribir.
4. **Aprobar:** decisión humana separada, con versión y motivo.
5. **Ejecutar:** idempotencia, registro del actor y resultado técnico.
6. **Conciliar y exportar:** Excel/PDF/TXT derivados de la misma instantánea cerrada.

El paquete ejecutivo agregado implementado en esta rama cubre el último principio para indicadores no nominales: la pantalla, el Excel y el PDF nacen del mismo corte y la misma huella, sin consultar ni escribir en Neon.

## Clasificación observada

| Tipo de superficie | Cantidad | Lectura funcional |
|---|---:|---|
| Listados y ABM | 103 | Consulta y mantenimiento de maestros o registros |
| Formularios de proceso | 35 | Preparación parametrizada antes de una ejecución o informe |
| Ejecuciones directas | 8 | Operaciones de alto impacto que requieren confirmación y auditoría |
| Reportes SQL | 2 | Salidas construidas desde consultas específicas |
| Importaciones | 1 | Ingreso masivo desde archivo |
| Auxiliares y sesión | 9 | Navegación, contexto y soporte |

## Mapa funcional confirmado

| Dominio | Opciones observadas | Resultado de negocio que MuniControl debe cerrar |
|---|---|---|
| Entorno | Datos del Municipio, reportes, filtros, importación de novedades, formatos e ítems, integración GRH–GAF y bancarización | Registrar fuente, previsualizar, conciliar, aprobar e importar sin repetir trabajo manual |
| Novedades | Definición de ítems, ítems por legajo, novedad ágil, novedad masiva, informe de novedades y novedades fijas | Cargar manual o archivo, validar período/legajo/concepto/duplicados/totales, revisar diferencias y aprobar un lote trazable |
| Licencias y ausencias | Registro de ausencias/licencias especiales, motivos, observaciones y licencias anuales | Solicitar, revisar evidencia, controlar superposición/calendario/política, aprobar o rechazar y producir la novedad correspondiente |
| Descuentos | Anticipos, pagos de anticipos, préstamos, embargos comerciales y retención alimentaria | Separar maestro, saldo, cuota, aplicación mensual, aprobación y recibo sin exponer información restringida |
| Ganancias | Tramos, deducciones, DDJJ, acumulado anual, liquidación, control y eliminación masiva | Validar normativa/versiones y exigir confirmación reforzada para operaciones destructivas |
| Parámetros | Retroactivos, conceptos, acumuladores, cálculos auxiliares, duplicación y compilación de convenios | Versionar fórmulas y conceptos, simular, comparar, aprobar y publicar una versión auditable |
| Liquidación | Procesar, anular, cerrar y ajustar negativos | Mostrar un circuito explícito preparar → calcular → conciliar → aprobar → cerrar, con reapertura gobernada |
| Control | Fórmulas, cálculos auxiliares, acumuladores, novedades fijas/mensuales, variables, acreditación y antigüedad | Explicar cada diferencia antes de afectar una liquidación |
| Informes | Retenciones, obras sociales/sindicatos, planilla de pagos, liquidación, depósitos judiciales, asignaciones, estadísticas, recibos y planilla rubricada | Generar salidas Excel/PDF/TXT desde una única corrida versionada y conciliada |
| Administración | Legajo, familia, datos laborales, foja, disciplina, estudios, escalafón, estructura, medicina laboral y elementos de seguridad | Resolver tareas por persona con privacidad, historial y permisos de propósito específico |

## Decisión de producto

No se replica el árbol de navegación legacy. MuniControl agrupa el mismo trabajo en tres tareas legibles:

1. **Cargar novedades:** manual o masiva, con preflight, lote, diferencias y aprobación.
2. **Resolver personas:** legajo, licencias, ausencias y documentación en un circuito único.
3. **Controlar y cerrar liquidación:** conciliación, aprobación y salidas profesionales desde una sola instantánea.

## Orden de implementación

1. Paquete ejecutivo RRHH reproducible desde datos agregados: revisión, Excel y PDF desde el mismo corte.
2. Novedades individuales y masivas gobernadas: ingreso → validación → lote → aprobación → informe.
3. Licencia/ausencia hasta novedad de nómina: decisión humana y trazabilidad, sin aprobar automáticamente.
4. Paquete posliquidación: pagos, retenciones, acreditación y excepciones desde una corrida cerrada.

Las integraciones fiscales, bancarias o de posting quedan después de homologar contratos, casos dorados y responsables. La existencia de una ruta en GRH no acredita que su regla o formato esté vigente en 2026.
