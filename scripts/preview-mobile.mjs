import { readFile } from 'node:fs/promises';
const port=Number(process.argv[2]);
if (!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Pass the forwarded app port.');
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page' && /^https:\/\/www\.douyin\.com\//.test(t.url));
if(!target) throw new Error('App Douyin page not found.');
const endpoint=new URL(target.webSocketDebuggerUrl);
if(!['127.0.0.1','localhost'].includes(endpoint.hostname)) throw new Error('Non-local endpoint.');
const socket=new WebSocket(endpoint);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;
function evaluate(expression) {
  const current=++id;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Evaluation timed out')),10000);
    socket.onmessage=e=>{
      const m=JSON.parse(e.data); if(m.id!==current)return;
      clearTimeout(timeout);
      if(m.error || m.result.exceptionDetails) reject(new Error(m.error?.message || m.result.exceptionDetails.text));
      else resolve(m.result.result.value);
    };
    socket.send(JSON.stringify({id:current,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
}
try {
  if(process.argv.includes('--native')) await evaluate(`(() => {
    window.__pureDouyinMobile?.setEnabled(false);
    let meta=document.querySelector('meta[name="viewport"]');
    if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.append(meta);}
    meta.content='width=device-width, initial-scale=1, viewport-fit=cover';
    dispatchEvent(new Event('resize'));
  })()`);
  if(process.argv.includes('--narrow')) await evaluate(`(() => {
    window.__pureDouyinMobile?.setEnabled(false);
    let meta=document.querySelector('meta[name="viewport"]');
    if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.append(meta);}
    meta.content='width=device-width, initial-scale=1, viewport-fit=cover';
    let style=document.getElementById('pure-douyin-narrow-trial');
    if(!style){style=document.createElement('style');style.id='pure-douyin-narrow-trial';document.head.append(style);}
    style.textContent='html,body,#root,#dark,#douyin-right-container{min-width:0!important;max-width:100%!important;width:100%!important}html,body{overflow-x:hidden!important}';
    dispatchEvent(new Event('resize'));
  })()`);
  if(process.argv.includes('--recommend')) await evaluate(`(() => {
    const link=[...document.querySelectorAll('[data-e2e="douyin-navigation"] a')].find(a=>a.textContent.trim()==='推荐');
    link?.click(); return !!link;
  })()`);
  if (process.argv.includes('--enable')) {
    const css=(await readFile(new URL('../app/src/main/assets/mobile.css',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../app/src/main/assets/comments.css',import.meta.url),'utf8'));
    const script=await readFile(new URL('../app/src/main/assets/mobile.js',import.meta.url),'utf8');
    await evaluate(`window.__pureDouyinMobileConfig=${JSON.stringify({enabled:true,css})};${script}`);
  }
  if(process.argv.includes('--disable')) await evaluate('window.__pureDouyinMobile?.setEnabled(false)');
  if(process.argv.includes('--close-comments')) await evaluate('window.__pureDouyinMobile?.closeComments()');
  if(process.argv.includes('--comments')) await evaluate('document.querySelector(\'[data-e2e="feed-active-video"] [data-e2e="feed-comment-icon"]\')?.click()');
  await new Promise(resolve=>setTimeout(resolve,700));
  const result=await evaluate(`(() => {
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round)};
    const active=document.querySelector('[data-e2e="feed-active-video"]');
    const videos=[...document.querySelectorAll('video')];
    return {status:window.__pureDouyinMobile?.status(),
      nativeViewport:{width:innerWidth,visualWidth:visualViewport?.width,bodyWidth:document.body?.scrollWidth,
        clientWidth:document.documentElement.clientWidth,media400:matchMedia('(max-width:400px)').matches},
      route:{path:location.pathname,recommend:new URLSearchParams(location.search).get('recommend'),ready:document.readyState},
      activeIndex:[...document.querySelectorAll('[data-e2e="feed-item"]')].findIndex(e=>e.contains(active)),
      active:rect(active),video:rect(active?.querySelector('video')),
      actions:rect(active?.querySelector('[data-pd-actions]')),
      info:rect(active?.querySelector('[data-pd-info]')),
      comments:rect(active?.querySelector('[data-pd-comment-sheet]')),
      nativeComments:rect(document.querySelector('[data-e2e="comment-list"]')),
      nativeSideCard:rect(active?.querySelector('#videoSideCard')),
      responsiveRules:${process.argv.includes('--responsive-rules')} ? (()=>{
        const card=active?.querySelector('#videoSideCard');
        const needle=card?.classList[0]; const rules=[], inaccessible=[];
        function walk(list,media='') {for(const r of list){
          if(r.selectorText && (r.selectorText.includes('lowPopup') || r.selectorText.includes('videoSideCard') || (needle && r.selectorText.includes('.'+needle))))
            rules.push({selector:r.selectorText,style:r.style.cssText.slice(0,1600),media});
          if(r.cssRules)walk(r.cssRules,r.conditionText||media);
        }}
        for(const s of document.styleSheets){try{walk(s.cssRules)}catch{inaccessible.push(s.href?new URL(s.href).hostname:'inline')}}
        return {metrics:{outerWidth,screenWidth:screen.width,client:document.documentElement.clientWidth,coarse:matchMedia('(pointer:coarse)').matches},
          cardClass:card?.className,playerClass:active?.querySelector('.basePlayerContainer')?.className,rules:rules.slice(0,35),inaccessible};
      })():undefined,
      navigationVisible:!!document.querySelector('[data-e2e="douyin-navigation"]')?.offsetWidth,
      media:videos.map(v=>({paused:v.paused,ready:v.readyState,error:v.error?.code??null})),
      structure:${process.argv.includes('--structure')} ? (()=>{
        const describe=e=>({tag:e.tagName,cls:String(e.className).slice(0,180),e2e:e.getAttribute('data-e2e'),rect:rect(e),
          style:e.getAttribute('style'),transform:getComputedStyle(e).transform,display:getComputedStyle(e).display,
          extra:e.hasAttribute('data-pd-action-extra')});
        const ancestors=[];for(let e=active;e && ancestors.length<6;e=e.parentElement)ancestors.push(describe(e));
        return {ancestors,actions:[...(active?.querySelector('[data-pd-actions]')?.querySelectorAll('div')||[])].slice(0,18).map(describe)};
      })():undefined};
  })()`);
  console.log(JSON.stringify(result,null,2));
} finally {socket.close();}
