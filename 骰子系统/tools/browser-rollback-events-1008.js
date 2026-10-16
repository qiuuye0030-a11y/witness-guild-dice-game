async (page) => {
 for(let n=0;n<8&&await page.locator('#campPromotion').count();n++)await page.locator('#campPromotion').getByRole('button',{name:'记下这次突破',exact:true}).click();
 await page.locator('#campImport').setInputFiles('D:/公会/互动式骰子文字游戏/10.08数值回调开发/骰子系统/fixtures/1008-rollback/double-ten-growth.json');
 await page.getByRole('button',{name:'快速自动事件',exact:true}).waitFor();
 await page.getByRole('button',{name:'快速自动事件',exact:true}).click();
 await page.locator('#campPromotion').waitFor();
 await page.locator('#campPromotion').getByRole('button',{name:'停止自动事件',exact:true}).click();
 const receipts=await page.evaluate(()=>[...(WitnessFullGame.get().state.pending?.receipts||[]),...WitnessFullGame.get().state.journal.flatMap(j=>j.receipts||[])]);
 if(receipts.filter(r=>r.kind==='xp'&&r.context==='season').length!==1||!receipts.some(r=>r.kind==='xp'&&r.context==='season'&&r.amount===351.9))throw Error('season reward duplicated or wrong');
 await page.screenshot({path:'output/playwright/1008-rollback-promotion.png'});
 for(let n=0;n<8&&await page.locator('#campPromotion').count();n++)await page.locator('#campPromotion').getByRole('button',{name:'记下这次突破',exact:true}).click();
 await page.goto('http://127.0.0.1:8772/见证者公会_10.08版_晨曦朝阳版.html');
 await page.locator('#campImport').setInputFiles('D:/公会/互动式骰子文字游戏/10.08数值回调开发/骰子系统/fixtures/1008-rollback/qualified-growth.json');
 await page.getByRole('button',{name:'快速自动事件',exact:true}).waitFor();
 const rates=await page.evaluate(()=>WitnessFullGame.get().growthRates());if(rates.xp!==206.08||rates.talent!==1.12||rates.weapon!==.92)throw Error('dawn uses stale growth rules');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/1008-rollback-dawn-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');await page.screenshot({path:'output/playwright/1008-rollback-dawn-mobile.png',fullPage:true});
 await page.reload();if(await page.evaluate(()=>WitnessFullGame.get().growthRates().version)!==10081)throw Error('reload lost rules version');
}
