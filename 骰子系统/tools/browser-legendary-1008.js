async (page) => {
 await page.locator('#campImport').setInputFiles('D:/公会/互动式骰子文字游戏/10.08开发/骰子系统/fixtures/1008/legendary-witness-ui.json');
 const dialog=page.locator('#campAchievement.achievement-legendary');await dialog.waitFor();
 if(await dialog.locator('.legendary-halo i').count()!==20)throw Error('legendary effects missing');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/1008-legendary-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 const bounds=await dialog.boundingBox();if(bounds.x<0||bounds.x+bounds.width>391||bounds.height>844)throw Error('legendary mobile card does not fit');
 await page.screenshot({path:'output/playwright/1008-legendary-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});if(await dialog.locator('.legendary-halo').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('reduced motion not respected');
 await page.getByRole('button',{name:'记下这份见证',exact:true}).click();
 await page.reload();if(await page.locator('#campAchievement').count())throw Error('witness awarded again on reload');
}
