// The APK is a GitHub Release asset because it exceeds the repository's
// 100 MB per-file limit. Both site entries use this verified public asset.
const apkUrl = new URL('https://github.com/Simone-Zhang/magnetic-field-platform/releases/download/v1.0.0-android/Android.Unity.apk');

class AndroidDownload extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.setAttribute('aria-live', 'polite');
    this.render('ready');
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
