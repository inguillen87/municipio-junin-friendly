# Parque de relojes: dos etapas, una vista por equipo

## Alcance del incremento

Continúa el sprint de tiempo y ausentismo publicado en `eafb852`. Cierra la composición de lectura del parque: una tarjeta por equipo, archivo original y recepción operativa lado a lado, matriz de consulta, filtros por etapa y exportación del control completo. No incorpora nuevos originales a las fichadas canónicas ni modifica dispositivos, contratos, permisos o nómina.

PM10 no tiene tratamiento especial en el modelo de esta pantalla. Si conserva marcaciones consultables pero no está inscripto en el archivo separado, se muestra su histórico como consultable; no se exige reenviar sus datos ni crear un segundo reloj. En cualquier punto con originales guardados y sin consulta operativa se informa `Archivo recibido · por incorporar`, sin convertir esos originales en horas calculadas.

## Lectura compuesta y permisos

`GET /api/internal-clock-source?view=workspace` amplía el endpoint existente. La consulta sin `view` conserva el contrato `clock-source-dashboard.v1`; recepción de hardware e ingesta no cambian. Sólo se admite ese valor de vista, sin parámetros de municipio, identificadores de dispositivos, versiones o listas enviados por el navegador.

Se reutilizan la autorización municipal y las fachadas de lectura existentes: acceso inicial, flota e inventario inicial, consulta del archivo para esos UUID autorizados, segundo control de sesión/permisos y segundo control de inventario. Un cambio en la sesión, fuente, punto o versión del equipo rechaza el resultado completo. La respuesta final contiene la flota revalidada y el archivo correlacionado por UUID y punto; no se unen equipos por nombre ni por orden.

Los timestamps de recepción operativa y archivo permanecen separados. `composed_revalidated` significa una observación compuesta con validación antes/después, **no** una transacción distribuida, continuidad física ni cobertura completa. El modelo comprueba los dos inventarios, nombres/modelos/estados actuales, unicidad y fechas de consulta compatibles.

Una indisponibilidad técnica del archivo puede devolver recepción operativa autorizada más `archiveAvailability=unavailable`, `archive=null`. Los contadores de archivo quedan como `Sin verificar`, nunca cero. No se degrada a éxito parcial una denegación 401/403, un cambio de identidad o una respuesta inválida. No se vuelcan credenciales, rutas SQL, diagnósticos clínicos, nombres de agentes ni bytes del reloj en este control.

## Interfaz de trabajo

- Cuatro indicadores del parque completo: equipos registrados, equipos con archivo original, con marcaciones consultables y con archivo sin consulta operativa todavía.
- Gráfico de etapas no superpuestas: consultable, por incorporar, archivo incompleto, esperando archivo, configuración pendiente, no verificable y restringido. Seleccionar una etapa filtra las tarjetas; no altera el total del parque.
- Búsqueda local sobre el inventario completo por punto, lugar o modelo; conserva tildes en pantalla y admite búsqueda sin acentos. No genera consultas por tecla o por dispositivo.
- Tarjetas y tabla accesible muestran los mismos equipos. Cada tarjeta conserva trazabilidad de ambas etapas y el próximo paso; sólo ofrece Ver marcaciones cuando la fuente operativa habilita esa consulta.
- Exportación CSV reconsulta y revalida el acceso, conserva los dos cortes y exporta todos los equipos del filtro. Escapa fórmulas y distingue desconocidos de ceros confirmados. No suma ni resta registros archivados y nuevas marcas para inventar un saldo pendiente.
- Actualización automática optativa cada minuto. No se superpone con otra consulta ni interrumpe filtros sin aplicar, controles enfocados o detalles abiertos. Página oculta, salida y revocación suspenden la actividad; una respuesta tardía no repuebla la pantalla.

El mapa conserva la evidencia operativa de recepción existente, no interpreta un archivo guardado como conexión actual. La consulta independiente del archivo queda bajo un detalle técnico y no se ejecuta automáticamente como segunda lectura desde esta nueva vista.

## Verificación y límites de publicación

Pruebas del modelo, API y controles previos: cobertura de formato estricto, vinculación por UUID/punto, cambios de sesión/inventario, caída del archivo, 401/403, búsqueda, exportación y compatibilidad de la vista anterior. La prueba de navegador carga la página real construida con respuestas sintéticas, en escritorio, 390 y 320 píxeles. La variante `--published` compara los bytes públicos con el build; intercepta las API privadas y no representa una sesión de Noelia o Hugo operando datos reales.

La matriz CI de archivo conserva sus pruebas PostgreSQL 17/18 y agrega la aceptación de este parque al trabajo de regresión existente. No se crea otra base, se amplía un plan pago, instala una migración ni se modifica el firmware/serie de un reloj para publicar esta interfaz. Los resultados finales, commit y despliegue se registran en la evidencia de release, separados de la aceptación municipal.

## Qué sigue pendiente

1. Convertir y conciliar los originales de los otros equipos dentro de la consulta canónica de marcas y jornadas. El nuevo estado visible no ejecuta esa incorporación.
2. Completar vínculo temporal de usuario de reloj, persona y contrato; homologar códigos por modelo y tratar duplicados/marcas tardías sin modificar originales.
3. Cerrar calendarios y turnos aprobados, licencias, revisión independiente, reconocimiento de tiempo y entrega idempotente de cantidades a Noelia.
4. Probar el colector en un host municipal que funcione después de reiniciar y con la computadora personal apagada. Este sprint no instala servicios ni comprueba físicamente los dispositivos.
5. Completar el paquete/importador y promoción coordinada del respaldo del 22/09. La fuente de nómina y personal no cambia con este despliegue.

## Continuidad de los documentos de Noelia recibidos

El módulo 9, `RECIBOS`, conserva el pedido de rango de legajos/reparticiones, período, fecha de acreditación o pago, tipos de liquidación, PDF, firma digital y descarga por cada agente (página 1). La composición de relojes no emite ni firma un recibo.

El módulo 10, `ESTRUCTURA PRESUPUESTARIA DE CARGOS`, pide controlar cargos liquidados contra los presupuestados de cada año y salida detallada en PDF (páginas 1–2). La captura de la página 2 distingue simple/detallada, legajos activos sí/no/todos y orden por legajo/alfabético. Se conservan como requisitos de ese módulo, no como filtros de asistencia.

La estructura aportada del 23/09/2026 presenta identificadores, jerarquía de cargo, denominación, cantidad, clase, estado/vacante y listas por legajo, continuadas entre páginas. No autoriza emparejar dos legajos porque el nombre coincida, inferir que un listado prueba un pago ni completar valores presupuestarios anuales faltantes. Estos documentos permanecen privados: sólo se versionan los criterios, no el padrón nominal del PDF.

La matriz de Noelia, el plan de cálculo/revisión de Hugo y la ampliación `PLAN_TIEMPO_AUSENTISMO_OPERACION_20260924.md` conservan el resto de pendientes de Mariano y superadministración. Esta entrega cierra la vista compuesta; no declara terminado el reemplazo integral de GRH.
