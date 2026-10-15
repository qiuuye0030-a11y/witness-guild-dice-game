async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'赞助',exact:true}).click();
 await page.getByRole('textbox',{name:'口令',exact:true}).fill('wrong');
 await page.getByRole('button',{name:'确认',exact:true}).click();
 if(!await page.getByRole('dialog',{name:'赞助',exact:true}).isVisible())throw Error('Invalid password accepted');
 await page.getByRole('textbox',{name:'口令',exact:true}).fill('witness');
 await page.getByRole('button',{name:'确认',exact:true}).click();
 if(await page.getByRole('dialog',{name:'赞助',exact:true}).isVisible())throw Error('witness rejected');
 await page.getByRole('button',{name:'即时',exact:true}).click();
 await page.getByRole('textbox',{name:'姓名（留空则立即暗骰生成）'}).fill('行舟');
 await page.getByRole('button',{name:'开始逐项投骰',exact:true}).click();
 console.log({sponsor:'wrong rejected, witness accepted',errors});
 console.log(await page.locator('body').innerText());
}
