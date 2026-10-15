async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.screenshot({path:'output/playwright/1006-dawn-achievement-mobile.png',fullPage:false});
 const first=await page.getByRole('dialog').innerText();
 await page.getByRole('button',{name:'记下这份见证',exact:true}).click();
 const second=await page.getByRole('dialog').innerText();if(!second.includes('衣角微脏')||!second.includes('100.0%'))throw Error('Missing achievement evidence');
 const layout=await page.getByRole('dialog').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,maxHeight:el.getBoundingClientRect().height}));
 if(layout.scrollWidth>layout.clientWidth+1||layout.width>390)throw Error('Mobile dialog overflow');
 await page.screenshot({path:'output/playwright/1006-dawn-spotless-mobile.png',fullPage:false});
 await page.keyboard.press('Escape');
 const third=await page.getByRole('dialog').innerText();if(!third.includes('百折成章'))throw Error('Queue lost');
 await page.getByRole('button',{name:'记下这份见证',exact:true}).click();
 await page.reload();if(await page.getByRole('dialog').count())throw Error('Achievement repeated after reload');
 await page.getByRole('button',{name:'成就与考官记录',exact:true}).click();
 const archive=await page.getByRole('dialog').innerText();if(archive.includes('并肩无缺')||archive.includes('未解锁'))throw Error('Hidden achievement leaked');
 return {first,second,third,layout,archiveContainsOnlyUnlocked:true,errors,browser:await page.evaluate(()=>navigator.userAgent)};
}
