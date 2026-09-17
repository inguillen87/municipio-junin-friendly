# PM municipales, asistencia documental y actualización de fuentes

## Incremento implementado

Los nombres de los puntos de Junín se obtienen del inventario existente `P3-PUNTOS DE MARCACION.xlsx`, huella `2897feadc03e15c7246f126556d76de7231b9f651975cc15c0c889d9bb2470b9`. El mapa y la recepción usan el mismo catálogo. La respuesta del tablero detallado y los CSV también conservan código y nombre; no se cambian UUID, seriales, ubicación, credenciales ni marcaciones.

Correspondencias de los equipos locales: PM-02 Compras y Suministros; PM-03 Galpón Municipal; PM-05 Delegación La Colonia; PM-06 Polideportivo La Colonia. PM-10 Edificio Viejo conserva su instalación separada. Edificio Nuevo no está en las trece filas de P3: permanece **PM pendiente**, nunca PM-05 por el identificador 5 del software del proveedor ni un PM-14 inventado. La asociación nominal no certifica una ubicación física.

`name-junin-clock-points.mjs` modifica sólo etiquetas, exige hash previo para aplicar, guarda copia privada y verifica la escritura. Aplicación local confirmada, segundo recorrido sin cambios y vista regenerada; cinco relojes configurados y estado deseado running. Esto no acredita que esos cinco equipos tengan envío a Neon: el control local sigue indicando `cloudSenderConfigured:false`.

## Mariano: asistencia PDF dentro del registro

El formulario permite leer la capa de texto del PDF seleccionado, seleccionar página, revisar/corregir un fragmento e incorporarlo explícitamente como artículo. El original se conserva; el trabajador comprueba SHA-256 y límites. PDF sin texto no se inventa ni se procesa por OCR. No se envían documentos a IA externa, no se añaden proveedores ni dependencias.

El trabajador y su parser se ejecutan fuera del hilo de interfaz. Límite de 2 MiB, 30 páginas, 300.000 caracteres extraídos, 50.000 por página, 12.000 por fragmento y tiempo acotado. Rechaza acciones JavaScript, adjuntos y permisos de documento restringidos. Se termina al cancelar, cambiar la fuente o salir del formulario.

La incorporación al borrador exige revisión explícita. Esa casilla es una ayuda efímera: **no crea una certificación persistida ni una aprobación jurídica**. La revisión final muestra todos los artículos y la huella del nuevo PDF antes de Confirmar. El POST, historial, control de concurrencia y auditoría existentes permanecen iguales. No se declara vigencia, firma, derogación, expediente ni contrato operativo por esta entrega.

## Septiembre: fuente comprobada, todavía no activa

La comprobación del 17/09/2026 23:08:16 UTC volvió a leer completamente el gzip privado y los artefactos. El respaldo tiene 44.890.240 bytes comprimidos y 779.482.898 bytes SQL lógico. Corte declarado 10/09/2026 15:17:30, sin zona horaria indicada en la fuente. SHA SQL: `5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7`.

Se verificaron las salidas curadas y el núcleo: 624 corridas, 847 integrantes del snapshot, 495.237 movimientos, 216.411 hechos mensuales y 2.452 conciliaciones. El verificador nuevo es de sólo lectura de archivos: no abre una conexión de base de datos ni activa una fuente.

Neon consultado a las 23:45:32 UTC conserva GRH publicado del 6 de agosto, importación 3. Los recibos y reportes bancarios de otras fechas no prueban que el maestro o el núcleo salarial estén en septiembre. Un backup del 10 de septiembre tampoco representa datos posteriores al día 10.

## Capacidad y continuidad

La base operativa ocupa 493.903.872 B y el conjunto de bases 516.833.280 B. Frente al límite observado de 536.870.912 B y la reserva de 16.777.216 B, el margen adicional es 3.260.416 B. No se modificaron el plan ni las cuotas.

El análisis identificó 127.409 movimientos y 63.507 hechos mensuales anteriores al 01/09/2016, más seis hechos con períodos anómalos excluidos de esa selección. No se modificaron estos registros. El mes frontera se conserva completo.

El módulo puro `municipal-history-policy.mjs` programa la planificación de diez años de detalle, preservación de identidades y operaciones propias, archivo recuperable y conservación de antecedentes jurídicos. Admite comparativas de dos a seis períodos con fechas explícitas y la misma cantidad de días transcurridos. No suma personas únicas ni trata importes nominales como poder adquisitivo comparable. Esta lógica todavía no sustituye el panel productivo de dos gestiones.

Se encontró trabajo de septiembre no publicado en otra carpeta, con migraciones cuyos números 066 a 070 ya se utilizaron para otros módulos en producción. Esa carpeta y sus cambios se conservaron intactos. La integración requiere reconciliar esas migraciones y sus lectores con los legajos y documentos nativos actuales, medir el conjunto y activar una única revisión coherente. No se promovió una actualización parcial.

## Verificación local

3.601 pruebas de aplicación aprobadas, sin fallos ni omisiones; compilación aprobada. Navegador: flota 14 grupos, mapa 8, registro jurídico 17, comparación 8, preparte 8 y planilla 22. Las API municipales y la autenticación de estos recorridos son sintéticas; la extracción PDF, el parser y la interfaz son reales. No se generaron registros municipales de prueba.

La publicación y su verificación productiva se registran en las incidencias 40 y 41 cuando se confirmen. Esta documentación no declara liquidación autónoma, activación de septiembre ni reducción de espacio ya materializada.
