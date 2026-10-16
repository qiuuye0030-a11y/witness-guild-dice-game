async (page) => {
 await page.setViewportSize({width:1280,height:900});
 const before=await page.evaluate(()=>({phase:WitnessFullGame.get().state.phase,choice:WitnessFullGame.get().state.pending?.choice,completed:WitnessFullGame.get().state.completed}));
 if(before.phase!=='event')throw Error('event fixture did not import');
 await page.getByRole('button',{name:'快速自动事件',exact:true}).click();
 await page.waitForFunction(()=>{const s=WitnessFullGame.get().state;return s.phase!=='event'||s.pending?.choice!==null;});
 await page.waitForFunction(()=>{const s=WitnessFullGame.get().state;return !!document.querySelector('#campPromotion')||s.completed>0||s.phase==='arrival'||!!s.hunt?.result;});
 const promotion=page.locator('#campPromotion');if(await promotion.isVisible()){const pause=promotion.getByRole('button',{name:'停止自动事件',exact:true});if(await pause.isVisible())await pause.click();await page.screenshot({path:'output/playwright/1008-quick-events.png',fullPage:true});await promotion.getByRole('button',{name:'记下这次突破',exact:true}).click();}else{const stop=page.getByRole('button',{name:'停止快速自动事件',exact:true});if(await stop.isVisible())await stop.click();}
 await page.screenshot({path:'output/playwright/1008-quick-events.png',fullPage:true});
 if(await page.evaluate(()=>document.querySelector('#campNotice')?.textContent.includes('无效')))throw Error('auto event error');
}
