from pathlib import Path
import re,json,hashlib,zipfile
p=Path(__file__).parent;root=p.parent;out=p/'output/10.04版独立分享检查';out.mkdir(exist_ok=True)
rows=[];engines=[];blocked=''.join(chr(c) for c in [0x5c11,0x7fcc])
for label in ['经典深靛版','晨曦朝阳版']:
    with zipfile.ZipFile(root/f'见证者公会_10.04版_{label}_分享包.zip') as z:
        assert z.testzip() is None
        assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
        games=[n for n in z.namelist() if n.endswith('.html')];assert len(games)==1
        html=z.read(games[0]);assert html==(root/f'见证者公会_10.04版_{label}.html').read_bytes()
        for n in z.namelist():assert blocked not in z.read(n).decode('utf-8-sig')
        text=html.decode('utf-8').replace('\r\n','\n');assert not re.search(r'<script[^>]+src=',text)
        for source in ['skill-effects.js','achievements.js','campaign-creation.js','campaign-events-extra.js','story-data.js','campaign-events.js','quest-runtime.js','journey-1002.js','campaign.js']:
            assert '<script>'+(p/source).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>' in text, source
        assert (p/'journey.css').read_text(encoding='utf-8') in text
        ui=(p/'campaign-ui.js').read_text(encoding='utf-8')
        if label=='晨曦朝阳版':ui=ui.replace('wire.append(path);shell.append(wire);',"const surface=path.cloneNode(false);surface.setAttribute('d',path.getAttribute('d').split(' Z ')[0]+' Z');surface.classList.add('cx-dice-surface');wire.append(surface,path);shell.append(wire);")
        assert '<script>'+ui.replace('</script','<\\/script')+'</script>' in text
        engine=next(s for s in re.findall(r'<script>(.*?)</script>',text,re.S) if '// BEGIN V12 PLAYER ENGINE' in s)
        assert engine.replace('\r\n','\n')==(p/'battle-v12-browser.js').read_text(encoding='utf-8')
        assert 'drawRulesVersion:2' in engine and 'remainingHPPercentage' in engine
        engines.append(engine);z.extractall(out)
        rows.append({'label':label,'file':str(out/games[0]),'sha256':hashlib.sha256(html).hexdigest()})
assert engines[0]==engines[1]
assert (root/'见证者公会_完整游戏.html').read_bytes()==(root/'见证者公会_10.04版_经典深靛版.html').read_bytes()
meta=json.loads((p/'output/v12接入版本核对.json').read_text(encoding='utf-8'));assert meta['adaptedSha256']==hashlib.sha256((p/'battle-engine-v12-player.js').read_bytes()).hexdigest()
(p/'output/10.04版分享包验证.json').write_text(json.dumps({'zipIntegrity':True,'separateStandalonePackages':True,'sameEngine':True,'drawRulesIncluded':True,'safeNameText':True,'packages':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: 独立分享包、成品一致性、相同战斗引擎与平局规则。')

