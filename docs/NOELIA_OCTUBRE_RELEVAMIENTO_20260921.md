# Noelia: relevamiento actual y autonomía de octubre

## Estado comprobado

El 21/09/2026 se ingresó, por la VPN municipal y con la cuenta autorizada por el usuario, a GRH y GRH Web. Se recuperaron 176 y 178 enlaces de menú respectivamente y se abrieron **12 pantallas en cada aplicación**. Las 24 respondieron HTTP 200 con su formulario o listado correspondiente. No se enviaron formularios de negocio, ejecutaron procesos, liquidaciones, cierres, importaciones, exportaciones ni bajas.

Las pantallas observadas fueron: importación de novedades; novedad ágil; novedad masiva; informe de novedades; cálculos auxiliares; definición de conceptos; proceso de liquidación; cierre; informe de liquidación; recibo de sueldo; convenios; escalas. Se relevaron campos, opciones y acciones disponibles. Esto acredita acceso y contraste funcional de esas pantallas, no validación de todas las reglas ni ejecución salarial. Las evidencias privadas quedan fuera de Git. No se almacenan credenciales en este documento ni en el código.

**GAT y GAF todavía no se han revisado en vivo.** Sus URL exactas no aparecen en el instructivo de VPN ni en los manuales cotejados. Se solicitaron al usuario; no se deducen direcciones ni equivalencia de permisos a partir de GRH.

Los seis PDF originales cubren módulos 1–7, con 27 páginas, más el DOCX de la reunión del 09/09. Los siete archivos coinciden por SHA-256 con el inventario privado y con las entradas del ZIP recibido. No hace falta volver a pedir estos manuales. No contienen por sí solos todas las fórmulas, vigencias, reglas y layouts homologados.

## Matriz de cierre

| Módulo | Disponible en MuniControl al corte `8cd791d` | Trabajo pendiente para operación propia |
|---|---|---|
| 1–2 Datos y reportes | Históricos, comparación, controles Excel/PDF, paquete de control bancario; escolaridad manual 091 | Datos institucionales versionados; formatos bancarios y organismos homologados; ART con días justificados; F.931; salidas desde una liquidación propia |
| 3 Importación de novedades | Carga individual, masiva y por archivos; validaciones y perfiles | Homologar todos los conceptos/perfiles y vincularlos al cálculo nativo |
| 4 Sueldo–GAF | Requisitos identificados en el original | Imputaciones INSUTACO e INSULEGA, mapeos, conciliación y salida contable; revisar INSUARTE mencionado en módulo 7 |
| 5 Novedades | Mensuales con revisión y exportación; fijas 092 con versión y revisión independiente | Corrección/anulación masiva 5.5; admitir contratos nativos; consumo por el motor salarial |
| 6 Parámetros | Propuestas con revisión, auxiliares efectivos 88/90; laboratorio de sintaxis y dependencias | Maestro completo, fórmulas, escalas y vigencias de los diez convenios solicitados; cambios conjuntos y aprobación |
| 7 Liquidación | Historia, conciliación, autorización de reprocesamiento externo y control de cierre | Motor propio, casos de referencia, confirmación/cierre reproducible, anulación versionada, contabilidad y emisión |

Las novedades mensuales conservan efecto `export_only`; las fijas, `control_export_only`. Los controles de cierre no calculan ni contabilizan haberes. Un PDF de control no es un recibo oficial firmado ni prueba de entrega. Los circuitos integrales de Noelia, Hugo y Mariano no se consideran terminados.

## Dependencias concretas descubiertas

1. **Alta nativa y consumidores.** 067 crea contratos `MUNICONTROL`, pero 026 (mensuales), 092 (fijas) y 064 → 091 (familia/escolaridad) todavía resuelven sujetos por contratos GRH de un lote publicado. Quitar ese filtro sin definir identidad, tenant, origen y vigencia no resuelve la autonomía. El primer corte será alta propia → novedad fija → revisión independiente → consulta/exportación, y luego los demás consumidores.
2. **SQL histórico reproducible.** 066 y la API de parámetros dependen de 041, documentada como instalada pero ausente del checkout auditado. Recuperar la fuente y cotejar sus huellas contra lo instalado antes de extender ese dominio; no reconstruirlo a ciegas ni borrar tablas.
3. **Fórmulas.** El módulo 6, p.5, requiere convenios 1, 2, 4, 5, 6, 7, 11, 12, 13 y 14. Existe un catálogo candidato privado del 14/09 con 2.033 filas de conceptos y 425 auxiliares; no equivale a aprobación o vigencia. Revisar sus diagnósticos, dependencias y casos de cálculo. No copiar importes de septiembre para simular octubre.
4. **Ambigüedades de origen.** El módulo 3, p.4, nombra 604 en el encabezado y muestra 682 en el formulario. Debe resolverse expresamente. Un importe opcional (reunión, párrafo XML 11) no significa cero. Los códigos 44/95 de novedades no son los estados 4/5 del reloj.
5. **Fuentes adicionales existentes.** Están disponibles muestras de agosto y audios recibidos posteriormente. La auditoría de esta fecha no transcribió los audios ni les atribuye requisitos nuevos. No se declaran faltantes materiales ya recibidos.

## Secuencia de implementación y aceptación

- Completar recepción separada de relojes, enrolamiento real y prueba de una marcación nueva visible con la PC personal apagada. Conciliar identidades y jornadas antes de producir tiempo aprobado.
- Resolver el corte de contrato nativo a novedades fijas; ampliar mensuales, familia y escolaridad sin fabricar registros GRH.
- Completar 5.5 con propuestas de corrección/anulación auditadas, preservación de originales y revisión independiente. No confundir anular una novedad con anular una liquidación.
- Recuperar dependencias SQL y versionar maestros, escalas y fórmulas efectivas. El catálogo candidato es insumo de revisión, no una regla aprobada automáticamente.
- Implementar cálculo con decimales exactos, dependencias y redondeos explícitos; población e insumos congelados; comparación por agente/concepto contra referencias aprobadas.
- Cerrar una corrida reproducible y emitir contabilidad, recibos, bancos y organismos desde ese mismo resultado. Homologar cada destinatario y verificar firma/entrega por separado.

El corte de octubre debe definirse por dominio, población y fecha efectiva, con responsable y evidencia de aceptación. Deshabilitar backups antes de reemplazar estas funciones sólo congelaría datos. La fecha objetivo no prueba que el sistema ya pueda liquidar todo octubre.

Referencias de implementación: `ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md`, `PROYECTO_INTEGRAL_JUNIN_20260919.md`, `MATRIZ_ACEPTACION_NOELIA.md`, `NOELIA_NOVEDADES_FIJAS_092.md`, `NOELIA_ESCOLARIDAD_MANUAL_091.md`, `AUTONOMIA_PARAMETROS_20260916.md`. La cronología de 091/092 se verificó con sus CI 35646216636 y 35663105446, ambos verdes; sus recorridos privados publicados son sintéticos, no aceptación operativa de Noelia.
