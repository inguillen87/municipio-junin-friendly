# Módulo 6: copia conjunta de fórmulas propias

El módulo 6 pide actualizar varios conceptos y convenios en conjunto. La copia propia anterior permitía una fórmula por vez. Esta entrega permite elegir varias fórmulas y preparar todos los destinos en una sola propuesta completa, con el programa propio y su revisión independiente existentes.

## Recorrido del operador

1. Abrir **Liquidaciones → Reglas de cálculo → Preparar reglas**.
2. Expandir **Copiar fórmulas a varios convenios**. Activar **Seleccionar varias fórmulas para una actualización conjunta**.
3. Elegir las fórmulas de origen. La búsqueda y las páginas sólo cambian la vista. **Seleccionar todas las coincidencias** incluye todas las páginas; **Limpiar selección** retira todo el conjunto elegido.
4. Elegir convenios de destino, vigencia, tratamiento del historial y respaldo explícito. Un convenio elegido como origen no puede ser destino. Si aparece ese conflicto, la selección se conserva para corregirla.
5. **Revisar copia completa** muestra la cantidad de fórmulas por destinos y la comparación de todas las reglas y fuentes. Confirmar y **Aplicar al borrador completo**.
6. Revisar el programa y su fundamento, confirmar y **Registrar propuesta**. Otra persona habilitada debe revisar y aprobar la propuesta completa. La copia por sí sola no registra, aprueba ni calcula haberes.

## Integridad del conjunto

Se conservan expresión, naturaleza, unidades, tipos y redondeo exactos. No se reinterpretan fórmulas GRH ni se inventan porcentajes. Las dependencias seleccionadas explícitamente se validan juntas; las no seleccionadas deben existir y ser compatibles en destino. Una dependencia faltante no se copia implícitamente.

Las entradas compartidas se reutilizan sólo si son idénticas. No se sobrescriben fuentes distintas. El cierre de una vigencia conserva la versión anterior hasta el mes previo y agrega una versión nueva. Una superposición, fuente incompatible o exceso de la capacidad existente rechaza todo el conjunto; no omite fórmulas ni convenios.

Cambiar una selección o declaración invalida la revisión. Ocultar la página, cambiar de sesión o retirar permisos elimina las vistas privadas según los controles existentes. Un guardado pendiente conserva su cuerpo y clave exactos incluso si se fuerza una edición posterior del DOM. No hay almacenamiento de programas en localStorage/sessionStorage ni nuevas APIs.

## Pruebas y alcance

Las regresiones incluyen selección de 27 fórmulas en dos páginas con filtro aplicado, copia a 61 destinos, dependencias conjuntas, conflictos, límite global, cierre de historial, revocación, pantalla oculta y reintento exacto. El navegador verifica 1440, 390 y 320 píxeles y controles accesibles. PostgreSQL 17 y 18 comprueban una propuesta de 18 reglas y seis entradas, revisión independiente, conservación durable y cálculo sintético con el programa aprobado. El caso de un destino incompatible rechaza todo el conjunto.

No cambia SQL, permisos, evaluación ni contratos de la API. No necesita una instalación productiva. La autenticación municipal de las pruebas es sintética; no acredita aceptación de Noelia. Los códigos y valores de fixtures son inventados exclusivamente para QA. Esta entrega no homologa los códigos municipales reales 88/95, no adopta el respaldo sellado ni certifica toda la nómina real.

La evidencia local de pruebas, publicación y pendientes se registra en `verification/CODEX_PROGRAM_MULTI_COPY_RESULT_20261008.md`; los documentos de traspaso y las fuentes privadas no se publican.
