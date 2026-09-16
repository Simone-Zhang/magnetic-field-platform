// The same component is used in the hero and in the download center.
// Keep the APK at this stable URL when publishing subsequent versions.
const apkUrl = new URL('./downloads/magnetic-field-lab.apk', import.meta.url);
let availability;

async function checkApk() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(apkUrl, {
      method: 'HEAD', cache: 'no-cache', signal: controller.signal,
    });
    if (response.status === 404) return { state: 'pending' };
    if (!response.ok) return { state: 'error' };
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const length = response.headers.get('content-length');
    // Some static servers return their HTML fallback for missing files.
    if (type.includes('text/html') || length === '0') return { state: 'pending' };
    return { state: 'ready' };
  } catch {
    return { state: 'error' };
  } finally {
    clearTimeout(timeout);
  }
}

class AndroidDownload extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.setAttribute('aria-live', 'polite');
    this.render('checking');
    availability ||= checkApk();
    availability.then(result => this.render(result.state));
  }

  render(state) {
    const ready = state === 'ready';
    const control = document.createElement(ready ? 'a' : 'button');
    control.className = 'button android-download-control';
    if (ready) {
      control.href = apkUrl.href;
      control.download = 'magnetic-field-lab.apk';
      control.textContent = '下载安卓版 ↓';
      control.title = '下载 Android 触控版安装包（APK）';
    } else {
      control.type = 'button';
      control.disabled = true;
      control.textContent = state === 'checking' ? '正在检查安卓版…'
        : state === 'pending' ? '安卓 APK 待上传' : '安卓下载暂不可用';
      control.title = state === 'pending' ? '安卓安装包准备好后将在这里提供下载'
        : state === 'error' ? '暂时无法检查安装包，请稍后刷新页面' : '正在检查安装包';
    }
    this.dataset.state = state;
    this.replaceChildren(control);
  }
}

if (!customElements.get('android-download')) {
  customElements.define('android-download', AndroidDownload);
}
