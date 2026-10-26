const port=Number(process.argv[2]);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Pass the forwarded app port.');
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&/^https:\/\/www\.douyin\.com\//.test(t.url));
if(!target)throw new Error('App page not found');
const endpoint=new URL(target.webSocketDebuggerUrl);
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Non-local endpoint');
const socket=new WebSocket(endpoint);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
let id=0;const pending=new Map();
socket.onmessage=e=>{const m=JSON.parse(e.data);if(!pending.has(m.id))return;const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)};
function send(method,params={}){return new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>{pending.delete(current);reject(new Error('Timeout '+method))},10000);pending.set(current,{resolve,reject,timer});socket.send(JSON.stringify({id:current,method,params}))})}
try{
  await send('DOM.enable');await send('CSS.enable');
  const doc=await send('DOM.getDocument',{depth:0});
  const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-e2e="feed-active-video"] #videoSideCard'});
  if(!node.nodeId)throw new Error('Comment side card not found');
  const matched=await send('CSS.getMatchedStylesForNode',{nodeId:node.nodeId});
  const rules=matched.matchedCSSRules.map(x=>x.rule);
  console.log(JSON.stringify(rules.filter(r=>r.selectorList.text.includes('uohyxQ4z')).map(r=>({selector:r.selectorList.text,media:r.media?.map(m=>m.text),
    properties:r.style.cssProperties.filter(p=>/^(position|display|top|bottom|left|right|width|height|overflow|transform|z-index)$/.test(p.name)&&!p.range).map(p=>({name:p.name,value:p.value}))})),null,2));
  const snippets=[];
  for(const sheetId of new Set(rules.map(r=>r.styleSheetId).filter(Boolean))){
    const {text}=await send('CSS.getStyleSheetText',{styleSheetId:sheetId});
    const pattern=/uohyxQ4z/g;let match;
    while((match=pattern.exec(text))&&snippets.length<8)snippets.push(text.slice(Math.max(0,match.index-80),match.index+1000));
  }
  console.log(JSON.stringify({responsiveSnippets:snippets},null,2));
}finally{socket.close()}
