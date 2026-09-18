import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const html=fs.readFileSync('centro-acciones.html','utf8');
test('workflow disclosure preserves all four original operations without auto-opening',()=>{
 const match=html.match(/<details class="operator-guide" id="actionWorkflowGuide">([\s\S]*?)<\/details>/);
 assert.ok(match);assert.equal((match[1].match(/data-workflow-step=/g)||[]).length,4);
 for(const command of ['create','edit','submit','cancel'])assert.ok(match[1].includes('data-workflow-command="'+command+'"'));
 assert.equal((html.match(/id="actionWorkflowGuide"/g)||[]).length,1);assert.ok(match[1].includes('<summary>'));
});
test('direct queue link targets the existing keyboard-focusable heading',()=>{
 assert.ok(html.includes('href="#queueTitle">Ir a la bandeja</a>'));
 assert.ok(html.includes('<h2 id="queueTitle" tabindex="-1">Bandeja de trabajo</h2>'));
 assert.equal((html.match(/id="queueTitle"/g)||[]).length,1);
});
test('layout assets remain first-party and no unfinished queue controller is loaded',()=>{
 assert.ok(html.includes('href="assets/action-workspace-layout.css"'));
 assert.ok(fs.readFileSync('scripts/build-friendly.mjs','utf8').includes("'assets/action-workspace-layout.css'"));
 assert.doesNotMatch(html,/action-queue-workspace\.js|action-page-summary\.js|operatorPageSummary/);
 const css=fs.readFileSync('assets/action-workspace-layout.css','utf8');
 assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/@import|https?:\/\/|display\s*:\s*none/);
});
