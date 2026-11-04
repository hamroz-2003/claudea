package com.example.flowcraftmobile

import android.Manifest
import android.annotation.SuppressLint
import android.annotation.TargetApi
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.MimeTypeMap
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/**
 * FlowCraft Studio — yagona oyna. Butun interfeys assets/index.html (WebView) da,
 * bu klass esa xavfsiz "qobiq": navigatsiya, fayl tanlash, orqaga tugmasi, tizim panellari,
 * renderer qulashi va video saqlash ko'prigi.
 *
 * MUHIM: sahifa manzili `file:///android_asset/index.html` ATAYLAB o'zgartirilmagan —
 * barcha loyihalar, qurilma ID va litsenziya kaliti shu manzil (origin) ning IndexedDB xotirasida.
 * Manzil o'zgarsa foydalanuvchi ma'lumotlari "yo'qoladi".
 */
class MainActivity : Activity(), WebAppBridge.Host {

    private lateinit var root: FrameLayout
    private var webView: WebView? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var backCallback: Any? = null // OnBackInvokedCallback (API 33+)
    private var lastBackPressAt = 0L

    /** Hozirgi sahifa ilovaning o'zinikimi — JS ko'prigi oqimidan o'qiladi. */
    @Volatile
    private var trustedPage = false

    override val saver: VideoSaver by lazy { VideoSaver(applicationContext) }

    // ================================================================ hayot sikli

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        VideoSaver.cleanupStaleTemp(cacheDir)

        root = FrameLayout(this).apply { setBackgroundColor(BG_COLOR) }
        setContentView(root)
        setupSystemBars()

        if (createWebView() == null) return // WebView yo'q — xabar ko'rsatildi
        registerBackHandler()
        requestLegacyStoragePermissionIfNeeded()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    // Eslatma: onPause() da webView.onPause() ATAYLAB chaqirilmaydi — aks holda ilova fonga
    // o'tganda video yig'ish (render) to'xtab qoladi.

    override fun onDestroy() {
        unregisterBackHandler()
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (isFinishing) saver.cancel()
        destroyWebView()
        super.onDestroy()
    }

    // ================================================================ WebView

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun createWebView(): WebView? {
        val wv = try {
            WebView(this)
        } catch (e: Exception) {
            // Android System WebView o'chirilgan/yangilanayotgan bo'lsa konstruktor xato beradi
            Log.e(TAG, "WebView yaratilmadi", e)
            toast(getString(R.string.toast_no_webview), long = true)
            finish()
            return null
        }
        wv.setBackgroundColor(BG_COLOR)
        wv.overScrollMode = View.OVER_SCROLL_NEVER
        if (Build.VERSION.SDK_INT >= 29) wv.isForceDarkAllowed = false // ranglarni tizim buzmasin

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // file:///android_asset ochish va local.js dagi XHR (fonts, img/tpl.pack) uchun kerak
            allowFileAccess = true
            allowContentAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            // XAVFSIZLIK: 4.0.4 da true edi — sahifa istalgan saytning javobini CORS'siz o'qiy olardi.
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            defaultTextEncodingName = "UTF-8"
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            if (Build.VERSION.SDK_INT >= 26) safeBrowsingEnabled = true
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        wv.webViewClient = ShellWebViewClient()
        wv.webChromeClient = ShellChromeClient()
        wv.setDownloadListener { url, _, _, _, _ ->
            if (url.startsWith("https://")) {
                openExternal(url)
            } else {
                // blob: yuklamalar — sahifadagi "Yuklab olish" tugmasi o'zi hal qiladi (4.0.4 xulqi)
                wv.evaluateJavascript(JS_CLICK_DOWNLOAD, null)
            }
        }
        wv.addJavascriptInterface(WebAppBridge(this), WebAppBridge.JS_NAME)

        root.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        webView = wv
        wv.loadUrl(START_URL)
        return wv
    }

    private fun destroyWebView() {
        val wv = webView ?: return
        webView = null
        trustedPage = false
        runCatching {
            wv.stopLoading()
            wv.removeJavascriptInterface(WebAppBridge.JS_NAME)
            root.removeView(wv)
            wv.destroy()
        }
    }

    private inner class ShellWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url?.toString().orEmpty()
            if (!request.isForMainFrame) return !isAppUrl(url) && !url.startsWith("blob:") && !url.startsWith("data:")
            return when {
                isAppUrl(url) -> false                    // ilovaning o'z sahifasi — WebView ichida
                isExternalScheme(url) -> { openExternal(url); true }
                else -> true                              // boshqa hammasi bloklanadi (http:, intent:, javascript: …)
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            trustedPage = isAppUrl(url.orEmpty())
            super.onPageStarted(view, url, favicon)
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            trustedPage = isAppUrl(url.orEmpty())
            super.doUpdateVisitedHistory(view, url, isReload)
        }

        /** Renderer xotira yetishmasdan qulasa ilova yopilib qolmasin — sahifani qayta yaratamiz. */
        @TargetApi(26)
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.e(TAG, "WebView renderer to'xtadi (crash=${detail.didCrash()})")
            saver.cancel()
            onSaveFinished(null)
            if (webView === view) {
                destroyWebView()
            } else {
                runCatching { root.removeView(view); view.destroy() }
            }
            if (!isFinishing && !isDestroyed) {
                toast(getString(R.string.toast_renderer_gone), long = true)
                createWebView()
            }
            return true
        }
    }

    private inner class ShellChromeClient : WebChromeClient() {

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = callback
            return try {
                startActivityForResult(buildChooserIntent(params), REQ_FILE_CHOOSER)
                true
            } catch (e: ActivityNotFoundException) {
                fileChooserCallback = null
                callback.onReceiveValue(null)
                toast(getString(R.string.toast_no_app))
                false
            }
        }

        override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) {
                Log.d("FlowCraft/JS", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
            }
            return true
        }
    }

    // ================================================================ fayl tanlash

    /** Sahifa so'ragan fayl turlarini (accept: "image/…", "video/…", ".mp3" …) hisobga oladi. */
    private fun buildChooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val mimes = params.acceptTypes.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .mapNotNull { t ->
                when {
                    t.contains('/') -> t
                    t.startsWith('.') -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.drop(1))
                    else -> null
                }
            }
            .distinct()

        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            when {
                mimes.isEmpty() || mimes.contains("*/*") -> type = "*/*"
                mimes.size == 1 -> type = mimes[0]
                else -> {
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
                }
            }
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE_CHOOSER) return
        val cb = fileChooserCallback ?: return
        fileChooserCallback = null
        if (resultCode != RESULT_OK || data == null) {
            cb.onReceiveValue(null)
            return
        }
        val uris = ArrayList<Uri>()
        val clip = data.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) clip.getItemAt(i)?.uri?.let(uris::add)
        } else {
            data.data?.let(uris::add)
        }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    // ================================================================ orqaga tugmasi

    /**
     * Android 13+ (targetSdk 36) da onBackPressed() chaqirilmaydi — shuning uchun OnBackInvokedCallback.
     * Tartib: JS (oyna/menyu yopish, oldingi qadam) → WebView tarixi → ikki marta bosib chiqish.
     */
    private fun registerBackHandler() {
        if (Build.VERSION.SDK_INT >= 33) {
            val cb = OnBackInvokedCallback { handleBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb)
            backCallback = cb
        }
    }

    private fun unregisterBackHandler() {
        if (Build.VERSION.SDK_INT >= 33) {
            (backCallback as? OnBackInvokedCallback)?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        }
        backCallback = null
    }

    @Deprecated("Android 12 va pastroq uchun")
    override fun onBackPressed() {
        handleBack()
    }

    private fun handleBack() {
        val wv = webView
        if (wv == null) {
            finish()
            return
        }
        wv.evaluateJavascript(JS_BACK) { result ->
            when {
                result == "true" -> Unit
                wv.canGoBack() -> wv.goBack()
                else -> {
                    val now = SystemClock.elapsedRealtime()
                    if (now - lastBackPressAt < EXIT_WINDOW_MS) {
                        finish()
                    } else {
                        lastBackPressAt = now
                        toast(getString(if (saver.isActive) R.string.toast_exit_saving else R.string.toast_exit))
                    }
                }
            }
        }
    }

    // ================================================================ tizim panellari (edge-to-edge)

    /**
     * targetSdk 35+ da Android 15+ ilovani majburan butun ekranga (panellar ostiga) cho'zadi.
     * Barcha versiyada bir xil ko'rinish uchun: API 30+ da o'zimiz edge-to-edge yoqamiz va
     * tizim panellari + kesik (cutout) + klaviatura o'lchamini konteynerga padding qilib beramiz.
     */
    @Suppress("DEPRECATION")
    private fun setupSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.statusBarColor = Color.TRANSPARENT
            window.navigationBarColor = Color.TRANSPARENT
            window.isNavigationBarContrastEnforced = false
            window.insetsController?.setSystemBarsAppearance(
                0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            )
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
                WindowInsets.CONSUMED
            }
            root.requestApplyInsets()
        } else {
            window.statusBarColor = BG_COLOR
            window.navigationBarColor = BG_COLOR
        }
    }

    // ================================================================ ruxsatlar (faqat Android 7–9)

    private fun requestLegacyStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT <= 28 && !hasLegacyWritePermission()) {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_STORAGE && grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            toast(getString(R.string.toast_storage_denied), long = true)
        }
    }

    // ================================================================ WebAppBridge.Host

    override fun isTrustedPage(): Boolean = trustedPage

    override fun hasLegacyWritePermission(): Boolean =
        Build.VERSION.SDK_INT >= 29 ||
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    override fun onSaveStarted() = runOnUiThread {
        // Uzoq render paytida ekran o'chib, jarayon sekinlashmasin
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onSaveFinished(result: VideoSaver.Result?) = runOnUiThread {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        when (result) {
            is VideoSaver.Result.Saved -> toast(getString(R.string.toast_saved, result.location), long = true)
            is VideoSaver.Result.Failed -> toast(getString(R.string.toast_save_error, result.message), long = true)
            null -> Unit
        }
    }

    override fun onSaveStartFailed(error: VideoSaver.StartError?) = runOnUiThread {
        if (error == VideoSaver.StartError.LOW_SPACE) {
            toast(getString(R.string.toast_low_space, (VideoSaver.MIN_FREE_BYTES / (1024 * 1024)).toInt()), long = true)
        }
        if (Build.VERSION.SDK_INT <= 28 && !hasLegacyWritePermission()) requestLegacyStoragePermissionIfNeeded()
    }

    override fun openAsset(path: String): ByteArray? =
        try {
            assets.open(path).use { it.readBytes() }
        } catch (e: Exception) {
            null
        }

    override fun listAssets(dir: String): Array<String> =
        try {
            assets.list(dir) ?: emptyArray()
        } catch (e: Exception) {
            emptyArray()
        }

    override fun versionName(): String = BuildConfig.VERSION_NAME

    override fun deviceInfo(): String = DeviceTools.deviceInfo(applicationContext, BuildConfig.VERSION_NAME)

    override fun openWebViewUpdate(): Boolean {
        val pkg = DeviceTools.webViewPackage(applicationContext).first
        runOnUiThread {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: ActivityNotFoundException) {
                openExternal("https://play.google.com/store/apps/details?id=$pkg")
            }
        }
        return true
    }

    override fun shareText(title: String, text: String): Boolean {
        runOnUiThread {
            try {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(send, title.ifBlank { getString(R.string.app_name) }))
            } catch (e: Exception) {
                toast(getString(R.string.toast_no_app))
            }
        }
        return true
    }

    override fun saveTextFile(name: String, text: String): String =
        try {
            DeviceTools.saveTextFile(applicationContext, name, text)
        } catch (e: Exception) {
            Log.w(TAG, "Hisobot saqlanmadi", e)
            ""
        }

    /** Bufer faqat UI oqimida va oyna faol bo'lganda o'qiladi (Android 10+ talabi). */
    override fun licenseKeyFromClipboard(): String = onUiThreadBlocking("") {
        if (hasWindowFocus()) DeviceTools.licenseKeyFromClipboard(this) else ""
    }

    override fun copyText(text: String): Boolean = onUiThreadBlocking(false) { DeviceTools.copyToClipboard(this, text) }

    /** JS ko'prigi oqimidan UI oqimida qisqa amal bajarib natijani kutish (ko'pi bilan 1.5 s). */
    private fun <T> onUiThreadBlocking(fallback: T, block: () -> T): T {
        val task = java.util.concurrent.FutureTask { runCatching(block).getOrDefault(fallback) }
        runOnUiThread(task)
        return runCatching { task.get(1500, java.util.concurrent.TimeUnit.MILLISECONDS) }.getOrDefault(fallback)
    }

    // ================================================================ yordamchilar

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.toast_no_app))
        } catch (e: Exception) {
            Log.w(TAG, "Havola ochilmadi: $url", e)
        }
    }

    private fun toast(text: String, long: Boolean = false) {
        if (isFinishing || isDestroyed) return
        Toast.makeText(this, text, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val TAG = "FlowCraft"
        private const val START_URL = "file:///android_asset/index.html"
        private const val APP_URL_PREFIX = "file:///android_asset/"
        private const val REQ_FILE_CHOOSER = 1001
        private const val REQ_STORAGE = 1002
        private const val EXIT_WINDOW_MS = 2000L
        private val BG_COLOR = Color.parseColor("#0D0C0B")

        /** android-shell.js dagi window.FCBack(): true — JS o'zi hal qildi. */
        private const val JS_BACK =
            "(function(){try{return !!(window.FCBack&&window.FCBack());}catch(e){return false;}})()"
        private const val JS_CLICK_DOWNLOAD =
            "(function(){var b=document.getElementById('btnDownload');if(b)b.click();})()"

        fun isAppUrl(url: String): Boolean = url.startsWith(APP_URL_PREFIX) && !url.contains("..")

        /** Tashqi ilovada ochiladigan sxemalar (brauzer, Telegram, pochta). */
        fun isExternalScheme(url: String): Boolean {
            val u = url.lowercase()
            return u.startsWith("https://") || u.startsWith("tg:") || u.startsWith("mailto:")
        }
    }
}
