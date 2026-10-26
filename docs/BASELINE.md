# 0.1 真机基线记录

日期：2026-10-26（Asia/Singapore）。阶段目标：验证系统 WebView 能否作为抖音专用浏览器的初始容器。

## 设备与容器

| 项目 | 读取结果 |
| --- | --- |
| 设备 | HUAWEI OCE-AN50 |
| Android | 12 / API 31 |
| 系统 WebView 提供程序 | `com.huawei.webview`，114.0.4.327 |
| 原型内实际 UA 的 Chromium 版本 | 114.0.5735.196 |
| 手机已安装 Chrome | 155.0.8059.39 |
| 原型 | 0.1.0-baseline，`io.github.puredouyin` |
| APK | 863,887 字节，debug 签名 |

没有改变系统 WebView 提供程序，没有安装模拟器。此版本没有自带 Chromium，也没有修改网页布局、推荐算法或播放器。

## 已完成验证

| 项目 | 结果与边界 |
| --- | --- |
| 构建 | `assembleDebug` 成功 |
| 静态检查 | `lintDebug` 成功：0 errors、12 warnings；主要涉及固定工具/目标版本、兼容性属性及中文字符串本地化 |
| 签名 | `apksigner verify --verbose` 通过，APK Signature Scheme v2 |
| 安装启动 | ADB 安装成功，冷启动约 983ms；该数值仅是原生 Activity 启动耗时，不是网页首屏时间 |
| 网页加载 | 官网首页与推荐视频页可加载；未注入手机适配 |
| 视频播放 | 推荐页实际解码并播放 1280×720 视频，无 media error |
| 切后台 | document visibility 变为 hidden，视频 paused=true，连续 3 次采样位置保持 82.3s |
| 恢复前台 | visibility 恢复 visible，页面保留，视频保持暂停；需要用户点击继续 |
| 日志 | 本次检查未发现本应用 AndroidRuntime 崩溃记录 |
| 诊断脚本 | 基础烟雾检查通过：无视频、排除屏幕外视频、选择可见播放视频、缓冲与帧数读取 |

### 短时播放样本

`artifacts/recommend-playback.json` 在手机上的原型 WebView 中采集，未开启应用内诊断面板。它包含 10 次采样，间隔约 1 秒：

- 首末时间跨度约 9.2 秒。
- 视频播放位置由 39.9s 推进至 49.0s。
- 累计视频帧由 1201 增至 1476，增量 275 帧。
- 累计丢帧保持 8，采样窗口内增量为 0；这不代表视频整个生命周期从未丢帧。
- `readyState` 保持 4，缓冲约 9.7–15.7s，未报告媒体错误。

这只是单设备、单片源的短时观测，不能据此认定长时间播放稳定，也没有完成与 Chrome 相同片源和画质的量化对照。

## 尚待验证

- 用户主观比较连续刷视频、切换与 Chrome 的流畅度。
- 完整登录流程、验证码、强制停止/手机重启后的登录保留。
- 搜索、评论输入、不同画质和编码、长时间播放、全屏及横竖屏切换。
- 在其他 Android/WebView 版本上的表现。

先根据连续使用反馈决定是否保留系统 WebView。若出现稳定可复现的性能差距，再进入自带 Chromium 的专用浏览器评估；若满足需求，再增加可关闭的手机布局与手势适配。

## 本地证据与构建入口

- `artifacts/pure-douyin-0.1.0-baseline-debug.apk`
- `artifacts/recommend-playback.json`
- `artifacts/background-playback.json`
- `artifacts/restored-playback.json`
- `app/build/reports/lint-results-debug.html`
- `scripts/build.ps1`、`scripts/install.ps1`、`scripts/probe.mjs`

`artifacts/` 中的生成结果被 Git 忽略。临时手机截图、UI 转储及调试转发在验证后清理。
