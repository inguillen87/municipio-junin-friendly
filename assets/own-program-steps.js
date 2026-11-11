// Pasos de «Preparar el programa completo»: el mismo formulario, un tramo por vez, para no recorrer una página larga.
// Sólo presentación: oculta con una clase propia (nunca con `hidden`, que es del panel), no cambia campos ni valores,
// y el panel sigue leyendo cada control por su atributo. Si la plantilla cambia y falta una marca, no se monta nada.
const has = (el, key) => Boolean(el.querySelector?.('[data-program-' + key + ']'));
export const PROGRAM_STEPS = [
 {id: 'archivo', label: 'Archivo preparado', hint: 'Cargar el archivo completo', starts: el => el.matches('section')},
 {id: 'fuentes', label: 'Datos que usa', hint: 'Fuentes aprobadas y decimales', starts: el => has(el, 'namespaces')},
 {id: 'reglas', label: 'Reglas', hint: 'La fórmula de cada concepto', starts: el => el.matches('[data-program-scale-helper]'), count: 'rule-select', noun: ['regla', 'reglas']},
 {id: 'entradas', label: 'Entradas', hint: 'De dónde sale cada valor', starts: el => has(el, 'binding-select'), count: 'binding-select', noun: ['entrada', 'entradas']},
 {id: 'enviar', label: 'Revisar y enviar', hint: 'Fundamento y revisión completa', starts: el => has(el, 'reason')},
];
export const ALL_STEPS = 'todo';

// Reparte los bloques del formulario en pasos según el orden de la plantilla: cada marca abre su paso y los bloques
// siguientes lo heredan. Lo anterior a la primera marca (título e introducción) queda siempre a la vista.
// Devuelve null si falta una marca o si aparecen fuera de orden.
export function planProgramSteps(children) {
 const plan = []; let at = -1;
 for (const el of children) {
  if (typeof el?.matches !== 'function') return null;
  const next = PROGRAM_STEPS[at + 1];
  if (next && next.starts(el)) at++;
  plan.push(at < 0 ? null : PROGRAM_STEPS[at].id);
 }
 return at === PROGRAM_STEPS.length - 1 ? plan : null;
}

const store = key => ({get() { try { return localStorage.getItem(key); } catch { return null; } }, set(v) { try { localStorage.setItem(key, v); } catch { /* sin almacenamiento: vale para esta visita */ } }});

export function mountProgramSteps(fields, {storageKey = 'mc.nomina.reglas.paso'} = {}) {
 const kids = fields?.children ? [...fields.children] : [], plan = planProgramSteps(kids);
 if (!plan || typeof fields.before !== 'function') return null;
 const doc = fields.ownerDocument, memory = store(storageKey), make = (tag, cls, text) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
 kids.forEach((el, i) => { if (plan[i]) el.dataset.programStep = plan[i]; });
 // «Agregar entrada» va con las entradas: se mueve el mismo botón (conserva su acción) a una fila propia.
 const addBinding = fields.querySelector('[data-program-add-binding]');
 if (addBinding?.parentElement?.parentElement === fields) { const row = make('div', 'own-program-actions'); row.dataset.programStep = 'entradas'; row.append(addBinding); kids[plan.indexOf('entradas')].before(row); }
 const blocks = () => fields.querySelectorAll(':scope > [data-program-step]');

 const nav = make('nav', 'own-program-steps'); nav.setAttribute('aria-label', 'Pasos para preparar las reglas'); nav.dataset.programSteps = '';
 const buttons = PROGRAM_STEPS.map(step => {
  const b = make('button'); b.type = 'button'; b.dataset.programStepGo = step.id;
  b.append(make('strong', '', step.label), make('small', '', step.hint));
  b.addEventListener('click', () => show(step.id, true)); nav.append(b); return b;
 });
 const all = make('button', 'own-program-steps-all', 'Ver todo junto'); all.type = 'button'; all.dataset.programStepGo = ALL_STEPS; all.setAttribute('aria-pressed', 'false');
 all.addEventListener('click', () => show(current === ALL_STEPS ? last : ALL_STEPS, true)); nav.append(all);
 const foot = make('nav', 'own-program-steps-foot'); foot.setAttribute('aria-label', 'Paso anterior y siguiente');
 const prev = make('button'), next = make('button'); prev.type = next.type = 'button'; prev.dataset.programStepPrev = ''; next.dataset.programStepNext = ''; foot.append(prev, next);
 const move = by => { const to = PROGRAM_STEPS[PROGRAM_STEPS.findIndex(s => s.id === current) + by]; if (!to) return; show(to.id, true); if (nav.getBoundingClientRect().top < 0) nav.scrollIntoView({block: 'start'}); };
 prev.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));

 let current = null, last = PROGRAM_STEPS[0].id;
 function show(id, remember) {
  current = id === ALL_STEPS || PROGRAM_STEPS.some(s => s.id === id) ? id : PROGRAM_STEPS[0].id; if (current !== ALL_STEPS) last = current;
  for (const el of blocks()) el.classList.toggle('own-program-step-off', current !== ALL_STEPS && el.dataset.programStep !== current);
  buttons.forEach((b, i) => { if (PROGRAM_STEPS[i].id === current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  all.setAttribute('aria-pressed', String(current === ALL_STEPS)); all.textContent = current === ALL_STEPS ? 'Ver por pasos' : 'Ver todo junto';
  const at = PROGRAM_STEPS.findIndex(s => s.id === current), before = PROGRAM_STEPS[at - 1], after = at < 0 ? null : PROGRAM_STEPS[at + 1];
  foot.hidden = current === ALL_STEPS; prev.hidden = !before; next.hidden = !after;
  if (before) prev.textContent = '‹ ' + before.label; if (after) next.textContent = 'Seguir: ' + after.label + ' ›';
  if (remember) memory.set(current);
 }
 // Cantidad de reglas y de entradas del borrador, tomada de los mismos selectores que arma el panel.
 const counted = PROGRAM_STEPS.map((step, i) => ({step, hint: buttons[i].querySelector('small'), select: step.count ? fields.querySelector('[data-program-' + step.count + ']') : null})).filter(c => c.select);
 const recount = () => { for (const c of counted) { const n = c.select.options.length; c.hint.textContent = n ? n + ' ' + c.step.noun[n === 1 ? 0 : 1] + ' en el borrador' : c.step.hint; } };
 if (typeof MutationObserver === 'function') { const watch = new MutationObserver(recount); for (const c of counted) watch.observe(c.select, {childList: true}); }

 fields.before(nav); fields.after(foot); recount(); show(memory.get(), false);
 return {show: id => show(id, true), current: () => current};
}
