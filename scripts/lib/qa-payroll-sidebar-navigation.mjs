// QA interaction with the real payroll sidebar only. No product, SQL, HTTP or browser launch on import.
import assert from 'node:assert/strict';
export async function openQaPayrollSidebarTask(owner,{profile,task}={}){
 assert.equal(profile,'payroll-sidebar','QA_PAYROLL_NAV_EXPLICIT_PROFILE_REQUIRED');assert.match(task??'',/^[a-z][a-z0-9-]{0,63}$/,'QA_PAYROLL_NAV_TASK_REQUIRED');
 const menu=owner.locator('[data-liquidaciones-menu]'),target=menu.locator('[data-task="'+task+'"]');
 await menu.waitFor({state:'attached'});await target.waitFor({state:'attached'});assert.equal(await menu.count(),1,'one original payroll sidebar');assert.equal(await target.count(),1,'one original payroll task');assert.equal(await target.getAttribute('role'),'tab');
 const toggle=owner.locator('.mc-work-toggle');if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 if(!(await menu.evaluate(node=>node.open)))await menu.locator(':scope > summary').click();
 const section=target.locator('xpath=ancestor::details[contains(@class,"task-section")]');if(await section.count()&&!(await section.evaluate(node=>node.open)))await section.locator(':scope > summary').click();
 await target.click();await owner.waitForFunction(id=>location.hash==='#'+id&&document.querySelector('#payrollTaskWorkspace')?.dataset.activeTask===id,task);
 assert.equal(await target.getAttribute('aria-selected'),'true');assert.equal(await target.getAttribute('aria-controls'),'task-'+task);assert.equal(await target.getAttribute('tabindex'),'0');
 const panel=owner.locator('#task-'+task);assert.equal(await panel.getAttribute('role'),'tabpanel');assert.equal(await panel.getAttribute('aria-labelledby'),await target.getAttribute('id'));assert.equal(await panel.isVisible(),true,'the selected original panel is visible');return true;
}
