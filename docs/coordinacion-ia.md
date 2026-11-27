# Coordinación entre asistentes (Claude, Codex, Antigravity)

Rama de integración: `claude/integracion-20261117`. Producción la publica una sola persona (Marcelo, o Claude con su
pedido expreso) y sólo desde esta rama.

## Reglas para los tres

1. Cada tarea va en **su propia rama**, creada desde la rama de integración, y entra por **pull request** hacia ella.
2. **El laboratorio decide**: no se une nada con una prueba de GitHub Actions en rojo. Si la prueba quedó vieja, se
   corrige la prueba en el mismo pedido y se explica por qué.
3. **Otro asistente revisa** todo cambio de cálculo, cierre, permisos, migraciones de base o pruebas. Textos y estilos
   chicos alcanzan con el laboratorio.
4. **Nadie publica en Vercel ni toca la base de producción.** Las migraciones se entregan como archivo; las instala
   Marcelo.
5. **Repositorio público**: ningún dato de personas, legajos reales, credenciales ni cadenas de conexión.
6. Las pantallas se prueban en escritorio (1440), celular (390) y celular angosto (320). Los controles miden al menos
   44 px de alto, nada desborda el ancho y no se anima el tamaño de las cosas (sólo aparición y desplazamiento).
7. No se guarda nada en el navegador salvo preferencias de interfaz ya admitidas por las pruebas.
8. Un pedido = un tema. Mensajes de commit en castellano, diciendo qué cambia para quien usa la plataforma.

## Reparto actual

### Claude — liquidaciones
- Cálculo por tandas: un convenio grande se parte solo en corridas de hasta 100 personas (el tope de 32 MB por
  corrida alcanza para unas 150), con avance visible, repetición de una tanda y confirmación de todo el convenio.
- «No liquidar»: personas que quedan fuera del cálculo del mes, recordadas y con aprobación.
- Prueba de laboratorio con varios usuarios a la vez sobre Liquidaciones; que un choque espere y reintente en vez de
  responder «No se confirmó la operación».
- Reglas 206 y 640 del convenio 6 desde diciembre y renovación de las políticas que vencen en noviembre.

### Codex — laboratorio y revisión
- **Velocidad del laboratorio, segunda parte.** Hoy cada pull request dispara ~75 flujos. Revisar los filtros `paths`
  y los disparadores `pull_request` para que cada flujo corra sólo cuando cambia algo que lo afecta, sin perder
  cobertura. Medir antes y después (minutos de la vuelta completa).
- **Prueba que falta:** la migración 249 (cancelar un lote de novedades aprobado mientras ninguna liquidación lo haya
  confirmado) está en producción pero `scripts/verify-own-payroll-novelties-sql.mjs` no la instala ni ejercita la regla
  nueva. Agregarla al laboratorio.
- **Revisar** los commits del 26 y 27/11 de esta rama: `assets/reason-defaults.js` (motivos visibles; anular, cancelar
  y rechazar sin texto propuesto), `assets/approvals-quick.js` y `assets/month-prepare.js` (sin lectura automática),
  `assets/workspace-quickbar.{js,css}` (espacio reservado en celular) y el cambio de `npm run build:lab`.

### Antigravity — experiencia de uso
- Recorrer en navegador, en 1440, 390 y 320, las pantallas que usa Liquidación y Tesorería: Novedades, Novedades
  fijas, Calcular, Resumen de liquidaciones, Recibos, Personas. Entregar capturas y una lista priorizada de problemas
  reales (texto confuso, pasos de más, cosas tapadas o cortadas, contraste, orden de lectura).
- Proponer mejoras **sólo de estilo y texto** (CSS y cadenas), un pedido por pantalla, respetando las reglas 6 y 7.
  Nada de reescrituras ni librerías nuevas.

## Cómo se pide una revisión
En el pull request, un comentario que diga qué mirar y qué no. Quien revisa responde con: qué probó, qué encontró y si
aprueba. Las observaciones se contestan en el mismo pedido.
