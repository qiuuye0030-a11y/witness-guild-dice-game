async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('group',{name:'战斗速度',exact:true}).getByRole('button',{name:'即时',exact:true}).click();
 await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.waitForFunction(()=>{const b=WitnessBattleUI.get();return b?.canAct(b.unit('player'))},null,{timeout:15000});
 await page.getByRole('combobox',{name:'目标',exact:true}).selectOption('enemy');
 await page.getByRole('button',{name:'普攻',exact:true}).click();
 await page.waitForFunction(()=>{const b=WitnessBattleUI.get();return b?.result||b?.canAct(b.unit('player'))},null,{timeout:15000});
 const before=await page.evaluate(()=>({now:WitnessBattleUI.get().now,rng:WitnessBattleUI.get().rng.state,attempts:WitnessFullGame.get().state.exam.starts,version:WitnessBattleUI.get().snapshot().combatRulesVersion}));
 await page.reload();
 const after=await page.evaluate(()=>({now:WitnessBattleUI.get().now,rng:WitnessBattleUI.get().rng.state,attempts:WitnessFullGame.get().state.exam.starts,version:WitnessBattleUI.get().snapshot().combatRulesVersion}));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Refresh changed battle or consumed attempt');
 await page.getByRole('button',{name:'自动演示',exact:true}).click();
 await page.waitForFunction(()=>!!WitnessBattleUI.get()?.result,null,{timeout:45000});
 await page.screenshot({path:'output/playwright/1006-'+((await page.title()).includes('晨曦')?'dawn':'classic')+'-completed.png',fullPage:true});
 return {before,after,result:await page.evaluate(()=>WitnessBattleUI.get().result),phase:await page.evaluate(()=>WitnessFullGame.get().state.phase),errors};
}
