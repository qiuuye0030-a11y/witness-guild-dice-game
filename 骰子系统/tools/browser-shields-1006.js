async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mirror=await page.getByText('生命盾 尘镜 416（1）',{exact:true}).getAttribute('title');
 const flower=await page.getByText('生命盾 栀子花露 547（2）',{exact:true}).getAttribute('title');
 if(!mirror?.includes('最先承伤')||!flower?.includes('第2层承伤'))throw Error('Shield ordering missing');
 await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByRole('combobox',{name:'目标',exact:true}).selectOption('ally');
 await page.getByRole('button').filter({has:page.getByText('寒锋龙躯',{exact:true})}).click();
 await page.waitForFunction(()=>{const b=WitnessBattleUI.get();return b.value(b.unit('player'),'iceArmor')>0},null,{timeout:10000});
 const result=await page.evaluate(()=>{const b=WitnessBattleUI.get();WitnessBattleUI.halt();return {selfArmor:b.value(b.unit('player'),'iceArmor'),allyArmor:b.value(b.unit('ally'),'iceArmor'),target:document.getElementById('battleTarget').value,units:b.units.length,shieldLayers:b.shieldLayersFor(b.unit('player')).length}});
 if(result.selfArmor<=0||result.allyArmor!==0||result.target!=='player')throw Error('Self-only target leaked');
 return {mirror,flower,result,errors};
}
