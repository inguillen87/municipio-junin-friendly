# Observaciones de Noelia: alta propia y certificados escolares

Este corte implementa observaciones de los cuatro audios y seis capturas del 21 de septiembre. Los originales y transcripciones permanecen en almacenamiento privado; este documento no incorpora información nominal.

## Alta de legajos

El catálogo que contiene Administrativo/Obrero se presenta como **Repartición**, y el catálogo de destinos y dependencias como **Sector**. Cambian los rótulos del alta, la revisión y la ficha propia; se conservan los identificadores guardados. Los selectores ordenan los códigos numéricamente sin modificar el catálogo.

La nueva alta pide **Jurisdicción 42 o 55**, sin selección predeterminada. La revisión, el comprobante y la ficha muestran el dato declarado. La migración095 lo conserva en el contrato propio, manteniendo recuperables los intentos anteriores de13campos. Un dato ausente permanece desconocido; no se deduce del convenio ni de la repartición. Ver `NOELIA_NATIVE_JURISDICTION_095.md`.

## Fechas escolares del respaldo original

La migración094 permite recuperar `PRES_14` y `VENC_14` desde el mismo respaldo GRH que originó los familiares existentes. La importación técnica exige coincidencia del archivo, origen publicado y cada identidad completa; no utiliza coincidencias aproximadas ni reemplaza la fuente original.

La consulta `family-schooling.v4` agrega procedencia y fechas históricas. Las operaciones de registro, historial, recuperación y documento conservan sus contratos anteriores. Si existe un certificado manual, sus dos fechas tienen prioridad, incluso cuando una esté vacía. Las fechas GRH no crean certificados manuales, adjuntos ni aprobaciones de escolaridad.

El informe y su Excel muestran el origen de las fechas y permiten consultar el corte de la fuente. La fecha declarada en el respaldo y el corte canónico publicado se conservan por separado: esta recuperación no corrige silenciosamente la interpretación horaria histórica.

## Archivos TXT

Se inspeccionó, mediante consultas de configuración, el formato RETRO de GRH Web: legajo desde posición0 con longitud8; importe desde posición8 con longitud10, decimal con punto. Esto todavía no determina codificación, relleno, signo ni contenido adicional aceptado. Falta verificar una muestra o el algoritmo antes de incorporar ese perfil; no se reemplaza el importador CSV cambiándole la extensión.

La referencia oral a un código de actividad docente no quedó inequívoca. No se convirtió esa transcripción en una regla fiscal.

## Corrección de acceso detectada durante la instalación de relojes

El alta de sedes comprobaba MFA en el objeto de la cookie firmada, que contiene coordenadas de sesión y no esa autoridad. Ahora consulta la sesión vigente que devuelve la base, y verifica identidad, versión, vencimiento y nivel de autenticación. Conserva la exigencia de propietario de plataforma, capacidad de administración y contexto municipal certificado. No se modifican cuentas ni se crean sesiones artificiales.

## Gates de publicación

Las verificaciones incluyen contratos API, compatibilidad histórica, recuperación del mismo intento, exportación, móvil y escritorio; SQL real en PostgreSQL17 y18 para094/095, incluida la regresión093/092. Los casos sintéticos se ejecutan en esquemas descartables con rollback. La instalación remota requiere CI aprobado del commit exacto; la publicación se verifica después del despliegue.

Este corte no incorpora un motor de liquidación, una clasificación F931 ni una declaración de automatización municipal independiente de la PC. El siguiente avance de nómina sigue siendo integrar contratos propios en novedades mensuales y completar reglas de cálculo y salidas homologadas.
