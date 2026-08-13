export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(403).json({
    ok: false,
    code: 'FRIENDLY_PERSONAL_DATA_DISABLED',
    message: 'Datos personales disponibles sólo en Enterprise con acceso autorizado.'
  });
}
