(() => {
  // Read aggregate media state only. Never inspect cookies, account data or media URLs.
  const videos = [...document.querySelectorAll('video')];
  const visibleArea = video => {
    const r = video.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  };
  const candidates = videos.filter(video => visibleArea(video) > 0);
  const video = candidates.sort((a, b) =>
    Number(!b.paused) - Number(!a.paused) || visibleArea(b) - visibleArea(a))[0];
  if (!video) return JSON.stringify({ found: false, count: videos.length });
  const q = video.getVideoPlaybackQuality?.();
  let ahead = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
      ahead = video.buffered.end(i) - video.currentTime;
      break;
    }
  }
  return JSON.stringify({
    found: true,
    count: videos.length,
    paused: video.paused,
    ended: video.ended,
    time: Math.round(video.currentTime * 10) / 10,
    width: video.videoWidth,
    height: video.videoHeight,
    ready: video.readyState,
    network: video.networkState,
    buffered: Math.round(ahead * 10) / 10,
    total: q?.totalVideoFrames ?? null,
    dropped: q?.droppedVideoFrames ?? null,
    error: video.error?.code ?? null
  });
})();
