"""Real-browser regression for v12.03 (headless Chrome via Playwright).

Covers: focus button in a hunt battle, returning to events after surrender and
after victory, report archiving/pagination/export, and event-step timing.
Writes output/v12/v12.03浏览器验证.json and screenshots.
Run from the game root: python tools/browser-v1203-check.py
"""
from playwright.sync_api import sync_playwright
import json, pathlib, threading, functools, http.server, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT.parent
PAGE = "见证者公会_v12.03版_经典深靛版.html"
OUT = ROOT / "output" / "v12"
OUT.mkdir(parents=True, exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
errors, result = [], {}

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
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/{PAGE}"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox", "--disable-gpu"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        page.goto(url, wait_until="load")
        page.wait_for_selector(".journey-sponsor-entry", timeout=20000)

        # 赞助口令 -> 讨伐测试入口
        page.click(".journey-sponsor-entry")
        page.fill("#campSponsorCode", "witness")
        page.click("#campSponsorDialog button[type=submit]")
        page.wait_for_selector("#v12TestTarget", timeout=10000)
        page.select_option("#v12TestTarget", "frost-gnat")
        page.select_option("#v12TestOrigin", "1")
        page.select_option("#v12TestLevel", "81")
        page.locator("button", has_text="直接体验 · 讨伐之战").first.click()
        page.locator("button", has_text="接受").first.click()
        page.locator("button", has_text="前进").first.click()
        page.wait_for_function("() => window.WitnessBattleUI && WitnessBattleUI.get() && WitnessBattleUI.get().v12Battle", timeout=20000)
        result["battleStarted"] = True
        result["multiplier"] = page.evaluate("() => { const t = WitnessBattleUI.get().units.find(u => u.beastId); return { base: t.huntHealth.baseHP, multiplier: t.huntHealth.multiplier, max: t.model.derived.HP }; }")

        # 聚能：把玩家设为 0 蓝并轮到他行动，点真实按钮
        focus = page.evaluate("""() => {
          const b = WitnessBattleUI.get(), u = b.unit('player');
          b.scheduleAI = () => {};
          b.activeId = u.id; u.progress = 1; u.readyAt = b.now; u.cast = null; u.bonusAttack = false;
          u.model.derived.MP = 5648; u.mp = 0;
          WitnessBattleUI.update();
          const btn = [...document.querySelectorAll('#basicActions button')].find(x => x.textContent.includes('聚能'));
          if (!btn) return { error: 'no-focus-button' };
          const disabled = btn.disabled, label = btn.textContent, title = btn.title;
          btn.click();
          return { disabled, label, title, started: !!(u.cast && u.cast.action === 'focus'), seconds: u.cast ? (u.cast.end - u.cast.start) / 1000 : 0, mpAfterClick: u.mp };
        }""")
        result["focus"] = focus
        page.wait_for_function("() => WitnessBattleUI.get().unit('player').mp > 0", timeout=20000)
        result["focus"]["mpAfterResolve"] = page.evaluate("() => WitnessBattleUI.get().unit('player').mp")
        result["focus"]["logHasFocus"] = page.evaluate("() => WitnessBattleUI.get().log.some(l => l.text.includes('聚能') || l.text.includes('回魂'))")
        page.locator("#battleStage").scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / "v12.03_聚能按钮.png"), full_page=False)

        # 认输并返回事件
        page.evaluate("() => { const b = WitnessBattleUI.get(); b.surrender(); WitnessBattleUI.update(); }")
        page.wait_for_function("() => WitnessFullGame.get().state.v12.reports.length >= 1", timeout=20000)
        page.locator("button", has_text="返回原旅程").first.click()
        page.wait_for_function("() => WitnessFullGame.get().state.phase === 'growth'", timeout=20000)
        result["afterSurrender"] = page.evaluate("""() => {
          const c = WitnessFullGame.get(), v = c.state.v12, r = v.reports[0], api = window.WitnessV12Reports;
          return { phase: c.state.phase, huntStatus: v.hunt.status, attempts: v.attemptsUsed,
            report: { id: r.id, hasSnapshot: !!r.snapshot, logCount: r.logCount, winner: r.winner },
            battleSnapshot: !!v.battleSnapshot, archivedLogCount: api && api.peek(r.id) ? api.peek(r.id).snapshot.log.length : 0,
            archiveMemory: api ? api.memorySize() : -1, archiveWarning: v.archiveWarning || null,
            saveBytes: (localStorage.getItem('witness-complete-game-v1203') || '').length,
            battleLogNodes: document.getElementById('battleLog').children.length,
            battleCleared: WitnessBattleUI.get() === null, arenaActive: document.getElementById('battleArena').classList.contains('has-battle') };
        }""")

        # 返回事件后的一步耗时
        result["eventStepAfterSurrender"] = page.evaluate("""() => {
          const c = WitnessFullGame.get();
          const t0 = performance.now(); c.startQuarter('C'); const state = c.snapshot(); const snapshotMs = performance.now() - t0;
          const t1 = performance.now(); const text = JSON.stringify(state); const stringifyMs = performance.now() - t1;
          return { snapshotMs, stringifyMs, bytes: text.length, phase: c.state.phase };
        }""")

        # 第二次讨伐 -> 胜利 -> 继续结算 -> 返回
        page.locator("button", has_text="继续讨伐 · 剩余").first.click()
        page.locator("button", has_text="再次挑战 · 剩余").first.click()
        page.wait_for_function("() => WitnessBattleUI.get() && WitnessBattleUI.get().v12Battle && !WitnessBattleUI.get().result", timeout=20000)
        page.evaluate("() => { const b = WitnessBattleUI.get(); const t = b.units.find(u => u.beastId); t.hp = 0; b.checkResult(); WitnessBattleUI.update(); }")
        page.wait_for_function("() => WitnessFullGame.get().state.v12.reports.length >= 2", timeout=20000)
        result["beforeVictoryReturn"] = page.evaluate("""() => {
          const c = WitnessFullGame.get(), v = c.state.v12;
          return { phase: c.state.phase, huntStatus: v.hunt.status, reward: !!v.reward, notice: document.getElementById('campNotice').textContent,
            loot: !!(v.hunt.result && v.hunt.result.loot), resultWinner: v.result && v.result.winner,
            reports: v.reports.map(r => ({ id: r.id, winner: r.winner, hasSnapshot: !!r.snapshot, reason: r.reason })),
            session: v.hunt.battleSessionId, buttons: [...document.querySelectorAll('#campBody button')].map(b => b.textContent) };
        }""")
        page.locator("button", has_text="返回原旅程").first.click()
        page.wait_for_function("() => WitnessFullGame.get().state.phase !== 'v12Hunt'", timeout=20000)
        result["afterVictory"] = page.evaluate("""() => {
          const c = WitnessFullGame.get(), v = c.state.v12;
          return { phase: c.state.phase, returnPhase: v.returnPhase, attempts: v.attemptsUsed, rewards: !!v.reward, bones: c.state.character.bones.length,
            reports: v.reports.length, reportHasSnapshot: v.reports.some(r => !!r.snapshot), battleCleared: WitnessBattleUI.get() === null,
            summaryBytes: JSON.stringify(v.reports).length };
        }""")
        result["eventStepAfterVictory"] = page.evaluate("""() => {
          const c = WitnessFullGame.get();
          if (c.state.phase === 'event' && c.state.pending && c.state.pending.choice === null) c.prepareEvent(0);
          const t0 = performance.now();
          if (c.state.phase === 'event' && c.state.pending && c.state.pending.choice !== null) c.chooseEvent();
          const state = c.snapshot(); const snapshotMs = performance.now() - t0;
          const t1 = performance.now(); const text = JSON.stringify(state); const stringifyMs = performance.now() - t1;
          return { snapshotMs, stringifyMs, bytes: text.length, phase: c.state.phase };
        }""")

        # 关闭升级/成就弹窗（真实流程会出现），再测归档分页
        for selector in ["#campPromotion button", "#campAchievement button"]:
            if page.locator(selector).count():
                page.locator(selector).first.click()
                page.wait_for_timeout(300)

        # 归档分页 + 导出全部战报
        paged = page.evaluate("""() => {
          const c = WitnessFullGame.get(), api = window.WitnessV12Reports;
          const promo = c.currentPromotion && c.currentPromotion();
          if (promo) c.acknowledgePromotion(promo.id);
          document.getElementById('campPromotion')?.remove();
          document.getElementById('campAchievement')?.remove();
          const lines = Array.from({ length: 450 }, (_, i) => ({ time: i * 100, text: '浏览器分页测试第' + i + '行' }));
          const fake = { id: 'browser-paged', snapshot: { now: 45000, result: { winner: 0, reason: '分页测试', time: 45000, huntOutcome: 'victory' }, units: [{ id: 'beast', name: '霜蚋', team: 1, beastId: 'frost-gnat', hp: 0, model: { derived: { HP: 7395 } } }], log: lines }, date: { year: 6102, month: 1, age: 20 } };
          const archived = api.archiveReport(fake);
          c.state.v12.reports.push(archived.summary); window.WitnessFullGame.render();
          document.getElementById('campPromotion')?.remove();
          const ach = document.getElementById('campAchievement');
          if (ach) { ach.close?.(); ach.remove(); }
          return { reports: c.state.v12.reports.length, archived: archived.ok };
        }""")
        result["pagedReport"] = paged
        page.wait_for_timeout(200)
        if page.locator("#campAchievement button").count():
            page.locator("#campAchievement button").first.click()
        page.locator(".v12-reports summary", has_text="讨伐战报").first.click()
        page.locator(".v12-reports details", has_text="分页测试").first.locator("summary").first.click()
        page.wait_for_function("() => document.querySelectorAll('.v12-report-log p').length === 200", timeout=10000)
        result["pagedReport"]["firstPageLines"] = page.evaluate("() => document.querySelectorAll('.v12-report-log p').length")
        page.locator(".v12-report-log").first.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / "v12.03_战报分页.png"), full_page=False)
        page.locator("button", has_text="显示更多").first.click()
        result["pagedReport"]["secondPageLines"] = page.evaluate("() => document.querySelectorAll('.v12-report-log p').length")
        with page.expect_download(timeout=15000) as download_info:
            page.locator("button", has_text="导出全部战报").first.click()
        download = download_info.value
        exported = json.loads(pathlib.Path(download.path()).read_text(encoding="utf-8"))
        result["exportAll"] = {"name": download.suggested_filename, "reports": len(exported.get("reports", [])),
                               "hasFullLog": any((r.get("snapshot", {}).get("log") or []) for r in exported.get("reports", [])),
                               "logCounts": [len(r.get("snapshot", {}).get("log") or []) for r in exported.get("reports", [])]}

        # 打开过大日志后再继续事件：不应被大快照拖慢
        result["eventStepAfterBigReport"] = page.evaluate("""() => {
          const c = WitnessFullGame.get();
          const t0 = performance.now();
          if (c.state.phase === 'eventResult') c.finishEvent();
          const state = c.snapshot(); const snapshotMs = performance.now() - t0;
          const t1 = performance.now(); const text = JSON.stringify(state); const stringifyMs = performance.now() - t1;
          return { snapshotMs, stringifyMs, bytes: text.length, phase: c.state.phase };
        }""")

        page.screenshot(path=str(OUT / "v12.03_返回事件.png"), full_page=False)
        result["errors"] = errors
        result["passed"] = bool(result.get("battleStarted") and result["focus"].get("started")
                                and result["focus"].get("mpAfterResolve") == 565
                                and result["afterSurrender"]["report"]["hasSnapshot"] is False
                                and result["afterSurrender"]["battleCleared"]
                                and result["afterVictory"]["reports"] == 2
                                and result["pagedReport"]["firstPageLines"] == 200
                                and result["pagedReport"]["secondPageLines"] == 400
                                and result["exportAll"]["hasFullLog"]
                                and result["eventStepAfterBigReport"]["snapshotMs"] < 150
                                and result["eventStepAfterVictory"]["snapshotMs"] < 150
                                and result["afterSurrender"]["saveBytes"] < 500000
                                and not errors)
        browser.close()
except Exception as exc:
    result["failure"] = repr(exc)
    result["passed"] = False
finally:
    server.shutdown()

(OUT / "v12.03浏览器验证.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))

