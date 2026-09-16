# 更新实验程序下载

网站首页和下载区共用安卓下载入口，目前没有 APK，会显示“安卓 APK 待上传”。

## 安卓版

1. 等 Unity 的 APK 构建成功。
2. 将安装包复制到本目录，命名为 `magnetic-field-lab.apk`。
3. 将 APK 和网站改动一起推送，等待 GitHub Pages 部署完成。
4. 刷新网站，两个安卓入口会检查文件是否存在；存在后显示“下载安卓版”。

入口地址为 `./downloads/magnetic-field-lab.apk`。以后更新安卓版本时替换同名文件即可，不需要修改两个页面入口。当前并未放入占位 APK。

## 电脑版

保留现有文件名：`基于Unity的电磁感应法测交变磁场的虚拟仿真平台.zip`。
更新时把 exe 和配套数据文件夹一起压缩，替换本目录中的同名 ZIP。

## 发布检查

- `index.html`、`android-download.js`、`android-download.css` 要一起提交。
- APK 下载后应为实际安装包，安装测试需要安卓设备；iPhone 不能安装 APK。
- 浏览器网页版仍使用 `webgl/`，不受本次下载入口修改影响。
