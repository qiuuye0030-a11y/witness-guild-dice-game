(function(){
  'use strict';
  const root=document.getElementById('campaignRoot');if(!root?.matches('.cx-root'))return;
  const ui=ChenxiUI.create(root);window.WitnessTheme=ui;
  root.addEventListener('chenxi:menu',e=>{
    if(e.detail.action==='restart')document.getElementById('campNew').click();
    if(e.detail.action==='journal'){const history=document.getElementById('campHistory');if(!history.hidden){history.open=true;history.scrollIntoView({behavior:'smooth',block:'start'});}}
    if(e.detail.action==='inventory'){const sidebar=document.getElementById('campSidebar');if(!sidebar.hidden){for(const detail of sidebar.querySelectorAll('details'))if(/魂骨|魂环/.test(detail.querySelector('summary')?.textContent||''))detail.open=true;sidebar.scrollIntoView({behavior:'smooth',block:'start'});}}
    if(e.detail.action==='settings'){document.getElementById('campSpeeds').scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('#campSpeeds button.active')?.focus();}
  });
})();
