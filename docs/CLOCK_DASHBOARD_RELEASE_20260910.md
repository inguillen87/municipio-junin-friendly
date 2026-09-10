# Tablero de asistencia y novedades por unidades — 10/09/2026

## Alcance de este sprint
Nuevo tablero responsive con filtros de período, nombre/legajo, identidad y hora; gráficos diarios y semanales, hallazgos determinísticos y observaciones. La búsqueda se ejecuta en SQL en todo el período, no sólo en la página visible. Se mantienen nombres sólo con autorización nominal. Excel/CSV incluyen todas las filas del filtro (máximo 25.000) y la misma captura; un error o cambio de permisos/captura cancela el archivo completo. La opción Imprimir/PDF usa el navegador y aclara que el detalle impreso es la página visible.

Las etiquetas K20 son referencias del perfil ZKTeco clásico: estado 0 entrada, 1 salida, 2 inicio pausa, 3 fin pausa, 4 inicio extra y 5 fin extra; método 1 huella. Estado y método son campos distintos. Fuente: manual ZKTeco Standalone SDK Development, 2.1 Rev.A.2, 25/04/2018, secciones SSR_GetGeneralLogData y CustomizeAttState. Copia del documento original consultado: https://studylib.net/doc/28436895/zkteco-sdk-development-manual . No se copió el manual al repositorio. Los códigos desconocidos permanecen explícitos. No se modifica la dirección canónica, no se aprueban horas extra ni se presume configuración local homologada.

El importe normal es opcional, como pide REUNION 09.09.2026, página 2. Se ingresa concepto, unidades y fundamento; importe nulo no es cero. Las excepciones manuales/forzadas conservan sus controles. Esto no implementa ni certifica el motor salarial.

## Módulos documentados que deben reemplazarse, no sólo reproducirse visualmente
1–2 Datos y reportes: bancarización por banco/jurisdicción 42 y 55; acreditación Credicoop y Nación; Transferencias varias; OSEP; Seguro Mutual; ART (993 + 995 según documento de Noelia); escolaridad y tres salidas F.931 (total, 42, 55). Generar desde las bases propias y liquidaciones aprobadas; no pedir un Excel ya calculado.
3 Importación: mayores 44 y full time 95 se autorizan por secretaría; entradas de OSEP y otros terceros requieren adaptadores, no inventar importes. Los TXT de referencia no sustituyen las reglas de aprobación.
4 Integración GRH–GAF: INSUTACO relaciona concepto/repartición/partida/cuenta; INSULEGA relaciona legajo/institucional/nomenclador. El módulo 7 menciona INSUARTE. Mantener identificadores fuente hasta verificar sus relaciones, sin tratarlos como sinónimos.
5 Novedades: individuales/masivas/fijas, valores, vigencias y rectificaciones. Eliminar la carga monetaria obligatoria no equivale a resolver fórmulas.
6 Parámetros: auxiliares 88/90, escalas y fórmulas por convenio. Según documento 6: 88 clase 6-D para concepto 24; 90 clase 3-A; convenios 1/4/6 comparten estos cálculos. Para 2/7/11, auxiliar 88 = clase 13-I × 1,50. Migrar fórmulas literales de 1/2/4/5/6/7/11/12/13/14, conservar antecedentes de convenios sin uso. El texto 604 del documento 3 y su captura no coinciden: no corregir sin contrastar catálogo y fórmula.
7 Liquidación: mantener anulación, llamar Confirmar a proceso de liquidación, cierre histórico e imputación. No se ejecutan cierres ni se alteran haberes por publicar este tablero.

## Despliegue y pendientes
La migración aditiva 046 se prueba en QA antes de producción. V1 sigue disponible por compatibilidad. No se cambian contraseñas, MFA, roles, contratos, eventos ni fórmulas salariales.
El servicio permanente de lectura de los relojes todavía requiere instalarse y verificarse en infraestructura municipal. Refrescar una consulta no equivale a nuevas fichadas. Ninguna parte de este sprint afirma acceso remoto a los servidores GAF/GRH de la red municipal.
Siguiente orden: colector persistente con cola y monitoreo; turnos/cobertura y homologación local; fórmulas/escala vigentes; salidas bancarias y regladas conciliadas con archivos de referencia; liquidación y contabilidad propias.
