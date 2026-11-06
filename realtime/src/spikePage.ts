// Spike 自测页：连通性 / 双向消息 / 双端互通 / Hibernation 唤醒验证
// 部署后访问 https://<worker>.workers.dev/spike 使用
export const SPIKE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Combat Room Spike</title>
<style>
  body { font-family: ui-monospace, monospace; margin: 0; padding: 20px; background: #111; color: #ddd; }
  h1 { font-size: 16px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  input, button, select { background: #222; color: #ddd; border: 1px solid #444; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
  button { cursor: pointer; }
  #log { background: #000; border: 1px solid #333; border-radius: 8px; padding: 10px; height: 380px; overflow-y: auto; font-size: 12px; white-space: pre-wrap; }
  .ok { color: #4ade80; } .err { color: #f87171; } .dim { color: #888; }
</style>
</head>
<body>
<h1>Combat Room Spike（DO + WebSocket）</h1>
<div class="row">
  <input id="room" value="spike-1" placeholder="room id" />
  <input id="token" placeholder="JWT（本地 dev 可填 dev）" style="flex:1;min-width:240px" />
  <select id="role"><option value="dm">dm</option><option value="player">player</option></select>
  <button id="connect">连接</button>
  <button id="disconnect">断开</button>
</div>
<div class="row">
  <button id="ping">ping</button>
  <button id="echo">echo 广播</button>
  <button id="delta">发送 combat.delta（仅 dm）</button>
  <button id="snap">拉快照</button>
</div>
<div id="log"></div>
<script>
const log = (msg, cls) => {
  const el = document.getElementById('log');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = new Date().toLocaleTimeString() + '  ' + msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
};
let ws = null;
const base = location.host;
document.getElementById('connect').onclick = () => {
  const room = document.getElementById('room').value.trim();
  const token = document.getElementById('token').value.trim();
  const role = document.getElementById('role').value;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + base + '/room/' + encodeURIComponent(room) + '?token=' + encodeURIComponent(token) + '&role=' + role);
  ws.onopen = () => log('connected', 'ok');
  ws.onclose = (e) => log('closed code=' + e.code, 'err');
  ws.onerror = () => log('error', 'err');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    log('<- ' + JSON.stringify(msg).slice(0, 300), msg.t === 'error' ? 'err' : '');
  };
};
document.getElementById('disconnect').onclick = () => { if (ws) { ws.close(); ws = null; } };
document.getElementById('ping').onclick = () => ws && ws.send(JSON.stringify({ t: 'ping' }));
document.getElementById('echo').onclick = () => ws && ws.send(JSON.stringify({ t: 'echo', payload: { at: Date.now() } }));
document.getElementById('delta').onclick = () => ws && ws.send(JSON.stringify({ t: 'combat.delta', payload: { kind: 'spike', at: Date.now() } }));
document.getElementById('snap').onclick = () => ws && ws.send(JSON.stringify({ t: 'snapshot.request' }));
log('就绪。验证项：1) 连接成功 2) 两个标签页同房间互通 3) 闲置 70s 后 ping 仍回 pong（Hibernation 唤醒）', 'dim');
</script>
</body>
</html>`;
