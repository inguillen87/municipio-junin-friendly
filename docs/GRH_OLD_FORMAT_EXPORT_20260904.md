# Catálogo real de formatos descargado de GRH antiguo

Fecha: 04/09/2026. Acceso operativo confirmado con la credencial facilitada por el usuario. Se consultó `http://172.100.96.4:8080/grh/actions/abmAction.do?do=list&entityName=Formatoitem` y se utilizó el enlace **Excel** de esa pantalla. No se guardó ni eliminó configuración.

## Archivo y alcance

- Nombre entregado por GRH: `rrhh.xls`.
- Copia local: `tmp/grh-reference-exports/1788567827057-rrhh.xls`.
- Tamaño: 17.353 bytes.
- SHA-256: `7918498abe0e559300806b6f35b44e273c3b5821f86c8c850aa052ee4e35999a`.
- Contenido real: tabla HTML con extensión `.xls`, no un libro binario XLS ni un XLSX. Esto es relevante para compatibilidad de importadores; no basta con confiar en la extensión.
- 47 definiciones de campo, agrupadas en 20 formatos. Los campos Código Detalle y Código Controlador estaban vacíos en las 47 filas.
- Sólo configuración de formatos: no filas de empleados, liquidaciones ni cuentas bancarias. No se subió a Neon.
- La descarga adicional XML no se obtuvo; el navegador agotó el tiempo de espera.

## Definiciones conservadas

Cada campo se expresa como **posición / longitud**, exactamente como informa el catálogo. No implica escala decimal, redondeo, codificación del archivo operativo ni validez de un concepto salarial.

| Formato original | Identificador | Importe | Cantidad |
|---|---|---|---|
| AMSA | DNI 0/8 | 8/11 | — |
| COLEGIO FARMACEUTICO | DNI 3/8 | 44/8 | — |
| Formato Junin | DNI 5/8 | 44/11 | — |
| IPV | DNI 3/8 | 40/11 | — |
| MAYOR y FULL | DNI 0/8 | — | 8/5 |
| MERCANTIL | DNI 3/8 | 47/5 | — |
| MUTUALES | DNI 3/8 | 47/5 | 8/4 |
| OSEP - CATAST.INDIRECT. | DNI 7/8 | 126/6 | 120/4 |
| OSEP - CATAST.VOLUN.EST. | DNI 7/8 | 148/10 | 147/3 |
| OSEP - CATAST.VOLUN.PUROS | DNI 7/8 | 135/10 | 134/3 |
| OSEP - Cta.Cte. | DNI 7/8 | 161/10 | — |
| OSEP - VOLUN.Estudiante | DNI 7/8 | 96/10 | 95/3 |
| OSEP - VOLUN.PUROS | DNI 7/8 | 83/10 | 82/3 |
| OSEP CUOTA % | DNI 7/8 | — | 62/5 |
| RETRO | LEGAJO 0/8 | 8/10 | — |
| RetroactivosGob | DNI 3/8 | 44/8 | — |
| SMSV - Seguro | DNI 3/8 | 41/11 | — |
| UPCN | DNI 3/8 | 47/5 | — |
| sac | LEGAJO 0/8 | 14/11 | 8/6 |
| sindicato municipal | DNI 3/8 | 47/5 | — |

## Diferencias y próximos controles

1. El selector de importación ofrece 21 formatos, pero esta exportación tiene definiciones para 20: **FULL TIME** no aparece separado; **MAYOR y FULL** sí. No fabricar una definición para completar el catálogo ni suponer que son equivalentes.
2. Algunas posiciones OSEP de cantidad e importe se superponen si se interpretan como segmentos de texto simples. Conservar lo observado y cotejar archivos y comportamiento antes de implementar; no corregir automáticamente el catálogo de origen.
3. RETRO ya fue contrastado con las 68 filas de la muestra de agosto: legajo de ocho dígitos y un importe con decimal explícito. Este resultado no homologa los otros diecinueve formatos.
4. Prioridad de Noelia: OSEP, Mayor/Full, RETRO, Colegio Farmacéutico y Formato Junín. La próxima entrada debe compararse con su archivo original, probar identificadores/decimales y mostrar rechazos antes de preparar novedades.
5. Esta tabla es evidencia de investigación, no una configuración runtime que habilite importaciones nuevas.
