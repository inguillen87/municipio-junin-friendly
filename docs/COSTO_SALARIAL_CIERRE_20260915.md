# Reporte de conceptos: costo salarial y exportación compacta

Continuación desde master `d7a9969c3f0745fdaa9056f33f7bd1ead5eca5e4`. Incremento acotado de Reportes/Haberes y descuentos y su reutilización desde Nómina.

## Pedido funcional

Directiva de Noelia del 15/09/2026: incluir **costo salarial = 993 + 994 + 995 + 701 + 703**, y reducir la cantidad de hojas sin quitar conceptos. Los documentos originales quedan fuera de Git. No se utiliza el certificado fiscal personal adjunto para nómina municipal.

- Se suma exclusivamente cada uno de esos cinco importes informados, usando enteros de centavos. No se suman las filas de detalle otra vez, no se agrega el 990 y no se resta el 996 al costo.
- El costo corresponde a la corrida seleccionada completa. Buscar/filtrar afecta el detalle, no transforma silenciosamente el costo. Un componente ausente o incompleto impide mostrar un total parcial como costo completo; cero explícito y ajustes negativos se conservan.
- Se muestran, por separado, control 990 menos (701+703) y 999 menos (993+994+995-996). Las diferencias no se corrigen ni explican por intuición. Su coincidencia no acredita cierre, pago ni cálculo salarial propio.
- La pantalla muestra costo, composición desplegable, importes faltantes y diferencias. El HTML usa texto, no contenido ejecutable del origen. No cambia los logos ni los PM.
- PDF compacto específico del reporte de conceptos: resumen inicial y cabeceras breves de continuación. El XLSX conserva Datos/Totales/Control y agrega Costo salarial con componentes numéricos, fórmulas y resultados de control. El CSV sigue siendo el detalle tabular filtrado; no se agregan filas monetarias que cambien su estructura.
- Cada descarga consulta otra vez la fuente autenticada. Cambiar el filtro o salir de la tarea mientras se verifica cancela la descarga anterior; cambios de identidad/estado/metadatos también requieren nueva consulta.

## Alcance y pruebas

No cambia SQL, migraciones, API, salarios, autorizaciones, firmas, cierres, IP o asociaciones PM. No completa el resumen mensual de varias corridas, el módulo 7 o la cámara/extracción de certificados.

Pruebas: `node --test tests/salary-cost-report.test.js tests/report-centre.test.js`; `node scripts/verify-salary-cost-browser.mjs` después del build; regresión existente de Reportes y marca. Los casos de navegador son sintéticos. No afirmar sesión municipal real con MFA.

La generación aislada desde el PDF adjunto preservó 91 conceptos en tres páginas, frente a cinco del original. No se publica ese caso privado ni se presenta como lectura actual de Neon. Verificar las capturas y los archivos de CI antes de publicar; los resultados definitivos se registran en el run, no se dan por aprobados anticipadamente.

Las ramas internas `internal-*` no generan despliegues Vercel automáticos; master y otras ramas conservan su comportamiento anterior. Las pruebas se agrupan en GitHub Actions y la publicación es una única entrega validada. El filtro sólo aplica a esa rama; no elimina otros trabajos ni el historial de despliegues.

Revertir el incremento es revertir interfaz/exportadores. No restaurar toda la base ni borrar información municipal para deshacer cambios de presentación.

## Navegación Liquidaciones
Desplegable junto a Personas con siete destinos existentes: Resumen, Reportes y costo salarial, Novedades, Comparar, Historial, Parámetros (análisis) y Solicitudes de corrección. Respeta permisos y no hace consultas nuevas. No completa los siete módulos históricos ni el motor del módulo 7 (#37). Conserva logos, PM, formularios y rutas. La herramienta temporal de recuperación no se publica.
