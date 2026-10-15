async (page) => {
 await page.getByRole('button',{name:'记住这个武魂 · 继续完善人物',exact:true}).click();
 for(let i=0;i<40;i++){
  const roll=page.getByRole('button',{name:/^投掷 · /});if(!await roll.count())break;await roll.click();
 }
 await page.reload();
 return {text:await page.locator('body').innerText(),state:await page.evaluate(()=>({phase:WitnessFullGame.get()?.state.phase,name:WitnessFullGame.get()?.state.character?.name,mode:WitnessFullGame.get()?.state.exam?.mode}))};
}
