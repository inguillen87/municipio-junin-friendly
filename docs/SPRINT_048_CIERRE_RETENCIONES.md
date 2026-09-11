# Sprint 048 · detalle de haberes y retenciones

## Integración
Detalle de conceptos y descuentos con PDF/Excel desde el legajo, preservando el padrón activo por defecto y el histórico explícito. Los importes y descripciones provienen del respaldo; nunca se corrigen para cerrar una suma. Contribuciones patronales separadas de retenciones.

## Traslado de fuente privado sin claves
La transferencia final usa archivos gzip alojados de manera privada y leídos por HTTPS con enlace temporal. No transfiere claves de descifrado. La opción OpenPGP queda como mecanismo de compatibilidad, pero no es el transporte usado por esta carga. El registro de claves fue bloqueado por el servicio y no se reintenta por otro canal.

El operador preautoriza el origen exacto, hash del archivo y JSON, bytes y cantidad de registros en Neon. La API recibe solamente un identificador de trabajo, no URLs ni secretos del solicitante. Obtiene el enlace privado de la base y valida HTTPS, host y ruta exactos, sin redirecciones; limita descarga y descompresión, verifica ambos hashes e incorpora la fuente en una transacción. Las claves, archivos y enlaces temporales no forman parte del código ni los logs de CI. No se publica la fuente en un CDN abierto.

Una respuesta de reenvío devuelve el comprobante anterior, sin duplicar datos. Los permisos de lectura de conceptos se verifican por usuario y municipio. El traslado inicial no programa tareas futuras ni reemplaza el colector de relojes.

## Límites
Los documentos son informativos y no se firman como Noelia. No se cambian sueldos, liquidaciones originales, aprobaciones o GRH. El cierre requiere verificar datos reales, conteos/hash y consultas, además de CI. Una prueba sin sesión no verifica el ingreso de un funcionario.
