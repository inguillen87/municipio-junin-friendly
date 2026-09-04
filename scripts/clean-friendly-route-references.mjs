const HTML_ROUTE_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.html$/;

function normalizedHtmlRouteFiles(htmlRouteFiles) {
  if (!Array.isArray(htmlRouteFiles)) {
    throw new TypeError('htmlRouteFiles debe ser un arreglo.');
  }

  return Array.from(new Set(htmlRouteFiles.map((file) => String(file || '').trim())))
    .filter((file) => HTML_ROUTE_FILE_PATTERN.test(file))
    .sort((left, right) => right.length - left.length);
}

/**
 * Reescribe sólo nombres exactos de pantallas HTML conocidas. Los nombres de
 * archivos físicos se conservan; Vercel los publica mediante cleanUrls.
 * Query strings, hashes y valores `next` quedan intactos porque la sustitución
 * se limita al sufijo `.html` de cada ruta declarada.
 */
export function cleanFriendlyRouteReferences(source, htmlRouteFiles) {
  if (typeof source !== 'string') {
    throw new TypeError('source debe ser texto.');
  }

  return normalizedHtmlRouteFiles(htmlRouteFiles).reduce((result, htmlFile) => {
    const cleanRoute = htmlFile.slice(0, -'.html'.length);
    return result.replaceAll(htmlFile, cleanRoute);
  }, source);
}
