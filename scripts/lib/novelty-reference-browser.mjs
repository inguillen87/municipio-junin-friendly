// Browser verification only: use real summaries; never remove hidden or alter permissions.
import assert from 'node:assert/strict';
export async function openNoveltyReferences(page){
 const root=page.locator('#noveltyReferenceWorkspace');await root.waitFor({state:'attached'});
 const summary=root.locator(':scope > summary');assert.equal(await summary.count(),1,'reference disclosure needs one explicit summary');
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
