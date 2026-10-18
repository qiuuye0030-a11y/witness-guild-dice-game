"""最小 CDP 客户端：不依赖命名管道，通过 --remote-debugging-port 驱动 headless Chrome。"""
import json, os, shutil, socket, subprocess, tempfile, time, urllib.request
import websocket

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Chrome:
    def __init__(self, user_data_dir=None, port=None):
        self.port = port or free_port()
        self.user_data_dir = user_data_dir or tempfile.mkdtemp(prefix="dsh-chrome-")
        self._owned_dir = user_data_dir is None
        exe = next(p for p in CHROME_CANDIDATES if os.path.exists(p))
        self.proc = subprocess.Popen(
            [exe, "--headless=new", f"--remote-debugging-port={self.port}",
             f"--user-data-dir={self.user_data_dir}", "--no-sandbox", "--disable-gpu",
             "--disable-extensions", "--no-first-run", "--no-default-browser-check",
             "--remote-allow-origins=*", "--window-size=1440,1000", "about:blank"],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ws = None
        self.next_id = 0
        self.targets = {}
        self._connect()

    def _connect(self, timeout=25):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json/list") as r:
                    pages = json.load(r)
                page = next(t for t in pages if t.get("type") == "page")
                self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30,
                                                      max_size=200 * 1024 * 1024)
                self.targets["page"] = page
                self.call("Page.enable")
                self.call("Runtime.enable")
                return
            except Exception as exc:  # chrome 还没起来
                last = exc
                time.sleep(0.3)
        raise RuntimeError(f"无法连接 Chrome: {last!r}")

    def call(self, method, params=None, timeout=60):
        self.next_id += 1
        mid = self.next_id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.ws.settimeout(max(0.1, deadline - time.time()))
            try:
                raw = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                break
            if not raw:
                continue
            msg = json.loads(raw)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method} -> {msg['error']}")
                return msg.get("result", {})
        raise RuntimeError(f"{method} 超时")

    def navigate(self, url, wait="load", timeout=60):
        loaded = {"done": False}
        self.call("Page.navigate", {"url": url})
        # 轮询 document.readyState，避免依赖事件分发。
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                state = self.eval("document.readyState")
            except Exception:
                time.sleep(0.15)
                continue
            if state == "complete":
                return
            time.sleep(0.15)
        raise RuntimeError("页面加载超时")

    def eval(self, expr, timeout=60, await_promise=True):
        res = self.call("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": await_promise,
            "userGesture": True}, timeout=timeout)
        if "exceptionDetails" in res:
            raise RuntimeError("JS 异常: " + json.dumps(res["exceptionDetails"], ensure_ascii=False)[:800])
        return res.get("result", {}).get("value")

    def invoke(self, fn, timeout=60):
        """执行一段函数表达式并返回值。"""
        return self.eval("(" + fn + ")()", timeout=timeout)

    def wait_for(self, expr, timeout=30, interval=0.15, label=""):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.invoke(expr, timeout=10):
                    return True
            except Exception:
                pass
            time.sleep(interval)
        raise RuntimeError("等待条件超时: " + (label or expr))

    def screenshot(self, path):
        data = self.call("Page.captureScreenshot", {"format": "png"})["data"]
        import base64
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data))

    def close(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
        if self._owned_dir:
            shutil.rmtree(self.user_data_dir, ignore_errors=True)
