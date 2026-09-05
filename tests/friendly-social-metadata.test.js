import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFriendlySocialMetadata } from '../scripts/apply-friendly-social-metadata.mjs';

const publicTitle = 'MuniControl | Gestión municipal, más simple';
const publicImage = 'https://municipio-junin-friendly.vercel.app/assets/brand/municontrol-social-card-v1.png';
const page = (head = '', body = '') => `<!doctype html><html lang="es"><head>${head}</head><body>${body}</body></html>`;
const generatedMetas = (html) => Array.from(html.matchAll(/<meta (name|property)="([^"]+)" content="([^"]*)">/g), (match) => ({ key: match[2], value: match[3] }));
const values = (html) => Object.fromEntries(generatedMetas(html).map(({ key, value }) => [key, value]));

test('social metadata: genera una vista pública completa y constante', () => {
  const output = applyFriendlySocialMetadata(page('<title>Vista interna</title>'));
  const metadata = values(output);
  assert.equal(metadata['og:title'], publicTitle);
  assert.equal(metadata['twitter:title'], publicTitle);
  assert.equal(metadata['og:type'], 'website');
  assert.equal(metadata['og:site_name'], 'MuniControl');
  assert.equal(metadata['og:locale'], 'es_AR');
  assert.equal(metadata['og:url'], 'https://municipio-junin-friendly.vercel.app/');
  assert.equal(metadata['og:image'], publicImage);
  assert.equal(metadata['twitter:image'], publicImage);
  assert.equal(metadata['og:image:width'], '1200');
  assert.equal(metadata['og:image:height'], '630');
  assert.equal(metadata['twitter:card'], 'summary_large_image');
  assert.equal(metadata.description, metadata['og:description']);
  assert.equal(metadata.description, metadata['twitter:description']);
  assert.match(metadata.description, /contadores, administrativos y funcionarios/);
  assert.equal(metadata['og:image:alt'], metadata['twitter:image:alt']);
  assert.match(metadata['og:image:alt'], /Logo de MuniControl/);
  assert.match(metadata['og:image:alt'], /Gestión municipal, más simple/);
  assert.equal(generatedMetas(output).length, 16);
  assert.ok(output.indexOf('property="og:title"') < output.indexOf('</head>'));
});

test('social metadata: reemplaza duplicados con comillas y atributos en distinto orden', () => {
  const input = page(`
    <meta property="og:title" content="Viejo 1">
    <META content='Viejo 2' PROPERTY='og:title' />
    <meta content='Viejo 3' name='twitter:title'>
    <meta content="Viejo 4" property="twitter:card">
    <meta name='description' content='Descripción anterior'>
    <meta content="Descripción repetida" NAME="DESCRIPTION">
    <meta content='Quitar también' property='og:custom'>
    <meta name=twitter:site content=anterior>
    <meta property='og&#58;image' content='https://old.invalid/x.png'>
  `);
  const output = applyFriendlySocialMetadata(input);
  const metadata = generatedMetas(output);
  assert.equal(metadata.length, 16);
  assert.equal(new Set(metadata.map(({ key }) => key)).size, metadata.length);
  assert.doesNotMatch(output, /Viejo|anterior|repetida|Quitar|old\.invalid|og:custom|twitter:site/);
});

test('social metadata: la transformación es idempotente incluso con CRLF y etiquetas en una línea', () => {
  for (const input of [
    page(),
    page('<meta name="description" content="Vieja"><meta property="og:title" content="Viejo">'),
    page('\r\n  <meta name="description" content="Vieja">\r\n  '),
    '<!doctype html>\n<HTML><HEAD>\n<title>Título</title>\n</HEAD><BODY></BODY></HTML>',
  ]) {
    const once = applyFriendlySocialMetadata(input);
    assert.equal(applyFriendlySocialMetadata(once), once);
  }
});

test('social metadata: preserva exactamente formularios, scripts, robots, canonical y comentarios', () => {
  const script = `<script>const example = '<meta property="og:title" content="literal">'; const close = '</head>'; const form = '<form action="/api/internal-identity">';</script>`;
  const style = `<style>.example::after { content: '<meta name="description" content="literal">'; }</style>`;
  const robots = `<meta content='noindex, nofollow' name='robots'>`;
  const canonical = `<link href="https://example.invalid/privada" rel="canonical">`;
  const comment = `<!-- <head><meta name="description" content="comentario"></head> -->`;
  const template = `<template><meta property="og:title" content="plantilla"><template><meta name="twitter:card" content="plantilla anidada"></template></template>`;
  const form = `<form method="post" action="/api/internal-identity"><input name="email" value="qa@example.invalid"><button>Ingresar</button></form>`;
  const input = `${comment}${page(`${robots}${canonical}${script}${style}${template}`, `${form}<meta property="og:title" content="fuera del head">`)}`;
  const output = applyFriendlySocialMetadata(input);
  for (const original of [script, style, robots, canonical, comment, template, form]) assert.ok(output.includes(original), original);
  assert.equal(output.slice(output.indexOf('<body>')), input.slice(input.indexOf('<body>')));
});

test('social metadata: no deriva nombres, legajos, municipios ni secretos del documento', () => {
  const personal = 'Persona QA Inventada 445566 Municipio QA';
  const metadata = values(applyFriendlySocialMetadata(page(
    `<title>${personal}</title><meta property="og:description" content="${personal}"><meta name="twitter:image" content="https://private.invalid/image?token=fake-secret">`,
    `<p>${personal}</p>`,
  )));
  const serialized = JSON.stringify(metadata);
  assert.doesNotMatch(serialized, /Persona QA|445566|Municipio QA|fake-secret|private\.invalid/);
  for (const key of ['og:url', 'og:image', 'twitter:image']) {
    const url = new URL(metadata[key]);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(url.hostname, 'municipio-junin-friendly.vercel.app');
  }
});

test('social metadata: respeta mayor que en atributos y no altera el título del documento', () => {
  const title = '<title>Gestión &amp; control &lt;interno&gt;</title>';
  const output = applyFriendlySocialMetadata(page(`<meta content='Viejo > atributo' property='og:title'>${title}`));
  assert.ok(output.includes(title));
  assert.doesNotMatch(output, /Viejo > atributo/);
  assert.equal(values(output)['og:title'], publicTitle);
});

test('social metadata: rechaza entradas no textuales o sin head completo', () => {
  for (const input of [null, undefined, 42, {}]) assert.throws(() => applyFriendlySocialMetadata(input), TypeError);
  for (const input of ['', '<body>Sin cabecera</body>', '<head><meta name="description" content="sin cierre">']) {
    assert.throws(() => applyFriendlySocialMetadata(input), /<head> y <\/head>/);
  }
});
