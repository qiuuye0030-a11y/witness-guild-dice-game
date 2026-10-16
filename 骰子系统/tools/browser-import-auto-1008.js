async (page) => {
 for(let n=0;n<6&&await page.locator('#campPromotion').count();n++)await page.locator('#campPromotion').getByRole('button',{name:'记下这次突破',exact:true}).click();
 await page.locator('#campImport').setInputFiles('D:/公会/互动式骰子文字游戏/10.08开发/骰子系统/fixtures/1008/quick-event.json');
 await page.getByRole('button',{name:'快速自动事件',exact:true}).waitFor();
}
