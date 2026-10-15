async (page) => {
 for(let i=0;i<40;i++){
  const roll=page.getByRole('button',{name:/^投掷 · /});
  if(!await roll.count())break;
  await roll.click();
 }
 return {text:await page.locator('body').innerText(),state:await page.evaluate(()=>({phase:WitnessFullGame.get()?.state.phase,mode:WitnessFullGame.get()?.state.exam?.mode}))};
}
