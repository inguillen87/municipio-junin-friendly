// Temporary diagnostic on synthetic browser data only; restore reviewed source.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const file = 'scripts/verify-leave-workspace-browser.mjs';
const source = fs.readFileSync(file, 'utf8');
let probe = source.replace('const checks = [], errors = [], forwarded = [];', 'let debugPage; const requests = [], failures = [], consoles = [];\nconst checks = [], errors = [], forwarded = [];');
probe = probe.replace("const page = await context.newPage(); page.setDefaultTimeout(15000);", "const page = await context.newPage(); debugPage = page; page.setDefaultTimeout(15000);\n  page.on('request', r => requests.push(new URL(r.url()).pathname));\n  page.on('requestfailed', r => failures.push({path:new URL(r.url()).pathname, error:r.failure()?.errorText}));\n  page.on('console', m => {if(m.type()==='error') consoles.push(m.text().slice(0,1000));});");
probe = probe.replace('} finally { await browser.close(); }', "} catch (error) {\n  console.log('SYNTHETIC_BROWSER_DIAGNOSTIC', JSON.stringify({ checks, errors, requests, failures, consoles, url: debugPage?.url(), state: debugPage ? await debugPage.evaluate(() => ({ ready:document.readyState, error:document.querySelector('#errorHost')?.textContent, mainHidden:document.querySelector('#mainView')?.hidden, root:document.querySelector('#leaveRulesRoot')?.outerHTML.slice(0,1200), scripts:[...document.scripts].map(x=>x.src).filter(Boolean) })).catch(e=>({error:e.message})) : null }));\n  throw error;\n} finally { await browser.close(); }");
try {
  fs.writeFileSync(file, probe);
  const run = spawnSync(process.execPath, [file], { stdio: 'inherit', timeout: 180000 });
  process.exitCode = run.status ?? 1;
} finally { fs.writeFileSync(file, source); }
