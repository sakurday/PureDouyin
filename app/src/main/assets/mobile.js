(() => {
  if (window !== top || location.hostname !== 'www.douyin.com') return;
  if (window.__pureDouyinMobile) {
    document.getElementById('pure-douyin-mobile-style').textContent = window.__pureDouyinMobileConfig.css;
    window.__pureDouyinMobile.setEnabled(window.__pureDouyinMobileConfig.enabled);
    return;
  }
  const config = window.__pureDouyinMobileConfig;
  const selectors = {
    feed: '#slidelist', active: '[data-e2e="feed-active-video"]',
    videos: '[data-e2e="feed-active-video"], [data-e2e="feed-video"]',
    comments: '[data-e2e="comment-list"]',
    commentButton: '[data-e2e="feed-comment-icon"]',
    next: '[data-e2e="video-switch-next-arrow"]',
    previous: '[data-e2e="video-switch-prev-arrow"]'
  };
  let enabled = !!config.enabled;
  let frame = 0;
  let lastSwitch = 0;
  let touch;
  let activeMode = false;
  const style = document.createElement('style');
  style.id = 'pure-douyin-mobile-style';
  style.textContent = config.css;
  (document.head || document.documentElement).append(style);
  const mark = (e, name) => { if (e && !e.hasAttribute(name)) e.setAttribute(name, ''); };
  const visible = e => { const r = e?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; };

  function commentsOpen() {
    const list = document.querySelector(selectors.comments);
    const container = list?.closest('#videoSideCard') || list?.closest('[role="dialog"]') || list;
    return activeMode && visible(container);
  }
  function closeComments() {
    if (!commentsOpen()) return false;
    const button = document.querySelector(selectors.active)?.querySelector(selectors.commentButton);
    if (!button) return false;
    button.click();
    return true;
  }
  function adapt() {
    frame = 0;
    const feed = document.querySelector(selectors.feed);
    const mobile = enabled && !!feed;
    document.documentElement.classList.toggle('pd-mobile', mobile);
    activeMode = mobile;
    if (!mobile) return;
    const navigation = document.querySelector('[data-e2e="douyin-navigation"]');
    if (navigation) {
      let sidebar = navigation;
      while (sidebar.parentElement && sidebar.parentElement.id !== 'dark') sidebar = sidebar.parentElement;
      if (sidebar.parentElement?.id === 'dark' && !sidebar.contains(document.getElementById('douyin-right-container'))) mark(sidebar, 'data-pd-sidebar');
    }
    for (let p = feed.parentElement; p && p.id !== 'dark'; p = p.parentElement) mark(p, 'data-pd-layout');
    for (const item of document.querySelectorAll(selectors.videos)) {
      const video = item.querySelector('video');
      if (!video) continue;
      for (let p = video.parentElement; p && item.contains(p); p = p.parentElement) {
        mark(p, 'data-pd-fill'); if (p === item) break;
      }
      const digg = item.querySelector('[data-e2e="video-player-digg"]');
      const group = digg?.parentElement?.parentElement;
      const actions = group?.parentElement;
      if (actions && item.contains(actions) && group.querySelector(selectors.commentButton)) {
        mark(actions, 'data-pd-actions');
        for (const child of group.children) {
          const supported = '[data-e2e="video-avatar"],[data-e2e="video-player-digg"],[data-e2e="feed-comment-icon"],[data-e2e="video-player-collect"],[data-e2e="video-player-share"]';
          if (!child.querySelector(supported) && !child.matches(supported)) mark(child, 'data-pd-action-extra');
        }
      }
      const info = item.querySelector('[data-e2e="video-info"]');
      const player = video.closest('.douyin-player');
      if (info && player) {
        let p = info;
        while (p.parentElement && p.parentElement !== player) p = p.parentElement;
        if (p.parentElement === player) mark(p, 'data-pd-info');
      }
    }
  }
  function schedule() { if (!frame) frame = setTimeout(adapt, 160); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('root') || document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['data-e2e']
  });
  function switchVideo(direction) {
    if (!activeMode || commentsOpen() || performance.now() - lastSwitch < 550) return false;
    const button = document.querySelector(direction > 0 ? selectors.next : selectors.previous);
    if (!button) return false;
    lastSwitch = performance.now(); button.click(); return true;
  }
  document.addEventListener('touchstart', event => {
    touch = null;
    if (!activeMode || event.touches.length !== 1 || commentsOpen()) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(selectors.active)) return;
    if (target.closest('input,textarea,button,a,[contenteditable="true"],[data-pd-actions],[data-pd-info],[data-e2e="comment-list"]')) return;
    const p = event.touches[0];
    if (p.clientY > innerHeight - 56) return; // Leave the player's progress/controls alone.
    touch = { x: p.clientX, y: p.clientY, at: performance.now(), vertical: false };
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    const p = event.touches[0], dx = p.clientX-touch.x, dy = p.clientY-touch.y;
    if (Math.abs(dy)>18 && Math.abs(dy)>Math.abs(dx)*1.35) touch.vertical=true;
    if (touch.vertical) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true, passive: false });
  document.addEventListener('touchend', event => {
    const start = touch; touch = null;
    if (!start?.vertical || !event.changedTouches.length) return;
    const end = event.changedTouches[0], dy=end.clientY-start.y, dx=end.clientX-start.x;
    if (Math.abs(dy)>64 && Math.abs(dy)>Math.abs(dx)*1.35 && performance.now()-start.at<1000) {
      event.preventDefault(); event.stopPropagation(); switchVideo(dy<0 ? 1 : -1);
    }
  }, { capture: true, passive: false });
  document.addEventListener('touchcancel', () => { touch=null; }, { passive: true });
  window.__pureDouyinMobile = {
    setEnabled(value) { enabled=!!value; adapt(); },
    closeComments,
    navigate(name) {
      const link=[...document.querySelectorAll('[data-e2e="douyin-navigation"] a')].find(a=>a.textContent.trim()===name);
      if(!link) return false;
      link.click(); return true;
    },
    search(query) {
      const input=document.querySelector('[data-e2e="searchbar-input"]');
      const button=document.querySelector('[data-e2e="searchbar-button"]');
      if (!input || !button || !query.trim()) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(()=>button.click(),0); return true;
    },
    status() { return {enabled,active:activeMode,comments:commentsOpen(),width:innerWidth,height:innerHeight}; }
  };
  addEventListener('resize',schedule);
  adapt();
})();
