package com.example.flowcraftmobile

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import android.util.Log
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer

/**
 * MP4 bilan ishlash yordamchilari.
 *
 * JS tomonidagi mp4-muxer "fragmented MP4" chiqaradi. Ba'zi galereya/pleyerlar bunday faylni
 * oxirigacha o'ynatadi, lekin oldinga-orqaga surib (seek) bo'lmaydi va davomiylik 0:00 ko'rinadi.
 * Shuning uchun saqlashdan oldin fayl MediaMuxer orqali oddiy (seekable) MP4 ga qayta o'raladi.
 * Agar qayta o'rash imkonsiz bo'lsa — hech bo'lmasa `mvhd` sarlavhasidagi davomiylik to'g'rilanadi.
 */
object Mp4Tools {
    private const val TAG = "FlowCraft/Mp4"
    private const val MIN_BUFFER = 4 * 1024 * 1024        // 4 MB: 4K kalit kadrlar uchun ham yetadi
    private const val MAX_BUFFER = 64 * 1024 * 1024       // undan katta namuna — buzilgan fayl belgisi

    private const val BOX_MOOV = 0x6D6F6F76 // 'moov'
    private const val BOX_MVHD = 0x6D766864 // 'mvhd'

    /**
     * [src] faylni [dst] ga oddiy MP4 sifatida qayta yozadi (kodlash yo'q, faqat konteyner almashadi).
     * @return true — muvaffaqiyatli va [dst] bo'sh emas.
     */
    fun remuxToSeekableMp4(src: File, dst: File): Boolean {
        var extractor: MediaExtractor? = null
        var muxer: MediaMuxer? = null
        var muxerStarted = false
        try {
            extractor = MediaExtractor().apply { setDataSource(src.absolutePath) }
            val trackCount = extractor.trackCount
            if (trackCount <= 0) return false

            // 1) Yo'laklarni tekshirish: birorta yo'lakni qo'llab bo'lmasa — umuman qayta o'ramaymiz,
            //    aks holda (masalan) ovozsiz video chiqib qolardi.
            val formats = ArrayList<Pair<Int, MediaFormat>>(trackCount)
            var bufferSize = MIN_BUFFER
            for (i in 0 until trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
                val supported = when {
                    mime.startsWith("video/") -> true
                    mime.startsWith("audio/") ->
                        mime.contains("mp4a", true) || mime.contains("aac", true) || Build.VERSION.SDK_INT >= 30
                    else -> false
                }
                if (!supported) {
                    Log.w(TAG, "Qo'llanmaydigan yo'lak: $mime — qayta o'rash bekor qilindi")
                    return false
                }
                if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                    bufferSize = maxOf(bufferSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
                }
                formats += i to format
            }

            dst.delete()
            val mx = MediaMuxer(dst.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            muxer = mx
            val trackMap = HashMap<Int, Int>(formats.size)
            for ((index, format) in formats) {
                if (format.containsKey(MediaFormat.KEY_ROTATION)) {
                    runCatching { mx.setOrientationHint(format.getInteger(MediaFormat.KEY_ROTATION)) }
                }
                extractor.selectTrack(index)
                trackMap[index] = mx.addTrack(format)
            }
            mx.start()
            muxerStarted = true

            // 2) Namunalarni ko'chirish
            var buffer = ByteBuffer.allocateDirect(bufferSize.coerceAtMost(MAX_BUFFER))
            val info = MediaCodec.BufferInfo()
            val lastPts = HashMap<Int, Long>()
            var samples = 0L
            while (true) {
                val track = extractor.sampleTrackIndex
                if (track < 0) break
                val outTrack = trackMap[track]
                if (outTrack == null) {
                    extractor.advance()
                    continue
                }
                buffer.clear()
                val size = try {
                    extractor.readSampleData(buffer, 0)
                } catch (e: IllegalArgumentException) {
                    // Bufer kichik — kattalashtirib qayta urinamiz
                    val bigger = buffer.capacity() * 2
                    if (bigger > MAX_BUFFER) throw e
                    buffer = ByteBuffer.allocateDirect(bigger)
                    continue
                }
                if (size < 0) break

                // Fragmentli fayllarda takrorlanuvchi vaqt belgilari uchraydi — har yo'lakda qat'iy o'suvchi qilamiz
                var pts = extractor.sampleTime.coerceAtLeast(0L)
                val prev = lastPts[track]
                if (prev != null && pts <= prev) pts = prev + 1_000L
                lastPts[track] = pts

                info.set(0, size, pts, if ((extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) {
                    MediaCodec.BUFFER_FLAG_KEY_FRAME
                } else 0)
                mx.writeSampleData(outTrack, buffer, info)
                samples++
                extractor.advance()
            }

            mx.stop()
            muxerStarted = false
            return samples > 0 && dst.isFile && dst.length() > 0
        } catch (e: Exception) {
            Log.w(TAG, "Qayta o'rash muvaffaqiyatsiz: ${e.message}", e)
            return false
        } finally {
            if (muxerStarted) runCatching { muxer?.stop() }
            runCatching { muxer?.release() }
            runCatching { extractor?.release() }
        }
    }

    /**
     * Zaxira yo'l: `moov/mvhd` ichidagi davomiylikni [durationMs] ga tenglaydi.
     * Fayl tuzilishi kutilganidek bo'lmasa — hech narsa qilmaydi (faylni buzmaydi).
     */
    fun patchMvhdDuration(file: File, durationMs: Long) {
        if (durationMs <= 0 || !file.isFile || file.length() < 32) return
        try {
            RandomAccessFile(file, "rw").use { raf ->
                val fileLen = raf.length()
                val moov = findBox(raf, 0, fileLen, BOX_MOOV) ?: return
                val mvhd = findBox(raf, moov.first, moov.second, BOX_MVHD) ?: return
                raf.seek(mvhd.first)
                val version = raf.readUnsignedByte()
                raf.skipBytes(3) // flags
                when (version) {
                    0 -> {
                        raf.skipBytes(8) // creation + modification (2×4)
                        val timescale = raf.readInt().toLong() and 0xFFFFFFFFL
                        if (timescale <= 0) return
                        val value = timescale * durationMs / 1000
                        if (value > 0xFFFFFFFFL) return
                        raf.writeInt(value.toInt())
                    }
                    1 -> {
                        raf.skipBytes(16) // creation + modification (2×8)
                        val timescale = raf.readInt().toLong() and 0xFFFFFFFFL
                        if (timescale <= 0) return
                        raf.writeLong(timescale * durationMs / 1000)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "mvhd tuzatilmadi: ${e.message}")
        }
    }

    /**
     * [start]..[end] oralig'ida [type] qutisini qidiradi.
     * @return (qutining ichki ma'lumoti boshlanishi, qutining oxiri) yoki null.
     */
    private fun findBox(raf: RandomAccessFile, start: Long, end: Long, type: Int): Pair<Long, Long>? {
        var pos = start
        while (pos + 8 <= end) {
            raf.seek(pos)
            var size = raf.readInt().toLong() and 0xFFFFFFFFL
            val boxType = raf.readInt()
            var header = 8L
            when (size) {
                1L -> { // 64-bitli o'lcham
                    if (pos + 16 > end) return null
                    size = raf.readLong()
                    header = 16L
                }
                0L -> size = end - pos // fayl oxirigacha
            }
            if (size < header || pos + size > end) return null
            if (boxType == type) return (pos + header) to (pos + size)
            pos += size
        }
        return null
    }
}
