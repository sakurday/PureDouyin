// Development-only structural inspection. Does not collect account data or media URLs.
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Pass the forwarded app port.');
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
const target = targets.find(t => t.type === 'page' && /^https:\/\/www\.douyin\.com\//.test(t.url));
if (!target) throw new Error('App Douyin page not found.');
const endpoint = new URL(target.webSocketDebuggerUrl);
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Non-local endpoint.');
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const response = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('DOM inspection timed out')), 10000);
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id !== 1) return;
    clearTimeout(timeout);
    if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
  };
});
socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
  returnByValue: true,
  awaitPromise: true,
  expression: `(async () => {
    if (${process.argv.includes('--comments')}) {
      document.querySelector('[data-e2e="feed-active-video"] [data-e2e="feed-comment-icon"]')?.click();
      await new Promise(resolve => setTimeout(resolve,600));
    }
    const describe = e => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0,350),
        e2e: e.getAttribute('data-e2e'), role: e.getAttribute('role'),
        bounds: [r.x,r.y,r.width,r.height].map(Math.round),
        display: s.display, position: s.position, overflow: s.overflow };
    };
    const active = [...document.querySelectorAll('video')].find(v => {
      const r = v.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
    });
    let e = active;
    const ancestors = [];
    while (e && ancestors.length < 24) { ancestors.push(describe(e)); e = e.parentElement; }
    const e2e = {};
    document.querySelectorAll('[data-e2e]').forEach(e => {
      const name = e.getAttribute('data-e2e'); e2e[name] = (e2e[name] || 0) + 1;
    });
    const navigation = [...document.querySelectorAll('a')].filter(a => ['推荐','关注','搜索','我的','精选'].includes(a.textContent.trim()))
      .map(a => ({ name: a.textContent.trim(), path: new URL(a.href,location.href).pathname, search: new URL(a.href,location.href).search, ...describe(a) }));
    const controls = active ? [...active.closest('[data-e2e="feed-active-video"]').querySelectorAll('button,[role=button],[aria-label],[data-e2e]')].slice(0,80)
      .map(e => ({ ...describe(e), aria: e.getAttribute('aria-label') })) : [];
    const search = document.querySelector('[data-e2e="searchbar-input"]');
    const searchAncestors = [];
    for (let p = search; p && searchAncestors.length < 12; p = p.parentElement) searchAncestors.push(describe(p));
    const extra = {};
    for (const name of ['video-player-digg','video-info']) {
      let p = active?.closest('[data-e2e="feed-active-video"]')?.querySelector('[data-e2e="'+name+'"]');
      extra[name] = [];
      for (let i=0;p && i<4;i++,p=p.parentElement) extra[name].push(describe(p));
    }
    extra.playerChildren = [...(active?.closest('.douyin-player')?.children || [])].map(describe);
    extra.comments = [...document.querySelectorAll('[data-e2e]')].filter(e => /comment/i.test(e.getAttribute('data-e2e')))
      .slice(0,14).map(e => ({ ...describe(e), parents: [e.parentElement,e.parentElement?.parentElement].filter(Boolean).map(describe) }));
    const commentAncestors=[];
    for(let p=document.querySelector('[data-e2e="comment-list"]');p && commentAncestors.length<8;p=p.parentElement) commentAncestors.push(describe(p));
    if (${process.argv.includes('--panel')}) return {navigation,commentAncestors};
    return ${process.argv.includes('--compact')} ? { e2e, extra, searchAncestors } : { path: location.pathname, viewport: [innerWidth,innerHeight], ancestors, e2e, navigation, controls, searchAncestors, extra };
  })()`
} }));
try { console.log(JSON.stringify((await response).result.value, null, 2)); }
finally { socket.close(); }
