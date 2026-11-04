package com.example.flowcraftmobile

import android.Manifest
import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import android.util.Log
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * "O'zi ishlaydigan" ilova uchun qurilma yordamchilari: diagnostika, hisobot fayli, bufer.
 * UI ga bog'liq emas — MainActivity faqat chaqiradi.
 */
object DeviceTools {
    private const val TAG = "FlowCraft/Device"
    private const val DEFAULT_WEBVIEW_PKG = "com.google.android.webview"

    /** Litsenziya kaliti ko'rinishi: FC3-<reja+muddat>-<imzo>. Buferdan faqat shunday matn olinadi. */
    private val LICENSE_KEY = Regex("FC3-[A-Z0-9]{1,16}-[A-Z2-7-]{60,140}")

    /** Diagnostika uchun JSON (shaxsiy ma'lumot yo'q: faqat qurilma turi va resurslar). */
    fun deviceInfo(context: Context, versionName: String): String {
        val json = JSONObject()
        runCatching {
            json.put("app", versionName)
            json.put("android", Build.VERSION.RELEASE)
            json.put("sdk", Build.VERSION.SDK_INT)
            json.put("maker", Build.MANUFACTURER)
            json.put("model", Build.MODEL)
            json.put("abi", Build.SUPPORTED_ABIS.firstOrNull().orEmpty())

            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am != null) {
                val mi = ActivityManager.MemoryInfo()
                am.getMemoryInfo(mi)
                json.put("ramMb", mi.totalMem / (1024 * 1024))
                json.put("availRamMb", mi.availMem / (1024 * 1024))
                json.put("lowRamDevice", am.isLowRamDevice)
            }
            val pm = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
            if (pm != null) json.put("powerSave", pm.isPowerSaveMode)
            json.put("freeMb", freeBytes(context.filesDir) / (1024 * 1024))
            json.put("cacheFreeMb", freeBytes(context.cacheDir) / (1024 * 1024))

            val wv = webViewPackage(context)
            json.put("webviewPkg", wv.first)
            json.put("webviewVersion", wv.second)
        }.onFailure { Log.w(TAG, "deviceInfo: ${it.message}") }
        return json.toString()
    }

    /** Hozir ishlatilayotgan WebView paketi va versiyasi. */
    fun webViewPackage(context: Context): Pair<String, String> {
        if (Build.VERSION.SDK_INT >= 26) {
            val p = runCatching { WebView.getCurrentWebViewPackage() }.getOrNull()
            if (p != null) return p.packageName to (p.versionName ?: "")
        }
        // Android 7: WebView odatda Chrome yoki com.google.android.webview
        for (pkg in listOf(DEFAULT_WEBVIEW_PKG, "com.android.chrome")) {
            val info = runCatching {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(pkg, 0)
            }.getOrNull()
            if (info != null) return pkg to (info.versionName ?: "")
        }
        return DEFAULT_WEBVIEW_PKG to ""
    }

    private fun freeBytes(dir: File): Long = runCatching { StatFs(dir.absolutePath).availableBytes }.getOrDefault(0L)

    /**
     * Matnli faylni (diagnostika hisoboti) "Download/FlowCraft" ga saqlaydi.
     * @return foydalanuvchiga ko'rsatiladigan joy nomi.
     */
    fun saveTextFile(context: Context, rawName: String, text: String): String {
        val name = rawName.substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[\\u0000-\\u001F:*?\"<>|]"), "_")
            .ifBlank { "FlowCraft_hisobot.txt" }
            .let { if (it.endsWith(".txt", true)) it else "$it.txt" }
            .take(100)
        val bytes = text.toByteArray(Charsets.UTF_8)

        if (Build.VERSION.SDK_INT >= 29) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/FlowCraft")
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Yuklab olinganlar papkasida fayl yaratilmadi")
            try {
                val os = resolver.openOutputStream(uri) ?: throw IOException("Faylga yozib bo'lmadi")
                os.use { it.write(bytes) }
            } catch (e: Exception) {
                runCatching { resolver.delete(uri, null, null) }
                throw e
            }
            return "Download/FlowCraft/$name"
        }

        val granted = context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        @Suppress("DEPRECATION")
        val dir = if (granted && Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED) {
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FlowCraft")
        } else {
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(context.filesDir, "Download")
        }
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Papka yaratilmadi")
        val f = File(dir, name)
        f.writeBytes(bytes)
        return f.absolutePath
    }

    /** Buferdagi litsenziya kalitini qaytaradi (boshqa matnlar sahifaga BERILMAYDI — maxfiylik). */
    fun licenseKeyFromClipboard(context: Context): String {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return ""
        val clip = runCatching { cm.primaryClip }.getOrNull() ?: return ""
        for (i in 0 until clip.itemCount) {
            val raw = clip.getItemAt(i)?.coerceToText(context)?.toString().orEmpty()
            val compact = raw.uppercase().replace(Regex("\\s+"), "")
            LICENSE_KEY.find(compact)?.let { return it.value }
        }
        return ""
    }

    fun copyToClipboard(context: Context, text: String): Boolean {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
        return runCatching { cm.setPrimaryClip(ClipData.newPlainText("FlowCraft", text)); true }.getOrDefault(false)
    }
}
