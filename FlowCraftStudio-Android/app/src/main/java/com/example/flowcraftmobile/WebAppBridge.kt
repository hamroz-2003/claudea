package com.example.flowcraftmobile

import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONArray

/**
 * JS ↔ Android ko'prigi. JS da `window.AndroidDownloader` nomi bilan ko'rinadi
 * (local.js shu nomni qidiradi — nomini O'ZGARTIRMANG).
 *
 * Eski 4.0.4 API to'liq saqlangan: startSave / writeChunk / finishSave / listSfx / getAssetBase64.
 * Yangi: cancelSave, isSaving, appVersion.
 *
 * Xavfsizlik: har bir chaqiruvda sahifa ilovaning o'z sahifasi ekanligi tekshiriladi
 * ([Host.isTrustedPage]); begona sahifa ochilib qolsa ham ko'prik ishlamaydi.
 * Barcha metodlar WebView'ning "JavaBridge" oqimida bajariladi (UI oqimida emas).
 */
class WebAppBridge(private val host: Host) {

    /** MainActivity tomonidan bajariladigan UI/ruxsat amallari. */
    interface Host {
        val saver: VideoSaver
        fun isTrustedPage(): Boolean
        fun onSaveStarted()
        fun onSaveFinished(result: VideoSaver.Result?)
        fun onSaveStartFailed(error: VideoSaver.StartError?)
        fun hasLegacyWritePermission(): Boolean
        fun openAsset(path: String): ByteArray?
        fun listAssets(dir: String): Array<String>
        fun versionName(): String
    }

    // ---------------------------------------------------------------- video saqlash

    @JavascriptInterface
    fun startSave(fileName: String?): Boolean = startSave(fileName, "", 0L)

    @JavascriptInterface
    fun startSave(fileName: String?, mimeType: String?): Boolean = startSave(fileName, mimeType, 0L)

    @JavascriptInterface
    fun startSave(fileName: String?, mimeType: String?, durationMs: Long): Boolean {
        if (!host.isTrustedPage()) return false
        val ok = host.saver.start(fileName.orEmpty(), mimeType.orEmpty(), durationMs)
        if (ok) host.onSaveStarted() else host.onSaveStartFailed(host.saver.lastStartError)
        return ok
    }

    @JavascriptInterface
    fun writeChunk(base64Chunk: String?): Boolean {
        if (!host.isTrustedPage() || base64Chunk.isNullOrEmpty()) return false
        return try {
            host.saver.write(Base64.decode(base64Chunk, Base64.NO_WRAP))
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Base64 bo'lagi buzilgan", e)
            false
        }
    }

    /** Sinxron: JS natijani kutadi (local.js `if(!AND.finishSave())` shaklida ishlatadi). */
    @JavascriptInterface
    fun finishSave(): Boolean {
        if (!host.isTrustedPage()) return false
        val result = host.saver.finish(host.hasLegacyWritePermission())
        host.onSaveFinished(result)
        return result is VideoSaver.Result.Saved
    }

    /** Render xato bilan tugasa yoki bekor qilinsa: vaqtinchalik faylni o'chiradi. */
    @JavascriptInterface
    fun cancelSave() {
        if (!host.isTrustedPage()) return
        host.saver.cancel()
        host.onSaveFinished(null)
    }

    @JavascriptInterface
    fun isSaving(): Boolean = host.saver.isActive

    // ---------------------------------------------------------------- ichki fayllar

    /** Ichki o'tish tovushlari ro'yxati (faqat audio fayllar; desktop.ini kabi axlat chiqmaydi). */
    @JavascriptInterface
    fun listSfx(): String {
        if (!host.isTrustedPage()) return "[]"
        return try {
            JSONArray(host.listAssets("sfx").filter { AUDIO_EXT.containsMatchIn(it) }.sorted()).toString()
        } catch (e: Exception) {
            "[]"
        }
    }

    /** assets ichidagi faylni Base64 qilib beradi. Yo'l faqat assets ichida bo'lishi mumkin. */
    @JavascriptInterface
    fun getAssetBase64(path: String?): String {
        if (!host.isTrustedPage()) return ""
        val clean = path.orEmpty().trim().trimStart('/')
        if (clean.isEmpty() || clean.contains("..") || clean.contains('\\')) return ""
        val bytes = host.openAsset(clean) ?: return ""
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    @JavascriptInterface
    fun appVersion(): String = host.versionName()

    companion object {
        private const val TAG = "FlowCraft/Bridge"
        const val JS_NAME = "AndroidDownloader"
        private val AUDIO_EXT = Regex("\\.(mp3|m4a|aac|wav|ogg|opus)$", RegexOption.IGNORE_CASE)
    }
}
