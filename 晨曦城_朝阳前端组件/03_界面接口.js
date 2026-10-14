/* 晨曦城朝阳组件：只显示数据和发出事件，不负责骰子、剧情、存档。 */
(function (global) {
 'use strict';
 const phases = [
  {name:'初晓',top:'#9CC7C4',mid:'#DCE7CF',low:'#F7E7B0',sun:'60%',fog:.95,ray:.25},
  {name:'晨曦',top:'#A8D3CC',mid:'#EFE9BE',low:'#FFE08A',sun:'52%',fog:.75,ray:.4},
  {name:'旭日',top:'#B5DCD2',mid:'#FBEDB4',low:'#FFD84A',sun:'42%',fog:.5,ray:.6},
  {name:'朝晖',top:'#C4E6DC',mid:'#FFF3C4',low:'#FFDF6B',sun:'30%',fog:.3,ray:.5}
 ];
 function create(root, options = {}) {
  if (!root || !root.matches('.cx-root')) throw new Error('ChenxiUI.create 需要 .cx-root 元素');
  if (root.chenxiUI) return root.chenxiUI;
  const find = key => root.querySelector('[data-cx="'+key+'"]');
  const box = find('choices');
  let choices = [], disposed = false;
  function emit(type, detail) {
   root.dispatchEvent(new CustomEvent('chenxi:'+type, {detail, bubbles:true}));
   const callback = options[{choice:'onChoice',menu:'onMenu',clue:'onClue'}[type]];
   if (typeof callback === 'function') callback(detail, api);
  }
  function setPhase(index) {
   if (disposed) return;
   if (!Number.isInteger(index) || !phases[index]) throw new RangeError('phase 应为 0、1、2、3');
   const p = phases[index];
   root.dataset.cxPhase = String(index);
   for (const [key, value] of Object.entries({'sky-top':p.top,'sky-mid':p.mid,'sky-low':p.low,'sun-y':p.sun,fog:p.fog,ray:p.ray})) root.style.setProperty('--cx-'+key,value);
   find('phase').textContent = p.name;
  }
  function render(view = {}) {
   if (disposed) return;
   if (view.phase !== undefined) setPhase(view.phase);
   for (const [key, target] of Object.entries({place:'place',time:'clock',speaker:'speaker'})) if (view[key] !== undefined) find(target).textContent = String(view[key]);
   // 默认 narrative 按纯文本显示；narrativeHTML 只能使用自己可信的游戏正文。
   if (view.narrativeHTML !== undefined) find('narr').innerHTML = String(view.narrativeHTML);
   else if (view.narrative !== undefined) {find('narr').textContent = String(view.narrative);find('narr').style.whiteSpace = 'pre-wrap';}
   if (view.narrativeHTML !== undefined) find('narr').style.whiteSpace = 'normal';
   if (view.choices !== undefined) {
    choices = view.choices.map(choice => ({...choice}));
    box.replaceChildren();
    choices.forEach((choice, index) => {
     const li = document.createElement('li'), button = document.createElement('button');
     button.type = 'button';button.className = 'cx-choice';button.dataset.cxChoice = String(index);
     button.textContent = String(choice.label ?? '');button.disabled = Boolean(choice.disabled);
     button.classList.toggle('cx-risk', Boolean(choice.risk));
     button.classList.toggle('cx-picked', Boolean(choice.selected));
     if (choice.selected) button.setAttribute('aria-pressed','true');
     if (choice.tag) {const tag = document.createElement('span');tag.className = 'cx-tag';tag.textContent = String(choice.tag);button.append(tag);}
     li.append(button);box.append(li);
    });
   }
   if (view.menus) root.querySelectorAll('[data-cx-menu]').forEach(button => {const value = view.menus[button.dataset.cxMenu];if(value !== undefined) button.hidden = !value;});
  }
  function click(event) {
   const target = event.target.closest('[data-cx-choice],[data-cx-menu],.cx-clue');
   if (!target || !root.contains(target) || target.disabled) return;
   if (target.hasAttribute('data-cx-choice')) {const index = Number(target.dataset.cxChoice);emit('choice',{index,choice:{...choices[index]},id:choices[index].id});}
   else if (target.hasAttribute('data-cx-menu')) emit('menu',{action:target.dataset.cxMenu});
   else emit('clue',{text:target.textContent,id:target.dataset.clueId || null});
  }
  const api = {render,setPhase,destroy() {if(disposed)return;disposed=true;root.removeEventListener('click',click);delete root.chenxiUI;}};
  root.addEventListener('click',click);root.chenxiUI = api;setPhase(0);
  if (options.initialView) render(options.initialView);
  return api;
 }
 global.ChenxiUI = Object.freeze({create});
})(window);
