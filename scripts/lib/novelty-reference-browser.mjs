// Browser verification only: use real summaries; never remove hidden or alter permissions.
import assert from 'node:assert/strict';
export async function openNoveltyReferences(page){
 const root=page.locator('#noveltyReferenceWorkspace');await root.waitFor({state:'attached'});
 const summary=root.locator(':scope > summary');assert.equal(await summary.count(),1,'reference disclosure needs one explicit summary');
 // Novedades shows its blocks in tabs: reach the workspace the way a person does, through its real tab.
 await page.waitForLoadState('domcontentloaded');
 if(await root.evaluate(node=>node.classList.contains('mc-tab-off'))){const tab=page.locator('.mc-section-tabs [role=tab][data-tab="otras"]');assert.equal(await tab.count(),1,'reference workspace sits behind its own tab');await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');}
 // Only the selected tab's blocks show: the own-novelties shell must not stay visible under «Archivos, relojes y lotes anteriores».
 if(await page.locator('.mc-section-tabs').count())await page.waitForFunction(()=>{const own=document.getElementById('ownNativeBulkNovelties');return !own||own.classList.contains('mc-tab-off');});
 if(await root.getAttribute('open')===null)await summary.click();
 assert.notEqual(await root.getAttribute('open'),null,'reference disclosure must actually open');
}
export async function openNoveltyReferenceTool(page,id){
 await openNoveltyReferences(page);const host=page.locator('#'+id);await host.waitFor({state:'attached'});
 // A denied tool stays denied. Wait for its genuine access update, never skip.
 await page.waitForFunction(key=>{const node=document.getElementById(key);return node&&!node.hidden;},id);
 const disclosure=host.locator('xpath=ancestor-or-self::details[not(@id="noveltyReferenceWorkspace")][1]');
 assert.equal(await disclosure.count(),1,'monthly tool needs its own progressive disclosure');
 const summary=disclosure.locator(':scope > summary');assert.equal(await summary.count(),1,'monthly disclosure keeps its real summary after mounting');
 if(await disclosure.getAttribute('open')===null)await summary.click();
 assert.notEqual(await disclosure.getAttribute('open'),null,'monthly disclosure must actually open');
}
// «Novedades fijas» lives in its own tab, shown once the screen grants it: reach it through that real tab.
export async function openFixedNovelties(page){
 await page.waitForLoadState('domcontentloaded');
 const root=page.locator('#fixedNovelties'),tab=page.locator('.mc-section-tabs [role=tab][data-tab="fijas"]');
 await tab.waitFor();if(await tab.getAttribute('aria-selected')!=='true')await tab.click();
 await page.waitForFunction(()=>{const node=document.getElementById('fixedNovelties');return node&&!node.hidden&&!node.classList.contains('mc-tab-off');});
 if(await root.getAttribute('open')===null)await root.locator(':scope > summary').click();
 assert.notEqual(await root.getAttribute('open'),null,'fixed novelties must actually open');
}
