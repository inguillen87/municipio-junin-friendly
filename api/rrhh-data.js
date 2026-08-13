// Simple passthrough - reads JSON from static files
// Since Vercel has issues with serverless reading local files,
// the frontend should fetch directly from /rrhh-data/*.json
// This API exists as a fallback proxy

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  const { type } = req.query || {};
  const fileMap = {
    'analytics': 'analytics.json',
    'sectores': 'sectores.json', 
    'categorias': 'categorias.json',
    'gremios': 'gremios.json',
    'cargos': 'cargos.json',
    'ausencias': 'ausencias.json',
    'licencias': 'licencias.json',
    'motibajas': 'motibajas.json',
  };
  
  const file = fileMap[type] || 'empleados_activos.json';
  
  // Redirect to static JSON file
  res.setHeader('Location', `/rrhh-data/${file}`);
  res.setHeader('Cache-Control', 's-maxage=300');
  return res.status(302).end();
};
