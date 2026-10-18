"""v12.03.02 浏览器验收：会长成就弹出/持久化/优先级，以及霜蚋新特性在战斗界面的显示。

用 CDP 直连 headless Chrome（不依赖 Playwright 管道）。结果写入 output/v12/v12.03.02浏览器验证.json。
"""
import json, pathlib, threading, functools, http.server, sys, time, urllib.parse
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cdp import Chrome

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT.parent
PAGE = "见证者公会_v12.03.02版_经典深靛版.html"
OUT = ROOT / "output" / "v12"
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if "favicon.ico" in self.path:
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


handler = functools.partial(Quiet, directory=str(DIST))


class Local(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass


server = Local(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/{urllib.parse.quote(PAGE)}"
ending = json.loads((ROOT / "fixtures/1007/achievement-ending.json").read_text(encoding="utf-8"))
result = {"steps": []}


def step(name, ok, detail=None):
    result["steps"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name, json.dumps(detail, ensure_ascii=False) if detail is not None else "")


def dismiss_all(chrome, limit=10):
    got = []
    for _ in range(limit):
        rid = chrome.invoke("""() => { const d=document.getElementById('campAchievement'); if(!d) return null; const id=d.dataset.achievementId; const b=d.querySelector('button'); if(b) b.click(); else d.remove(); return id; }""")
        if not rid:
            break
        got.append(rid)
        time.sleep(0.3)
    return got


def seed_and_load(chrome, storage=None, achievements=None):
    chrome.navigate(url)
    chrome.wait_for("() => !!document.getElementById('campImport')", timeout=90)
    chrome.eval("window.__save = %s;" % json.dumps(ending, ensure_ascii=False))
    chrome.eval("localStorage.setItem('witness-complete-game-v1203', JSON.stringify(window.__save));")
    if achievements is not None:
        chrome.eval("window.__ach = %s;" % json.dumps(achievements, ensure_ascii=False))
        chrome.eval("localStorage.setItem('witness-achievements-v1', JSON.stringify(window.__ach));")
    chrome.navigate(url)
    chrome.wait_for("() => window.WitnessFullGame && WitnessFullGame.get() && WitnessFullGame.get().state.phase === 'ending'", timeout=90)


def start_guildmaster(chrome):
    chrome.invoke("() => { const s=[...document.querySelectorAll('#campBody summary')].find(x=>x.textContent.includes('展开挑战目录')); if(s) s.click(); return true; }")
    chrome.wait_for("() => !!document.getElementById('challengeMode')", timeout=30)
    chrome.invoke("() => { const m=document.getElementById('challengeMode'); m.value='guildmaster'; m.dispatchEvent(new Event('change')); return true; }")
    chrome.invoke("() => { const b=[...document.querySelectorAll('#campBody button')].find(x=>x.textContent.includes('接受挑战')); b.click(); return true; }")
    chrome.wait_for("() => !!document.querySelector('dialog.challenge-confirm')", timeout=30)
    chrome.invoke("() => { const b=[...document.querySelectorAll('dialog.challenge-confirm button')].find(x=>x.textContent.includes('确认登台')); b.click(); return true; }")
    chrome.wait_for("() => window.WitnessBattleUI && WitnessBattleUI.get() && WitnessBattleUI.get().postGameChallenge", timeout=90)


def win_battle(chrome):
    chrome.invoke("() => { const b=WitnessBattleUI.get(); b.unit('enemy').hp=0; b.checkResult(); WitnessBattleUI.update(); return true; }")
    time.sleep(1.0)


zero_ach = {"format": "witness-achievements", "version": 1, "unlocked": {}, "notified": {}, "styles": [], "examiners": {}, "participants": {}, "defeats": {}}
chrome = Chrome()
try:
    # 0) 版式居中：欢迎页（无侧栏）与结局页（有侧栏）在 1440/1920 下都应水平居中
    chrome.navigate(url)
    chrome.wait_for("() => !!document.querySelector('.journey-sponsor-entry')", timeout=90)
    for width in (1440, 1920):
        chrome.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
        geo = chrome.invoke("""() => {
          const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),w:Math.round(r.width),right:Math.round(r.right)};};
          const story=box('.camp-story'),vcenter=document.documentElement.clientWidth/2;
          return {vw:document.documentElement.clientWidth, story, center:story?Math.round(story.x+story.w/2):null, vcenter:Math.round(vcenter), offset:story?Math.round(story.x+story.w/2-vcenter):null};
        }""")
        step("欢迎页居中 @%d" % width, geo["story"] is not None and abs(geo["offset"]) <= 2, geo)
    chrome.call("Emulation.clearDeviceMetricsOverride")

    # 1) 干净结局：先关掉既有见证，再击败雪寂冬 → 会长见证立即弹出
    seed_and_load(chrome, achievements=zero_ach)
    dismissed = dismiss_all(chrome)
    step("导入结局并关闭既有见证", True, {"dismissed": dismissed})
    # 结局页有侧栏：正文栏与侧栏作为整体应居中
    geo2 = chrome.invoke("""() => {
      const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),w:Math.round(r.width),right:Math.round(r.right)};};
      const story=box('.camp-story'), side=box('#campSidebar');
      return {vw:document.documentElement.clientWidth, story, side, pairCenter:Math.round((story.x+side.right)/2), vcenter:Math.round(document.documentElement.clientWidth/2)};
    }""")
    step("结局页正文+侧栏整体居中", geo2["side"] is not None and abs(geo2["pairCenter"] - geo2["vcenter"]) <= 2, geo2)
    start_guildmaster(chrome)
    win_battle(chrome)
    first = chrome.invoke("""() => { const d=document.getElementById('campAchievement'); const c=WitnessFullGame.get(); return {id:d&&d.dataset.achievementId, open:!!(d&&d.open), legendary:!!(d&&d.classList.contains('achievement-legendary')), completed:c.state.challenge.completed, phase:c.state.phase}; }""")
    step("击败雪寂冬后弹出会长见证", first["id"] == "guildmaster_clear" and first["open"] and first["legendary"], first)
    chrome.screenshot(str(OUT / "v12.03.02_会长见证.png"))

    # 2) 未点“记下这份见证”就刷新 → 见证应再次弹出（未读持久化）
    chrome.navigate(url)
    chrome.wait_for("() => window.WitnessFullGame && WitnessFullGame.get().state.phase === 'ending'", timeout=90)
    again = chrome.invoke("() => { const d=document.getElementById('campAchievement'); return {id:d&&d.dataset.achievementId, open:!!(d&&d.open)}; }")
    step("刷新后未读见证仍会弹出", again["id"] == "guildmaster_clear" and again["open"], again)

    # 3) 确认阅读后刷新 → 不再重复弹
    dismiss_all(chrome)
    chrome.navigate(url)
    chrome.wait_for("() => window.WitnessFullGame && WitnessFullGame.get().state.phase === 'ending'", timeout=90)
    after = chrome.invoke("() => { const d=document.getElementById('campAchievement'); const store=JSON.parse(localStorage.getItem('witness-achievements-v1')); return {id:d&&d.dataset.achievementId, open:!!(d&&d.open), notified:store.notified, unlocked:Object.keys(store.unlocked||{})}; }")
    step("确认阅读后不再重复弹", not after["open"] and after["notified"].get("guildmaster_clear") if isinstance(after["notified"], dict) else not after["open"], after)

    # 4) 队列里还有未读旧见证时，会长见证仍优先弹出
    stale = {"format": "witness-achievements", "version": 1, "unlocked": {"spark_clear": {"characterId": "character-0715001e-fbd0-45b4-b91d-c4879af5de7d", "name": "验收角色", "at": "2026-10-01T00:00:00.000Z", "evidence": "开局潜力 · 1档"}}, "notified": {}, "styles": [], "examiners": {}, "participants": {}, "defeats": {}}
    seed = ("if(!localStorage.getItem('__v120301_seeded')){localStorage.clear();localStorage.setItem('__v120301_seeded','1');"
            "localStorage.setItem('witness-achievements-v1',JSON.stringify(%s));"
            "localStorage.setItem('witness-complete-game-v1203',JSON.stringify(%s));}" % (json.dumps(stale, ensure_ascii=False), json.dumps(ending, ensure_ascii=False)))
    seed_id = chrome.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})["identifier"]
    chrome.navigate(url)
    time.sleep(1.5)
    diag = chrome.invoke("""() => ({title:document.title, ready:document.readyState, hasGame:!!window.WitnessFullGame, phase:window.WitnessFullGame&&WitnessFullGame.get()&&WitnessFullGame.get().state.phase, keys:Object.keys(localStorage), save:!!localStorage.getItem('witness-complete-game-v1203'), ach:localStorage.getItem('witness-achievements-v1'),
      notice:(document.getElementById('campNotice')||{}).textContent, bodyText:(document.getElementById('campBody')||{}).textContent&&document.getElementById('campBody').textContent.slice(0,120)})""")
    print("DIAG", json.dumps(diag, ensure_ascii=False))
    print("SAVEHEAD", chrome.invoke("() => { const raw=localStorage.getItem('witness-complete-game-v1203'); let parsed=null,err=null; try{parsed=JSON.parse(raw);}catch(e){err=String(e);} return {len:raw.length, head:raw.slice(0,80), tail:raw.slice(-40), gameVersion:parsed&&parsed.gameVersion, keys:parsed&&Object.keys(parsed), statePhase:parsed&&parsed.state&&parsed.state.phase, err}; }"))
    chrome.wait_for("() => window.WitnessFullGame && WitnessFullGame.get() && WitnessFullGame.get().state.phase === 'ending'", timeout=90)
    pending = chrome.invoke("() => { const d=document.getElementById('campAchievement'); const a=JSON.parse(localStorage.getItem('witness-achievements-v1')); return {dialog:d&&d.dataset.achievementId, unlocked:Object.keys(a.unlocked||{}), notified:Object.keys(a.notified||{})}; }")
    step("旧未读见证先出现在队列", pending["dialog"] == "spark_clear", pending)
    # 不关闭弹窗，直接用接口开战（等价于玩家在弹窗未处理时继续挑战的边界情况）
    start_guildmaster(chrome)
    win_battle(chrome)
    prio = chrome.invoke("""() => { const d=document.getElementById('campAchievement'); return {id:d&&d.dataset.achievementId, open:!!(d&&d.open)}; }""")
    step("会长见证优先于旧未读见证", prio["id"] == "guildmaster_clear" and prio["open"], prio)
    chrome.invoke("() => { const d=document.getElementById('campAchievement'); const b=d&&d.querySelector('button'); if(b) b.click(); return true; }")
    time.sleep(0.6)
    nxt = chrome.invoke("() => { const d=document.getElementById('campAchievement'); return {id:d&&d.dataset.achievementId, open:!!(d&&d.open)}; }")
    step("会长见证关闭后继续显示旧见证", nxt["id"] == "spark_clear" and nxt["open"], nxt)

    # 5) 讨伐战界面：新冰壳 70% 与霜域三档显示
    chrome.call("Page.removeScriptToEvaluateOnNewDocument", {"identifier": seed_id})
    chrome.call("Page.addScriptToEvaluateOnNewDocument", {"source": "if(!localStorage.getItem('__v120301_clean')){localStorage.clear();localStorage.setItem('__v120301_clean','1');}"})
    chrome.navigate(url)
    chrome.wait_for("() => !!document.querySelector('.journey-sponsor-entry')", timeout=90)
    chrome.invoke("() => { document.querySelector('.journey-sponsor-entry').click(); return true; }")
    chrome.wait_for("() => !!document.getElementById('campSponsorCode')", timeout=30)
    chrome.eval("document.getElementById('campSponsorCode').value='witness';")
    chrome.invoke("() => { document.querySelector('#campSponsorDialog button[type=submit]').click(); return true; }")
    chrome.wait_for("() => !!document.getElementById('v12TestTarget')", timeout=30)
    chrome.invoke("() => { const t=document.getElementById('v12TestTarget'); t.value='frost-gnat'; const r=document.getElementById('v12TestOrigin'); r.value='1'; const l=document.getElementById('v12TestLevel'); l.value='81'; return true; }")
    chrome.invoke("() => { [...document.querySelectorAll('button')].find(b=>b.textContent.includes('直接体验 · 讨伐之战')).click(); return true; }")
    chrome.wait_for("() => [...document.querySelectorAll('button')].some(b=>b.textContent.includes('接受'))", timeout=60)
    chrome.invoke("() => { [...document.querySelectorAll('button')].find(b=>b.textContent.includes('接受')).click(); return true; }")
    chrome.wait_for("() => [...document.querySelectorAll('button')].some(b=>b.textContent.includes('前进'))", timeout=60)
    chrome.invoke("() => { [...document.querySelectorAll('button')].find(b=>b.textContent.includes('前进')).click(); return true; }")
    chrome.wait_for("() => window.WitnessBattleUI && WitnessBattleUI.get() && WitnessBattleUI.get().v12Battle", timeout=90)
    hunt = chrome.invoke("""() => { const b=WitnessBattleUI.get(), t=b.units.find(u=>u.beastId), p=b.unit('player');
      const shell=t.shieldLayers.filter(l=>l.label==='冰壳护生');
      b.scheduleAI=()=>{}; const wake=()=>{b.activeId=null;t.v12TurnOpen=false;t.progress=1;t.readyAt=b.now;t.cast=null;b.selectActor();b.activeId=null;};
      wake();wake();wake();
      return {maxHP:t.model.derived.HP, shellCount:shell.length, shellAmount:shell[0]&&shell[0].amount, expectShell:Math.round(t.model.derived.HP*.4),
        tier:t.v12State.domainTier, playerBadges:WitnessV12Effects.badges(b,p).map(r=>r.name), beastBadges:WitnessV12Effects.badges(b,t).map(r=>r.name),
        beastShield:t.shieldLayers.filter(l=>l.label==='霜域·寒冰').map(l=>l.amount), expectDomainShield:Math.round(t.model.derived.HP*.02)}; }""")
    step("讨伐界面：冰壳40%与霜域三档数值", hunt["shellCount"] == 1 and hunt["shellAmount"] == hunt["expectShell"] and hunt["tier"] == 3 and any("霜域·迟滞" in n for n in hunt["playerBadges"]) and any("霜域 3/3档" in n for n in hunt["beastBadges"]) and hunt["expectDomainShield"] in hunt["beastShield"], hunt)
    chrome.screenshot(str(OUT / "v12.03.02_霜域三档.png"))

    result["failure"] = None
except Exception as exc:
    result["failure"] = repr(exc)
finally:
    chrome.close()
    server.shutdown()

result["passed"] = bool(result["steps"]) and all(s["ok"] for s in result["steps"]) and not result["failure"]
(OUT / "v12.03.02浏览器验证.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"passed": result["passed"], "failure": result["failure"], "steps": result["steps"]}, ensure_ascii=False, indent=2))
sys.exit(0 if result["passed"] else 1)
