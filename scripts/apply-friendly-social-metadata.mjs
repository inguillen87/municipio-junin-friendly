const PUBLIC_TITLE = 'MuniControl | Gestión municipal, más simple';
const PUBLIC_DESCRIPTION = 'MuniControl simplifica la gestión municipal y el trabajo de contadores, administrativos y funcionarios, con herramientas claras en una sola plataforma.';
const PUBLIC_URL = 'https://municipio-junin-friendly.vercel.app/';
const PUBLIC_IMAGE = `${PUBLIC_URL}assets/brand/municontrol-social-card-v1.png`;
const PUBLIC_IMAGE_ALT = 'Logo de MuniControl. Gestión municipal, más simple.';
const PUBLIC_METADATA = [
  ['name', 'description', PUBLIC_DESCRIPTION],
  ['property', 'og:title', PUBLIC_TITLE],
  ['property', 'og:description', PUBLIC_DESCRIPTION],
  ['property', 'og:type', 'website'],
  ['property', 'og:site_name', 'MuniControl'],
  ['property', 'og:locale', 'es_AR'],
  ['property', 'og:url', PUBLIC_URL],
  ['property', 'og:image', PUBLIC_IMAGE],
  ['property', 'og:image:width', '1200'],
  ['property', 'og:image:height', '630'],
  ['property', 'og:image:alt', PUBLIC_IMAGE_ALT],
  ['name', 'twitter:card', 'summary_large_image'],
  ['name', 'twitter:title', PUBLIC_TITLE],
  ['name', 'twitter:description', PUBLIC_DESCRIPTION],
  ['name', 'twitter:image', PUBLIC_IMAGE],
  ['name', 'twitter:image:alt', PUBLIC_IMAGE_ALT],
];

const escapeAttribute = (value) => value.replace(/[&"'<>]/g, (character) => ({
  '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;',
})[character]);

function decodeAttribute(value) {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|([a-z]+));/gi, (entity, numeric, named) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':' })[named.toLowerCase()] ?? entity;
  });
}

// Only ordinary HTML tags are inspected. Comments and raw-text elements retain
// their exact bytes, including strings which happen to look like metadata.
function* tags(html) {
  let cursor = 0;
  while ((cursor = html.indexOf('<', cursor)) !== -1) {
    const start = cursor;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      cursor = end === -1 ? html.length : end + 3;
      continue;
    }
    const beginning = html.slice(start).match(/^<(\/?)([a-z][\w:-]*)\b/i);
    if (!beginning) { cursor += 1; continue; }
    let end = start + beginning[0].length;
    let quote = '';
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === html.length) return;
    const name = beginning[2].toLowerCase();
    const closing = Boolean(beginning[1]);
    const attributes = html.slice(start + beginning[0].length, end);
    cursor = end + 1;
    yield { start, end: cursor, name, closing, attributes };
    if (!closing && /^(?:script|style|title|textarea|noscript)$/.test(name)) {
      const closingTag = new RegExp(`</${name}\\s*>`, 'gi');
      closingTag.lastIndex = cursor;
      const match = closingTag.exec(html);
      cursor = match ? match.index + match[0].length : html.length;
    }
  }
}

function replacesMetadata(attributes) {
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of attributes.matchAll(pattern)) {
    if (!/^(?:name|property)$/i.test(match[1])) continue;
    const value = decodeAttribute(match[2] ?? match[3] ?? match[4] ?? '').trim().toLowerCase();
    if (value === 'description' || value.startsWith('og:') || value.startsWith('twitter:')) return true;
  }
  return false;
}

function tagLineRange(html, tag) {
  const lineStart = html.lastIndexOf('\n', tag.start - 1) + 1;
  const newline = html.indexOf('\n', tag.end);
  const lineEnd = newline === -1 ? html.length : newline;
  if (!html.slice(lineStart, tag.start).trim() && !html.slice(tag.end, lineEnd).trim()) {
    return [lineStart, newline === -1 ? lineEnd : lineEnd + 1];
  }
  return [tag.start, tag.end];
}

function attributeValue(attributes, name) {
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of attributes.matchAll(pattern)) {
    if (match[1].toLowerCase() === name) return decodeAttribute(match[2] ?? match[3] ?? match[4] ?? '').trim().toLowerCase();
  }
  return '';
}

/** One consistent installable identity, including pages that never had icons. */
export function applyFriendlyPwaIdentity(html) {
  if (typeof html !== 'string') throw new TypeError('html debe ser texto.');
  let head = false;
  let templateDepth = 0;
  let headEnd = -1;
  const removals = [];
  for (const tag of tags(html)) {
    if (!head) {
      if (tag.name === 'head' && !tag.closing) head = true;
      continue;
    }
    if (tag.name === 'template') {
      templateDepth = Math.max(0, templateDepth + (tag.closing ? -1 : 1));
      continue;
    }
    if (templateDepth) continue;
    if (tag.name === 'head' && tag.closing) { headEnd = tag.start; break; }
    if (tag.closing) continue;
    const identityLink = tag.name === 'link' && attributeValue(tag.attributes, 'rel').split(/\s+/)
      .some(rel => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'manifest'].includes(rel));
    const identityMeta = tag.name === 'meta' && ['theme-color', 'application-name', 'apple-mobile-web-app-title']
      .includes(attributeValue(tag.attributes, 'name'));
    if (identityLink || identityMeta) removals.push(tagLineRange(html, tag));
  }
  if (headEnd === -1) throw new Error('El documento debe contener <head> y </head>.');
  let beforeHeadEnd = html.slice(0, headEnd);
  for (const [start, end] of removals.reverse()) beforeHeadEnd = beforeHeadEnd.slice(0, start) + beforeHeadEnd.slice(end);
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const identity = [
    '  <link rel="icon" href="/assets/pwa/icon.svg" type="image/svg+xml">',
    '  <link rel="apple-touch-icon" href="/assets/pwa/icon-180.png">',
    '  <link rel="manifest" href="/manifest.webmanifest">',
    '  <meta name="theme-color" content="#153a4b">',
    '  <meta name="application-name" content="MuniControl">',
    '  <meta name="apple-mobile-web-app-title" content="MuniControl">',
  ].join(newline);
  return `${beforeHeadEnd}${beforeHeadEnd.endsWith('\n') ? '' : newline}${identity}${newline}${html.slice(headEnd)}`;
}

/**
 * Adds one public, static social preview to a complete HTML document. It never
 * derives metadata from the page title, URLs, users, payroll or active tenant.
 * Form fields, scripts, robots and canonical links remain untouched.
 */
export function applyFriendlySocialMetadata(html) {
  if (typeof html !== 'string') throw new TypeError('html debe ser texto.');
  let head = false;
  let templateDepth = 0;
  let headEnd = -1;
  const removals = [];
  for (const tag of tags(html)) {
    if (!head) {
      if (tag.name === 'head' && !tag.closing) head = true;
      continue;
    }
    if (tag.name === 'template') {
      templateDepth = Math.max(0, templateDepth + (tag.closing ? -1 : 1));
      continue;
    }
    if (templateDepth) continue;
    if (tag.name === 'head' && tag.closing) { headEnd = tag.start; break; }
    if (tag.name === 'meta' && !tag.closing && replacesMetadata(tag.attributes)) {
      removals.push(tagLineRange(html, tag));
    }
  }
  if (headEnd === -1) throw new Error('El documento debe contener <head> y </head>.');
  let beforeHeadEnd = html.slice(0, headEnd);
  for (const [start, end] of removals.reverse()) {
    beforeHeadEnd = beforeHeadEnd.slice(0, start) + beforeHeadEnd.slice(end);
  }
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const metadata = PUBLIC_METADATA.map(([attribute, key, value]) =>
    `  <meta ${attribute}="${key}" content="${escapeAttribute(value)}">`).join(newline);
  const separator = beforeHeadEnd.endsWith('\n') ? '' : newline;
  return `${beforeHeadEnd}${separator}${metadata}${newline}${html.slice(headEnd)}`;
}
