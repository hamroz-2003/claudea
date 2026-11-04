package com.example.flowcraftmobile

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.OutputStream

/**
 * Bitta video saqlash seansi: start → write (ko'p marta) → finish | cancel.
 *
 * Barcha metodlar thread-safe (JS ko'prigi o'z "JavaBridge" oqimida chaqiradi).
 * Xom ma'lumot avval ilova keshidagi vaqtinchalik faylga yoziladi, so'ng:
 *  1) seekable MP4 ga qayta o'raladi ([Mp4Tools.remuxToSeekableMp4]);
 *  2) Android 10+ — MediaStore orqali Movies/FlowCraft ga (ruxsat kerak emas);
 *     Android 7–9 — ruxsat bo'lsa ochiq Movies/FlowCraft ga, bo'lmasa ilovaning shaxsiy Movies papkasiga.
 */
class VideoSaver(private val context: Context) {

    sealed class Result {
        data class Saved(val location: String) : Result()
        data class Failed(val message: String) : Result()
    }

    private val lock = Any()
    private var rawFile: File? = null
    private var output: OutputStream? = null
    private var fileName: String = ""
    private var mimeType: String = MIME_MP4
    private var durationMs: Long = 0L
    private var bytesWritten: Long = 0L

    /** Hozir saqlash jarayoni ketyaptimi (chiqishda ogohlantirish uchun). */
    val isActive: Boolean
        get() = synchronized(lock) { output != null }

    /** Oxirgi start() nima uchun muvaffaqiyatsiz bo'lgani (foydalanuvchiga ko'rsatish uchun). */
    @Volatile
    var lastStartError: StartError? = null
        private set

    enum class StartError { LOW_SPACE, IO }

    fun start(requestedName: String, requestedMime: String, expectedDurationMs: Long): Boolean =
        synchronized(lock) {
            abortLocked() // oldingi tugallanmagan seans bo'lsa — tozalaymiz
            lastStartError = null
            try {
                val cache = context.cacheDir
                if (cache.usableSpace < MIN_FREE_BYTES) {
                    lastStartError = StartError.LOW_SPACE
                    return false
                }
                mimeType = normalizeMime(requestedMime, requestedName)
                fileName = sanitizeFileName(requestedName, mimeType)
                durationMs = expectedDurationMs.coerceAtLeast(0L)
                bytesWritten = 0L
                val f = File.createTempFile(TEMP_RAW_PREFIX, ".tmp", cache)
                rawFile = f
                output = BufferedOutputStream(f.outputStream(), 1 shl 20)
                true
            } catch (e: Exception) {
                Log.e(TAG, "start() xato", e)
                lastStartError = StartError.IO
                abortLocked()
                false
            }
        }

    fun write(bytes: ByteArray): Boolean = synchronized(lock) {
        val out = output ?: return false
        try {
            out.write(bytes)
            bytesWritten += bytes.size
            true
        } catch (e: IOException) {
            // Odatda: xotira to'ldi. Seansni yopamiz, JS xatoni ko'rsatadi.
            Log.e(TAG, "write() xato ($bytesWritten bayt yozilgan)", e)
            abortLocked()
            false
        }
    }

    fun finish(legacyWriteGranted: Boolean): Result = synchronized(lock) {
        val raw = rawFile
        val out = output
        output = null
        rawFile = null
        if (raw == null || out == null) return Result.Failed("Saqlash seansi boshlanmagan")

        var seekable: File? = null
        try {
            out.flush()
            out.close()
            if (!raw.isFile || raw.length() == 0L) return Result.Failed("Video bo'sh chiqdi")

            // 1) Seekable MP4 (iloji bo'lsa)
            var source = raw
            var mime = mimeType
            var name = fileName
            val candidate = File(context.cacheDir, "$TEMP_SEEKABLE_PREFIX${System.currentTimeMillis()}.mp4")
            if (Mp4Tools.remuxToSeekableMp4(raw, candidate)) {
                seekable = candidate
                source = candidate
                mime = MIME_MP4
                name = replaceExtension(name, ".mp4")
            } else {
                candidate.delete()
                Mp4Tools.patchMvhdDuration(raw, durationMs)
            }

            // 2) Galereyaga
            val location = if (Build.VERSION.SDK_INT >= 29) {
                saveToMediaStore(source, name, mime)
            } else {
                saveLegacy(source, name, mime, legacyWriteGranted)
            }
            Result.Saved(location)
        } catch (e: Exception) {
            Log.e(TAG, "finish() xato", e)
            Result.Failed(e.message ?: e.javaClass.simpleName)
        } finally {
            runCatching { out.close() }
            raw.delete()
            seekable?.delete()
        }
    }

    fun cancel() = synchronized(lock) { abortLocked() }

    private fun abortLocked() {
        runCatching { output?.close() }
        output = null
        rawFile?.delete()
        rawFile = null
        bytesWritten = 0L
    }

    // ---------------------------------------------------------------- saqlash yo'llari

    private fun saveToMediaStore(src: File, name: String, mime: String): String {
        if (Build.VERSION.SDK_INT < 29) throw IllegalStateException("MediaStore yo'li faqat Android 10+")
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$ALBUM")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values)
            ?: throw IOException("Galereyada fayl yaratib bo'lmadi")
        try {
            val os = resolver.openOutputStream(uri) ?: throw IOException("Galereya fayliga yozib bo'lmadi")
            os.use { stream -> FileInputStream(src).use { it.copyTo(stream, COPY_BUFFER) } }
            val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            resolver.update(uri, done, null, null)
        } catch (e: Exception) {
            // Yarim yozilgan "osilib qolgan" yozuv galereyada qolmasin
            runCatching { resolver.delete(uri, null, null) }
            throw e
        }
        return "Movies/$ALBUM"
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(src: File, name: String, mime: String, writeGranted: Boolean): String {
        val granted = writeGranted && context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        val publicOk = granted && Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED
        val dir = if (publicOk) {
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), ALBUM)
        } else {
            // Ruxsatsiz ham ishlaydi: Android/data/<paket>/files/Movies
            context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
                ?: File(context.filesDir, "Movies")
        }
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Papka yaratilmadi: ${dir.absolutePath}")
        val target = uniqueFile(dir, name)
        src.copyTo(target, overwrite = false, bufferSize = COPY_BUFFER)
        MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf(mime), null)
        return if (publicOk) "Movies/$ALBUM" else target.parentFile?.absolutePath ?: target.absolutePath
    }

    companion object {
        private const val TAG = "FlowCraft/Saver"
        const val ALBUM = "FlowCraft"
        const val MIME_MP4 = "video/mp4"
        const val MIME_WEBM = "video/webm"
        const val MIN_FREE_BYTES = 200L * 1024 * 1024 // 200 MB: xom fayl + qayta o'ralgan nusxa uchun
        private const val COPY_BUFFER = 1 shl 20
        private const val TEMP_RAW_PREFIX = "fc_raw_"
        private const val TEMP_SEEKABLE_PREFIX = "fc_seekable_"
        private const val MAX_NAME = 100

        /** Ilova yopilib qolganda keshda qolgan vaqtinchalik fayllarni o'chiradi. */
        fun cleanupStaleTemp(cacheDir: File) {
            runCatching {
                cacheDir.listFiles()?.forEach { f ->
                    if (f.isFile && (f.name.startsWith(TEMP_RAW_PREFIX) || f.name.startsWith(TEMP_SEEKABLE_PREFIX))) {
                        f.delete()
                    }
                }
            }
        }

        fun normalizeMime(mime: String, name: String): String = when {
            mime.equals(MIME_WEBM, true) -> MIME_WEBM
            mime.equals(MIME_MP4, true) -> MIME_MP4
            name.endsWith(".webm", true) -> MIME_WEBM
            else -> MIME_MP4
        }

        /**
         * JS dan kelgan nomni xavfsiz qiladi: papka belgilari ("../") olib tashlanadi,
         * taqiqlangan belgilar almashtiriladi, uzunlik cheklanadi, kengaytma MIME ga moslanadi.
         */
        fun sanitizeFileName(raw: String, mime: String): String {
            val ext = if (mime == MIME_WEBM) ".webm" else ".mp4"
            var base = raw.substringAfterLast('/').substringAfterLast('\\')
                .replace(Regex("[\\u0000-\\u001F\\u007F:*?\"<>|]"), "_")
                .trim().trim('.')
            base = base.replace(Regex("\\.(mp4|webm|mov|m4v|tmp)$", RegexOption.IGNORE_CASE), "")
            if (base.isBlank()) base = "FlowCraft_Video_${System.currentTimeMillis()}"
            if (base.length > MAX_NAME) base = base.take(MAX_NAME).trim()
            return base + ext
        }

        fun replaceExtension(name: String, ext: String): String {
            val dot = name.lastIndexOf('.')
            return (if (dot > 0) name.substring(0, dot) else name) + ext
        }

        private fun uniqueFile(dir: File, name: String): File {
            var f = File(dir, name)
            if (!f.exists()) return f
            val dot = name.lastIndexOf('.')
            val base = if (dot > 0) name.substring(0, dot) else name
            val ext = if (dot > 0) name.substring(dot) else ""
            var i = 1
            while (f.exists() && i < 1000) {
                f = File(dir, "$base ($i)$ext")
                i++
            }
            return f
        }
    }
}
