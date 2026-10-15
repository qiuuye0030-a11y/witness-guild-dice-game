async (page) => {
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'output/playwright/1006-classic-achievement-desktop.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.screenshot({path:'output/playwright/1006-classic-achievement-mobile.png',fullPage:false});
 let seen=[];while(await page.getByRole('button',{name:'记下这份见证',exact:true}).count()){
  seen.push(await page.getByRole('dialog').innerText());await page.getByRole('button',{name:'记下这份见证',exact:true}).click();
 }
 return {seen:seen.length,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)};
}
