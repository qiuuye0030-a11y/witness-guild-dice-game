async (page) => {
 await page.locator('#campImport').setInputFiles('D:/公会/互动式骰子文字游戏/10.08数值回调开发/骰子系统/fixtures/1008-rollback/double-ten-growth.json');
 await page.getByRole('button',{name:'快速自动事件',exact:true}).waitFor();
 const rates=await page.evaluate(()=>WitnessFullGame.get().growthRates());if(rates.version!==10081||rates.talent!==1.53||rates.weapon!==1.15||rates.xp!==351.9)throw Error('UI restored old rates');
 const body=await page.locator('#campBody').innerText();if(!body.includes('15%')||!body.includes('351.9'))throw Error('new growth summary missing');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/1008-rollback-growth-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');await page.screenshot({path:'output/playwright/1008-rollback-growth-mobile.png',fullPage:true});
}
