async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'读入存档',exact:true}).click();
 await (await chooser).setFiles('D:/公会/互动式骰子文字游戏/骰子系统/output/playwright/fixtures/v13-battle.json');
 await page.getByText('存档已恢复。',{exact:true}).waitFor();
 return {text:await page.locator('body').innerText(),state:await page.evaluate(()=>({version:WitnessBattleUI.get()?.snapshot().combatRulesVersion,units:WitnessBattleUI.get()?.units.length,phase:WitnessFullGame.get()?.state.phase,attempts:WitnessFullGame.get()?.state.exam?.starts})),errors};
}
