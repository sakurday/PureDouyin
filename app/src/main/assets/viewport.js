(() => {
  if (window !== top || location.hostname !== 'www.douyin.com' || !window.__pureDouyinViewportEnabled) return;
  const apply = () => {
    if (!document.head) return false;
    document.documentElement.classList.add('pd-narrow');
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.append(meta); }
    meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    if (!document.getElementById('pure-douyin-viewport-style')) {
      const style = document.createElement('style');
      style.id = 'pure-douyin-viewport-style';
      style.textContent = 'html.pd-narrow,html.pd-narrow body,html.pd-narrow #root,html.pd-narrow #dark,html.pd-narrow #douyin-right-container{min-width:0!important;max-width:100%!important;width:100%!important}html.pd-narrow,html.pd-narrow body{overflow-x:hidden!important}';
      document.head.append(style);
    }
    return true;
  };
  if (!apply()) {
    const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
    observer.observe(document, { childList:true, subtree:true });
  }
})();
