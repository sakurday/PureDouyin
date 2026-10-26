package io.github.puredouyin

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.Dialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import org.json.JSONTokener
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : Activity() {
    private val prefs by lazy { getSharedPreferences("browser", MODE_PRIVATE) }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var root: LinearLayout
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private lateinit var diagnostics: TextView
    private lateinit var progress: ProgressBar
    private lateinit var errorBar: TextView
    private lateinit var fullscreenHost: FrameLayout
    private lateinit var webContainer: FrameLayout
    private lateinit var bottomNav: LinearLayout
    private val navigationButtons = mutableMapOf<String, Button>()
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var popup: Dialog? = null
    private var popupWebView: WebView? = null
    private var resumed = false
    private var showDiagnostics = false
    private var pendingInitialFeed = false
    private var diagnosticGeneration = 0
    private val diagnosticScript by lazy { assets.open("playback-diagnostics.js").bufferedReader().use { it.readText() } }
    private val mobileScript by lazy { assets.open("mobile.js").bufferedReader().use { it.readText() } }
    private val mobileCss by lazy {
        listOf("mobile.css", "comments.css").joinToString("\n") { name -> assets.open(name).bufferedReader().use { it.readText() } }
    }
    private val viewportScript by lazy { assets.open("viewport.js").bufferedReader().use { it.readText() } }
    private val engine by lazy {
        WebView.getCurrentWebViewPackage()?.let { "${it.packageName} ${it.versionName}" } ?: "未知 WebView"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0)
        buildLayout()
        webView = createWebView()
        webContainer.addView(webView, FrameLayout.LayoutParams(-1, -1))
        Log.i(TAG, "Started version=${BuildConfig.VERSION_NAME}; engine=$engine; desktop=$desktop")
        val upgraded = prefs.getInt("last_version", 0) != BuildConfig.VERSION_CODE
        prefs.edit().putInt("last_version", BuildConfig.VERSION_CODE).apply()
        if (savedInstanceState == null || upgraded || webView.restoreState(savedInstanceState) == null) {
            pendingInitialFeed = mobileUi
            webView.loadUrl(BrowserPolicy.HOME)
        }
    }

    private val desktop: Boolean get() = prefs.getBoolean("desktop", true)
    private val thirdPartyCookies: Boolean get() = prefs.getBoolean("third_party_cookies", false)
    private val mobileUi: Boolean get() = prefs.getBoolean("mobile_ui", true)

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun buildLayout() {
        val frame = FrameLayout(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(16, 19, 24))
        }
        val toolbar = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(6), 0)
        }
        val title = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        title.addView(TextView(this).apply {
            text = "纯净浏览"
            textSize = 15f
            setTextColor(Color.WHITE)
        })
        status = TextView(this).apply {
            text = "手机界面 · 官网播放器"
            textSize = 9f
            setTextColor(Color.rgb(164, 179, 188))
        }
        title.addView(status)
        toolbar.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        toolbar.addView(Button(this).apply {
            text = "工具"
            contentDescription = "浏览工具与播放诊断"
            setTextColor(Color.rgb(99, 220, 195))
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { showTools(it) }
        }, LinearLayout.LayoutParams(dp(72), dp(44)))
        root.addView(toolbar, LinearLayout.LayoutParams(-1, dp(46)))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(2)))
        diagnostics = TextView(this).apply {
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setTextColor(Color.rgb(99, 220, 195))
            textSize = 11f
            visibility = View.GONE
            setTextIsSelectable(true)
        }
        root.addView(diagnostics, LinearLayout.LayoutParams(-1, -2))
        errorBar = TextView(this).apply {
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(93, 43, 50))
            visibility = View.GONE
            setOnClickListener { webView.reload() }
        }
        root.addView(errorBar, LinearLayout.LayoutParams(-1, -2))
        webContainer = FrameLayout(this)
        root.addView(webContainer, LinearLayout.LayoutParams(-1, 0, 1f))
        bottomNav = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.rgb(16, 19, 24))
            visibility = if (mobileUi) View.VISIBLE else View.GONE
        }
        listOf("推荐", "关注", "搜索", "我的").forEach { name ->
            val button = Button(this).apply {
                text = name
                textSize = 14f
                setTextColor(Color.rgb(164, 179, 188))
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener {
                    if (name == "搜索") showSearch() else navigateSection(name)
                }
            }
            navigationButtons[name] = button
            bottomNav.addView(button, LinearLayout.LayoutParams(0, dp(52), 1f))
        }
        root.addView(bottomNav, LinearLayout.LayoutParams(-1, dp(52)))
        frame.addView(root, FrameLayout.LayoutParams(-1, -1))
        fullscreenHost = FrameLayout(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.BLACK)
        }
        frame.addView(fullscreenHost, FrameLayout.LayoutParams(-1, -1))
        setContentView(frame)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(isPopup: Boolean = false): WebView = WebView(this).apply {
        val browser = this
        setBackgroundColor(Color.BLACK)
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = !mobileUi
            loadWithOverviewMode = !mobileUi
            builtInZoomControls = true
            displayZoomControls = false
            setSupportZoom(!mobileUi)
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = false
            if (desktop) userAgentString = BrowserPolicy.desktopUserAgent(userAgentString)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(browser, thirdPartyCookies)
        }
        if (mobileUi && !isPopup && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(browser, "window.__pureDouyinViewportEnabled=true;\n$viewportScript", setOf("https://www.douyin.com"))
            Log.i(TAG, "Mobile viewport injection: document start")
        }
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                if (BrowserPolicy.isInternal(uri)) return false
                if (uri.toString() == "about:blank") return false
                if (request.hasGesture() && (uri.scheme == "https" || uri.scheme == "http")) {
                    confirmExternalLink(uri)
                } else {
                    Toast.makeText(this@MainActivity, "已阻止离开抖音页面；需要时可用 Chrome 打开", Toast.LENGTH_SHORT).show()
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                if (!isPopup) {
                    errorBar.visibility = View.GONE
                    status.text = "${if (desktop) "桌面" else "移动"}网页 · 加载中"
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                CookieManager.getInstance().flush()
                if (!isPopup) {
                    injectMobileUi(view)
                    if (pendingInitialFeed) requestInitialFeed(view)
                    status.text = "${if (mobileUi) "手机界面" else "原始网页"} · WebView ${WebView.getCurrentWebViewPackage()?.versionName}"
                    val path = url?.let { Uri.parse(it).path } ?: "/"
                    val selected = when { path.startsWith("/follow") -> "关注"; path.startsWith("/user") -> "我的"; path.startsWith("/search") -> "搜索"; else -> "推荐" }
                    navigationButtons.forEach { (name, button) -> button.setTextColor(if (name == selected) Color.rgb(99, 220, 195) else Color.rgb(164, 179, 188)) }
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame && !isPopup) {
                    errorBar.text = "页面加载失败（${error.errorCode}），点此重试"
                    errorBar.visibility = View.VISIBLE
                    Log.w(TAG, "Main frame load failed code=${error.errorCode}")
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                Log.e(TAG, "Renderer exited; crashed=${detail.didCrash()}")
                if (isPopup) {
                    popup?.dismiss()
                } else {
                    hideFullscreen()
                    webContainer.removeView(view)
                    view.destroy()
                    webView = createWebView()
                    webContainer.addView(webView, FrameLayout.LayoutParams(-1, -1))
                    errorBar.text = "网页进程已退出，点此重新加载"
                    errorBar.visibility = View.VISIBLE
                }
                return true
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (!isPopup) {
                    this@MainActivity.progress.progress = newProgress
                    this@MainActivity.progress.visibility = if (newProgress == 100) View.GONE else View.VISIBLE
                }
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenCallback != null) { callback.onCustomViewHidden(); return }
                fullscreenCallback = callback
                fullscreenHost.addView(view, FrameLayout.LayoutParams(-1, -1))
                fullscreenHost.visibility = View.VISIBLE
                root.visibility = View.GONE
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
            }

            override fun onHideCustomView() = hideFullscreen()

            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                if (!isUserGesture || popup != null) return false
                val child = createWebView(true)
                val dialog = Dialog(this@MainActivity)
                popupWebView = child
                popup = dialog
                dialog.setContentView(child)
                dialog.setOnDismissListener {
                    child.stopLoading()
                    child.destroy()
                    popup = null
                    popupWebView = null
                }
                dialog.show()
                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                (resultMsg.obj as WebView.WebViewTransport).webView = child
                resultMsg.sendToTarget()
                return true
            }

            override fun onCloseWindow(window: WebView) { if (isPopup) popup?.dismiss() }
        }
    }

    private fun showTools(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, "刷新页面")
            menu.add(0, 2, 1, "返回推荐首页")
            menu.add(0, 8, 2, "手机界面").apply { isCheckable = true; isChecked = mobileUi }
            menu.add(0, 3, 3, "请求桌面网页").apply { isCheckable = true; isChecked = desktop }
            menu.add(0, 4, 3, "播放诊断").apply { isCheckable = true; isChecked = showDiagnostics }
            menu.add(0, 5, 4, "用 Chrome 对照打开")
            menu.add(0, 6, 5, "允许第三方 Cookie").apply { isCheckable = true; isChecked = thirdPartyCookies }
            menu.add(0, 7, 6, "关于此原型")
            setOnMenuItemClickListener {
                when (it.itemId) {
                    1 -> webView.reload()
                    2 -> navigateSection("推荐")
                    3 -> {
                        prefs.edit().putBoolean("desktop", !desktop).apply()
                        val defaultAgent = WebSettings.getDefaultUserAgent(this@MainActivity)
                        webView.settings.userAgentString = if (desktop) BrowserPolicy.desktopUserAgent(defaultAgent) else defaultAgent
                        webView.reload()
                    }
                    4 -> {
                        showDiagnostics = !showDiagnostics
                        diagnostics.visibility = if (showDiagnostics) View.VISIBLE else View.GONE
                        diagnosticGeneration++
                        if (showDiagnostics) sampleDiagnostics(diagnosticGeneration)
                    }
                    5 -> {
                        val uri = Uri.parse(webView.url ?: BrowserPolicy.HOME)
                        if (BrowserPolicy.isInternal(uri)) openBrowser(uri, true)
                    }
                    6 -> {
                        prefs.edit().putBoolean("third_party_cookies", !thirdPartyCookies).apply()
                        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, thirdPartyCookies)
                        popupWebView?.let { child -> CookieManager.getInstance().setAcceptThirdPartyCookies(child, thirdPartyCookies) }
                        webView.reload()
                    }
                    7 -> AlertDialog.Builder(this@MainActivity)
                        .setTitle("纯净浏览 ${BuildConfig.VERSION_NAME}")
                        .setMessage("$engine\n\n请求桌面网页，同时使用手机布局视口。推荐页提供手机布局与上下滑，评论沿用官网组件并在竖屏时移到底部。\n\n评论重排参考 WhiteSevs「抖音优化」2026.10.23，GPL-3.0-only。项目许可证与来源说明随源码提供。\n\n可关闭「手机界面」恢复宽视口原网页。登录数据保存在本应用内，与 Chrome 独立。\n\n播放诊断仅读取媒体状态，关闭后停止采样。调试版允许 USB 网页调试。")
                        .setNeutralButton("开源许可") { _, _ ->
                            val license = listOf("third-party.txt", "LICENSE.txt").joinToString("\n\n") { name ->
                                assets.open(name).bufferedReader().use { reader -> reader.readText() }
                            }
                            AlertDialog.Builder(this@MainActivity).setTitle("开源许可与来源").setMessage(license).setPositiveButton("关闭", null).show()
                        }.setPositiveButton("知道了", null).show()
                    8 -> {
                        prefs.edit().putBoolean("mobile_ui", !mobileUi).apply()
                        bottomNav.visibility = if (mobileUi) View.VISIBLE else View.GONE
                        webView.settings.setSupportZoom(!mobileUi)
                        recreateBrowser()
                    }
                }
                true
            }
            show()
        }
    }

    private fun injectMobileUi(view: WebView) {
        val uri = view.url?.let(Uri::parse) ?: return
        if (uri.scheme != "https" || uri.host != "www.douyin.com") return
        val config = JSONObject().put("enabled", mobileUi).put("css", mobileCss)
        view.evaluateJavascript("window.__pureDouyinViewportEnabled=$mobileUi;\n$viewportScript\nwindow.__pureDouyinMobileConfig=$config;\n$mobileScript", null)
    }

    private fun recreateBrowser() {
        val url = webView.url?.takeIf { BrowserPolicy.isInternal(Uri.parse(it)) } ?: BrowserPolicy.HOME
        popup?.dismiss()
        hideFullscreen()
        webContainer.removeView(webView)
        webView.destroy()
        webView = createWebView()
        webContainer.addView(webView, FrameLayout.LayoutParams(-1, -1))
        webView.loadUrl(url)
    }

    private fun navigateSection(name: String) {
        val argument = JSONObject.quote(name)
        webView.evaluateJavascript("window.__pureDouyinMobile?.navigate($argument) || false") { handled ->
            if (handled != "true") webView.loadUrl(when (name) {
                "关注" -> "https://www.douyin.com/follow?from_nav=1"
                "我的" -> "https://www.douyin.com/user/self?from_nav=1"
                else -> BrowserPolicy.HOME
            })
        }
    }

    private fun requestInitialFeed(view: WebView, attempt: Int = 0) {
        if (!pendingInitialFeed || view !== webView || attempt >= 25 || !resumed) return
        view.evaluateJavascript("!!document.querySelector('#slidelist') || (window.__pureDouyinMobile?.navigate('推荐') || false)") { handled ->
            if (handled == "true") pendingInitialFeed = false
            else handler.postDelayed({ requestInitialFeed(view, attempt + 1) }, 200)
        }
    }

    private fun showSearch() {
        val input = EditText(this).apply {
            hint = "搜索视频、用户"
            isSingleLine = true
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        val dialog = AlertDialog.Builder(this).setTitle("搜索抖音").setView(input)
            .setPositiveButton("搜索") { _, _ ->
                val query = input.text.toString().trim()
                if (query.isNotEmpty()) {
                    val argument = JSONObject.quote(query)
                    webView.evaluateJavascript("window.__pureDouyinMobile?.search($argument) || false") { result ->
                        if (result != "true") Toast.makeText(this, "页面尚未就绪，请稍后重试", Toast.LENGTH_SHORT).show()
                    }
                }
            }.setNegativeButton("取消", null).create()
        dialog.setOnShowListener {
            input.requestFocus()
            dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        }
        dialog.show()
    }

    private fun sampleDiagnostics(generation: Int) {
        if (!resumed || !showDiagnostics || generation != diagnosticGeneration) return
        webView.evaluateJavascript(diagnosticScript) { raw ->
            if (!resumed || !showDiagnostics || generation != diagnosticGeneration) return@evaluateJavascript
            try {
                val data = JSONObject(JSONTokener(raw).nextValue() as String)
                diagnostics.text = if (!data.optBoolean("found")) {
                    "$engine\n未发现可见视频 · 页面 video 元素 ${data.optInt("count")} 个"
                } else {
                    val state = if (data.optBoolean("paused")) "暂停" else "播放"
                    "$state · ${data.optInt("width")}×${data.optInt("height")} · ${data.optDouble("time")}s\n" +
                        "累计帧 ${data.opt("total")} · 丢帧 ${data.opt("dropped")} · 缓冲 ${data.optDouble("buffered")}s\n" +
                        "readyState ${data.optInt("ready")} · 错误 ${data.opt("error")}"
                }
                Log.i(TAG, "Playback $data")
            } catch (_: Exception) {
                diagnostics.text = "页面尚未就绪，正在等待视频…"
            }
            handler.postDelayed({ sampleDiagnostics(generation) }, 1000)
        }
    }

    private fun confirmExternalLink(uri: Uri) {
        AlertDialog.Builder(this).setTitle("在浏览器中打开外部页面？")
            .setMessage(uri.host ?: "外部网站")
            .setPositiveButton("打开") { _, _ -> openBrowser(uri, false) }
            .setNegativeButton("取消", null).show()
    }

    private fun openBrowser(uri: Uri, chrome: Boolean) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                if (chrome) setPackage("com.android.chrome")
            })
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "未找到可用浏览器", Toast.LENGTH_SHORT).show()
        }
    }

    private fun hideFullscreen() {
        if (fullscreenCallback == null) return
        fullscreenHost.removeAllViews()
        fullscreenHost.visibility = View.GONE
        root.visibility = View.VISIBLE
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        val callback = fullscreenCallback
        fullscreenCallback = null
        callback?.onCustomViewHidden()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        webView.resumeTimers()
        webView.onResume()
        popupWebView?.onResume()
        if (showDiagnostics) sampleDiagnostics(++diagnosticGeneration)
        if (pendingInitialFeed) requestInitialFeed(webView)
    }

    override fun onPause() {
        resumed = false
        diagnosticGeneration++
        handler.removeCallbacksAndMessages(null)
        listOfNotNull(webView, popupWebView).forEach {
            it.evaluateJavascript("document.querySelectorAll('video,audio').forEach(v=>v.pause())", null)
            it.onPause()
        }
        webView.pauseTimers()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Legacy back dispatch is used for API 26 compatibility")
    override fun onBackPressed() {
        when {
            fullscreenCallback != null -> hideFullscreen()
            mobileUi -> webView.evaluateJavascript("window.__pureDouyinMobile?.closeComments() || false") { closed ->
                if (closed != "true") navigateBack()
            }
            else -> navigateBack()
        }
    }

    private fun navigateBack() {
        if (webView.canGoBack()) webView.goBack() else finish()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        popup?.dismiss()
        hideFullscreen()
        webContainer.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    companion object { private const val TAG = "PureDouyin" }
}
