// Informe de ausentismo en PDF: texto (Helvetica, WinAnsi) e imágenes JPEG de los gráficos, sin dependencias.
// El documento se arma con bloques simples (título, párrafo, indicadores, imagen, tabla) y se pagina solo.
// Los caracteres fuera de WinAnsi se reemplazan por "?" para no fallar con una etiqueta de origen inesperada.

const A4 = {w: 595.28, h: 841.89}, M = 42;
const WIN = {0x20ac: 128, 0x201a: 130, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2030: 137, 0x2039: 139, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x203a: 155, 0x2212: 45, 0x00a0: 32, 0x202f: 32};
export function winAnsi(value) {
 let out = '';
 for (const c of String(value ?? '').normalize('NFC')) { const n = c.codePointAt(0); const code = WIN[n] ?? (n >= 32 && n <= 126 || n >= 160 && n <= 255 ? n : 63); out += code.toString(16).padStart(2, '0'); }
 return '<' + out + '>';
}
const rgb = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); };
const num = v => (Math.round(v * 100) / 100).toString();

// Ancho aproximado de Helvetica (unidades de 1/1000 em) cuando no hay canvas para medir.
function fallbackWidth(text, size, bold) {
 let units = 0;
 for (const c of String(text)) units += /[il.,;:'|!]/.test(c) ? 260 : /[mwMW]/.test(c) ? 860 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? 680 : c === ' ' ? 278 : /[0-9]/.test(c) ? 556 : 520;
 return units / 1000 * size * (bold ? 1.06 : 1);
}

/**
 * createReportPdf({title, measure?}) → {heading, text, kpis, image, table, spacer, footer, bytes()}
 * measure(text, size, bold) → ancho en puntos (en el navegador se usa canvas con Arial, métricas equivalentes).
 */
export function createReportPdf({title = 'Informe', subtitle = '', footer = '', measure = fallbackWidth} = {}) {
 const pages = [], images = [];
 const issuedOn=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
 let ops = null, y = 0;
 const width = (t, s, b) => measure(t, s, b);
 function newPage() { ops = []; pages.push(ops); y = A4.h - M; header(); }
 function header() {
  fill('#0f766e'); ops.push(`0 ${num(A4.h - 6)} ${num(A4.w)} 6 re f`);
  write(title, M, A4.h - 26, 8.5, true, '#0f766e'); if (subtitle) write(subtitle, A4.w - M - width(subtitle, 8.5, false), A4.h - 26, 8.5, false, '#5d6f78');
  y = A4.h - 46;
 }
 function fill(hex) { ops.push(`${rgb(hex)} rg`); }
 function write(t, x, yy, size, bold, color = '#18252d') { ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(yy)} Td ${winAnsi(t)} Tj ET`); }
 function ensure(h) { if (!ops || y - h < M + 18) newPage(); }
 function wrap(t, size, bold, maxW) {
  const lines = [];
  for (const para of String(t ?? '').split('\n')) {
   let line = '';
   for (const full of para.split(/\s+/).filter(Boolean)) {
    let word = [...full];
    while (word.length && width(word.join(''), size, bold) > maxW) {
     if (line) { lines.push(line); line = ''; }
     let cut = 1;
     while (cut < word.length && width(word.slice(0, cut + 1).join(''), size, bold) <= maxW) cut++;
     if (width(word.slice(0, cut).join(''), size, bold) > maxW) throw Error('Una columna PDF es demasiado estrecha para su texto.');
     lines.push(word.slice(0, cut).join('')); word = word.slice(cut);
    }
    const tail = word.join(''), next = line ? line + ' ' + tail : tail;
    if (line && width(next, size, bold) > maxW) { lines.push(line); line = tail; }
    else line = next;
   }
   lines.push(line);
  }
  return lines;
 }
 const api = {
  heading(t, {size = 15, color = '#123247', space = 10} = {}) { ensure(size + space + 40); y -= space; write(t, M, y - size, size, true, color); y -= size + 8; return api; },
  text(t, {size = 9.5, color = '#344f5f', bold = false, gap = 4, indent = 0} = {}) {
   const lines = wrap(t, size, bold, A4.w - 2 * M - indent);
   for (const line of lines) { ensure(size * 1.35); write(line, M + indent, y - size, size, bold, color); y -= size * 1.38; }
   y -= gap; return api;
  },
  kpis(items) {
   const gap = 10, w = (A4.w - 2 * M - gap * (items.length - 1)) / items.length, h = 58; ensure(h + 8);
   items.forEach((k, i) => {
    const x = M + i * (w + gap);
    fill('#f3faf8'); ops.push(`${num(x)} ${num(y - h)} ${num(w)} ${num(h)} re f`); fill('#0f766e'); ops.push(`${num(x)} ${num(y - h)} 3 ${num(h)} re f`);
    write(String(k.label).toUpperCase(), x + 11, y - 16, 7.2, true, '#5d6f78');
    write(k.value, x + 11, y - 38, 18, true, '#123247');
    if (k.note) write(k.note, x + 11, y - 51, 7, false, '#5d6f78');
   });
   y -= h + 12; return api;
  },
  // jpeg: Uint8Array; px: tamaño en píxeles de la imagen.
  image(jpeg, {px, caption = '', maxHeight = 300} = {}) {
   if (!jpeg || !px?.w || !px?.h) return api;
   let w = A4.w - 2 * M, h = w * px.h / px.w; if (h > maxHeight) { h = maxHeight; w = h * px.w / px.h; }
   ensure(h + (caption ? 20 : 8)); const name = 'Im' + (images.length + 1); images.push({name, jpeg, px});
   ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(M + (A4.w - 2 * M - w) / 2)} ${num(y - h)} cm /${name} Do Q`); y -= h + 6;
   if (caption) api.text(caption, {size: 8, color: '#5d6f78'}); else y -= 4; return api;
  },
  table(columns, rows, {size = 8.2} = {}) {
   const total = A4.w - 2*M, weights = columns.map(c => c.weight || 1), sum = weights.reduce((a,b)=>a+b,0);
   const widths = weights.map(w=>w/sum*total), leading=size*1.35, pad=7;
   const fit=(v,w,bold)=>wrap(v,size,bold,w-10);
   const headingParts=columns.map((c,i)=>fit(c.label,widths[i],true));
   const headerHeight=Math.max(24,...headingParts.map(lines=>lines.length*leading+pad*2));
   const render=(parts,height,bold,color)=>{
    let x=M;columns.forEach((c,i)=>{
     parts[i].forEach((line,j)=>{const tx=c.align==='right'?x+widths[i]-5-width(line,size,bold):x+5;write(line,tx,y-pad-size-j*leading,size,bold,color);});
     x+=widths[i];
    });y-=height;
   };
   const head=()=>{ensure(headerHeight+12);fill('#123247');ops.push(`${num(M)} ${num(y-headerHeight)} ${num(total)} ${num(headerHeight)} re f`);render(headingParts,headerHeight,true,'#ffffff');};
   head();
   rows.forEach((r,index)=>{
    const parts=columns.map((c,i)=>fit(r[i],widths[i],false)),totalLines=Math.max(...parts.map(lines=>lines.length));
    const normalHeight=totalLines*leading+pad*2,freshHeight=A4.h-46-headerHeight-(M+18);
    if(normalHeight<=freshHeight&&y-normalHeight<M+18){newPage();head();}
    let offset=0;const totalRow=/^(?:total|totales|subtotal)(?:\\b|\\s|:)/i.test(String(r[0]??''));
    while(offset<totalLines){
     let capacity=Math.floor((y-(M+18)-pad*2)/leading);
     if(capacity<1){newPage();head();capacity=Math.floor((y-(M+18)-pad*2)/leading);}
     if(capacity<1)throw Error('No hay espacio en el PDF para una fila completa.');
     const count=Math.min(totalLines-offset,capacity),height=count*leading+pad*2;
     if(totalRow||index%2===1){fill(totalRow?'#e5f3ef':'#f4f7f8');ops.push(`${num(M)} ${num(y-height)} ${num(total)} ${num(height)} re f`);}
     render(parts.map(lines=>lines.slice(offset,offset+count)),height,totalRow,'#18252d');
     offset+=count;if(offset<totalLines){newPage();head();}
    }
   });
   y-=10;return api;
  },
  keep(h) { ensure(h); return api; },
  spacer(h = 10) { y -= h; return api; },
  pageBreak() { newPage(); return api; },
  bytes() {
   if (!pages.length) newPage();
   const enc = new TextEncoder(), parts = [], offsets = []; let length = 0;
   const push = chunk => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
   const objects = [];
   const obj = body => { objects.push(body); return objects.length; };
   const catalog = obj(null), pagesId = obj(null), f1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
   const imageIds = images.map(im => obj({stream: im.jpeg, dict: `/Type /XObject /Subtype /Image /Width ${im.px.w} /Height ${im.px.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`}));
   const xobjects = images.map((im, i) => `/${im.name} ${imageIds[i]} 0 R`).join(' ');
   const pageIds = pages.map((p, i) => {
    const footLines=wrap([footer,'Emitido '+issuedOn].filter(Boolean).join(' · '),7.2,false,A4.w-2*M-124);
    if(footLines.length>3)throw Error('El pie del PDF supera el espacio reservado.');
    const footerOps=footLines.map((line,j)=>`BT /F1 7.2 Tf ${rgb('#5d6f78')} rg ${M} ${22+j*10} Td ${winAnsi(line)} Tj ET`);
    const pageText=`Página ${i+1} de ${pages.length}`;
    footerOps.push(`BT /F1 7.5 Tf ${rgb('#5d6f78')} rg ${num(A4.w-M-width(pageText,7.5,false))} 22 Td ${winAnsi(pageText)} Tj ET`);
    const content = obj({stream: enc.encode([...p, ...footerOps].join('\n')), dict: ''});
    return obj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(A4.w)} ${num(A4.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >> /Contents ${content} 0 R >>`);
   });
   objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
   objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
   push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
   objects.forEach((body, i) => {
    offsets.push(length); push(`${i + 1} 0 obj\n`);
    if (typeof body === 'string') push(body + '\nendobj\n');
    else { push(`<< ${body.dict} /Length ${body.stream.length} >>\nstream\n`); push(body.stream); push('\nendstream\nendobj\n'); }
   });
   const xref = length;
   push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
   push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
   const out = new Uint8Array(length); let at = 0; for (const b of parts) { out.set(b, at); at += b.length; } return out;
  },
 };
 return api;
}

export function dataUrlBytes(url) {
 const base64 = String(url).split(',')[1] || ''; const bin = atob(base64); const out = new Uint8Array(bin.length);
 for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}
