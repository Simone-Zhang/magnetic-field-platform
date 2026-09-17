(() => {
  'use strict';
  const canvas = document.getElementById('unity-canvas');
  const loading = document.getElementById('loading');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const fullscreen = document.getElementById('fullscreen');
  const hint = document.getElementById('window-hint');
  const retry = document.getElementById('retry');
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let finished = false, failed = false, lastProgress = Date.now(), amount = 0;
  const config = window.labConfig;
  // Use the phone's native pixel density; do not lower mobile image quality.
  config.devicePixelRatio = mobile ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 2);
  const nativeFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
  function updateFullscreen() {
    fullscreen.textContent = nativeFullscreen() || document.body.classList.contains('expanded')
      ? '退出放大' : '全屏 / 放大';
  }
  function expandInPage() {
    document.body.classList.add('expanded');
    hint.textContent = '已铺满浏览器窗口；当前浏览器不支持网页原生全屏，请横屏使用。';
    updateFullscreen();
  }
  fullscreen.onclick = async () => {
    if (nativeFullscreen()) {
      try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      catch (_) { hint.textContent = '请使用浏览器的退出全屏操作。'; }
      updateFullscreen();
      return;
    }
    if (document.body.classList.contains('expanded')) {
      document.body.classList.remove('expanded'); hint.textContent = ''; updateFullscreen(); return;
    }
    const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (!request || document.fullscreenEnabled === false) { expandInPage(); return; }
    try { await request.call(document.documentElement); updateFullscreen(); }
    catch (_) { expandInPage(); return; }
    // Rotation lock is optional, and must never cancel a successful fullscreen.
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); }
    catch (_) { hint.textContent = '请手动横屏；浏览器未允许自动旋转。'; }
  };
  document.addEventListener('fullscreenchange', updateFullscreen);
  document.addEventListener('webkitfullscreenchange', updateFullscreen);
  function fail(message) {
    failed = true; clearInterval(watchdog);
    loading.hidden = false; retry.hidden = false;
    document.body.classList.remove('running');
    status.textContent = message;
  }
  retry.onclick = () => window.location.reload();
  const watchdog = setInterval(() => {
    if (!finished && !failed && Date.now() - lastProgress > 30000) {
      status.textContent = amount >= .9
        ? '正在初始化实验。如果长时间无响应，请关闭其他标签页后重试；也可能是设备内存或浏览器兼容问题。'
        : '下载暂时没有新进度，请检查网络；可继续等待或重新加载。';
      retry.hidden = false;
    }
  }, 5000);
  config.showBanner = (message, type) => {
    if (type === 'error') fail('实验运行错误：' + String(message));
    else if (type === 'warning') hint.textContent = String(message);
  };
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fail('图形上下文已丢失，实验无法继续。请关闭其他标签页后重新加载；未导出的数据可能丢失。');
  });
  if (typeof WebAssembly === 'undefined') {
    fail('此浏览器不支持 WebAssembly，无法启动实验。'); return;
  }
  const script = document.createElement('script');
  script.src = window.labLoaderUrl;
  script.onerror = () => fail('实验加载器下载失败，请检查网络或网站文件是否上传完整。');
  script.onload = () => {
    try {
      createUnityInstance(canvas, config, value => {
        if (value !== amount) lastProgress = Date.now();
        amount = value; progress.value = value;
        if (!failed) status.textContent = value >= .9
          ? '资源已接近就绪，正在解压和初始化实验…'
          : '正在下载实验资源：' + Math.round(value * 100) + '%（首次加载较慢）';
      }).then(instance => {
        if (failed) return;
        finished = true; clearInterval(watchdog);
        loading.hidden = true; document.body.classList.add('running');
        // Keep the external fullscreen button available after loading.
      }).catch(error => fail('实验加载失败：' + String(error)));
    } catch (error) { fail('实验启动失败：' + String(error)); }
  };
  document.body.appendChild(script);
})();
