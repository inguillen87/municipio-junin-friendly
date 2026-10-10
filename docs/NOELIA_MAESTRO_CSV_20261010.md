# Maestro salarial propio: carga completa desde CSV

El módulo 6 permite preparar conceptos y escalas en un archivo, compararlos con el borrador completo y enviarlos por el circuito existente de revisión independiente. Elegir un CSV no guarda una propuesta ni calcula haberes.

En Nómina → Parámetros → Maestro salarial propio:

1. Consultar el maestro y preparar una nueva versión, con una cuenta habilitada y su vínculo municipal verificado.
2. Abrir **Cargar conceptos y escalas desde CSV**. Descargar la plantilla para el primer maestro o el borrador completo para actualizarlo.
3. Completar y guardar en UTF-8, con punto y coma. Elegir el archivo, revisar todos los cambios y confirmar su incorporación al borrador.
4. Revisar la versión completa, indicar su fundamento y enviarla. Otra persona habilitada debe revisar y aprobar la propuesta.

La búsqueda y la página no recortan el archivo ni la comparación. La carga conserva cada definición del borrador: no borra antecedentes, no divide archivos y no supone equivalencias entre convenios o clases. Un fallo deja el borrador anterior disponible. El editor se descarga sólo al abrirlo; si falla esa descarga se puede reintentar sin perder el borrador.

| Columna | Contenido explícito |
| --- | --- |
| tipo | concepto o escala |
| convenio, clase, codigo | Códigos del catálogo consultado; clase vacía para conceptos |
| descripcion | Descripción de la definición |
| naturaleza | remunerativo, no_remunerativo, retencion, contribucion_patronal o auxiliar; vacía para escalas |
| unidad | pesos, horas, minutos, porcentaje, unidades o coeficiente |
| decimales | Entero de 0 a 8; no se deduce del valor |
| valor | Cadena decimal con punto, sin miles ni exponente; vacío es no informado, cero es explícito |
| desde, hasta | Meses AAAA-MM; hasta puede quedar vacío |
| respaldo | Documento que respalda la definición |
| dependencias | Claves de otras definiciones, separadas por `\|`, ordenadas y sin repetir |
| activo | si o no; desactivar conserva el antecedente |

Las descargas agregan un apóstrofo de texto a cada celda no vacía para conservar códigos y decimales y evitar fórmulas de planilla. La carga retira uno; dos conservan un apóstrofo literal. No se admiten columnas nominales, expresiones de cálculo ni valores de escala ausentes. El convenio y la clase deben existir de forma única en la consulta vigente.

Se admiten hasta 1.000 definiciones y 2 MiB por archivo. Si se supera un límite se rechaza el archivo completo. La comparación se retira al cambiar el borrador, los encuadres, el acceso o la tarea, o al ocultar/cerrar la página. Un envío pendiente conserva su cuerpo y clave originales; no admite otra carga hasta resolverlo.

Esta herramienta prepara definiciones declaradas. La aprobación del maestro, las reglas homologadas, el padrón propio adoptado y la aceptación del circuito de liquidación son requisitos separados. No modifica fórmulas de GRH ni reemplaza su evidencia por valores supuestos.
