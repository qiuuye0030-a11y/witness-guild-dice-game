async (page) => {
 await page.setViewportSize({width:1280,height:900});
 if(!await page.locator('[data-challenge-zone]').innerText().then(t=>t.includes('剩余2次')))throw Error('old ledger did not restore two opportunities');
 await page.getByText('展开挑战目录',{exact:true}).click();
 const names=await page.locator('#challengeEnemy option').allTextContents();
 if(!names.some(t=>t.includes('林式'))||!names.some(t=>t.includes('安景文')))throw Error('new roster missing');
 await page.locator('#challengeEnemy').selectOption('linshi');
 await page.getByRole('button',{name:'接受挑战',exact:true}).click();
 if(!await page.locator('dialog.challenge-confirm').innerText().then(t=>t.includes('累计五次失败')))throw Error('wrong cap warning');
 await page.getByRole('button',{name:'暂不挑战',exact:true}).click();
 await page.screenshot({path:'output/playwright/1008-classic-old-save.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('mobile page overflow');
 await page.screenshot({path:'output/playwright/1008-mobile-challenge.png',fullPage:true});
}
