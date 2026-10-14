// Local synthetic QA only. The CI project runtime patches the repository
// launcher before these modules load; leave its executable selection intact.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {chromium} from 'playwright';
export async function launchOwnSyntheticBrowser(){
 let driver=chromium,driverName='repository Playwright',options={headless:true};
 if(process.platform==='win32'&&!fs.existsSync(driver.executablePath())){
  const bundled=createRequire('C:/Users/guill/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
  driver=bundled('playwright').chromium;driverName='Codex bundled Playwright '+bundled('playwright/package.json').version;
  assert.ok(fs.existsSync(driver.executablePath()),'QA browser is not installed');options.executablePath=driver.executablePath();
 }
 return{browser:await driver.launch(options),driverName};
}
