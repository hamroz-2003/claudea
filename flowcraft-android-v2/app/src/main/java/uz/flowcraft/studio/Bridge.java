package uz.flowcraft.studio;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.widget.Toast;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * window.AndroidDownloader — web ilova (local.js) shu metodlarni chaqiradi:
 *   startSave(name[, mime[, durationMs]]) → writeChunk(base64)… → finishSave()
 *   listSfx(), getAssetBase64(path), deviceId()
 * Render natijasi (bo'lakli MP4) oddiy, suriladigan MP4 ga qayta o'raladi
 * va galereyaga (Movies/FlowCraft) saqlanadi.
 */
public class Bridge {
    private final Activity activity;
    private OutputStream out;
    private File raw;
    private String fileName = "";
    private String mime = "video/mp4";
    private long durationMs;

    Bridge(Activity a) { activity = a; }

    // ------------------------------------------------------------ saqlash --
    @JavascriptInterface public boolean startSave(String name) { return startSave(name, "", 0); }
    @JavascriptInterface public boolean startSave(String name, String m) { return startSave(name, m, 0); }

    @JavascriptInterface
    public boolean startSave(String name, String m, long durMs) {
        try {
            closeQuietly();
            fileName = (name == null || name.trim().isEmpty()) ? "FlowCraft_Video_" + System.currentTimeMillis() + ".mp4" : name.trim();
            fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", " ");
            mime = (m == null || m.isEmpty()) ? (fileName.toLowerCase(Locale.ROOT).endsWith(".webm") ? "video/webm" : "video/mp4") : m;
            durationMs = durMs;
            raw = new File(activity.getCacheDir(), "fc_raw_" + System.currentTimeMillis() + ".tmp");
            out = new FileOutputStream(raw);
            return true;
        } catch (Exception e) {
            out = null;
            return false;
        }
    }

    @JavascriptInterface
    public boolean writeChunk(String b64) {
        try {
            if (out == null) return false;
            out.write(Base64.decode(b64, Base64.NO_WRAP));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean finishSave() {
        File seekable = null;
        try {
            if (out != null) { out.flush(); out.close(); }
            out = null;
            if (raw == null || !raw.exists() || raw.length() == 0) return false;
            File src = raw;
            String name = fileName, type = mime;
            seekable = new File(activity.getCacheDir(), "fc_seekable_" + System.currentTimeMillis() + ".mp4");
            if (remux(raw, seekable) && seekable.length() > 0) {
                src = seekable; type = "video/mp4";
                if (name.toLowerCase(Locale.ROOT).endsWith(".webm")) name = name.substring(0, name.length() - 5) + ".mp4";
            } else {
                patchMp4Duration(raw, durationMs);
            }
            saveToGallery(src, name, type);
            toast("✓ Video galereyaga saqlandi (Movies/FlowCraft)");
            return true;
        } catch (Exception e) {
            toast("Xatolik: " + e.getMessage());
            return false;
        } finally {
            if (raw != null) raw.delete();
            if (seekable != null) seekable.delete();
            raw = null;
        }
    }

    private void saveToGallery(File src, String name, String type) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = activity.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Video.Media.MIME_TYPE, type);
            v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/FlowCraft");
            v.put(MediaStore.Video.Media.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("Galereyaga yozib bo'lmadi");
            try (InputStream in = new FileInputStream(src); OutputStream o = cr.openOutputStream(uri)) {
                if (o == null) throw new Exception("Galereyaga yozib bo'lmadi");
                copy(in, o);
            }
            v.clear();
            v.put(MediaStore.Video.Media.IS_PENDING, 0);
            cr.update(uri, v, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "FlowCraft");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Movies/FlowCraft papkasini yaratib bo'lmadi");
            File dst = new File(dir, name);
            try (InputStream in = new FileInputStream(src); OutputStream o = new FileOutputStream(dst)) { copy(in, o); }
            MediaScannerConnection.scanFile(activity, new String[]{dst.getAbsolutePath()}, new String[]{type}, null);
        }
    }

    /** Bo'lakli (fragmented) MP4 → oddiy MP4: galereya va pleyerlar davomiylikni ko'radi, surish ishlaydi. */
    private boolean remux(File in, File outFile) {
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mux = null;
        try {
            ex.setDataSource(in.getAbsolutePath());
            int n = ex.getTrackCount();
            if (n <= 0) return false;
            mux = new MediaMuxer(outFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            Map<Integer, Integer> map = new HashMap<>();
            int maxIn = 1 << 20;
            for (int i = 0; i < n; i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m == null || !(m.startsWith("video/") || m.startsWith("audio/"))) continue;
                if (f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxIn = Math.max(maxIn, f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
                ex.selectTrack(i);
                map.put(i, mux.addTrack(f));
            }
            if (map.isEmpty()) return false;
            mux.start();
            ByteBuffer buf = ByteBuffer.allocateDirect(maxIn);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            Map<Integer, Long> last = new HashMap<>();
            while (true) {
                int t = ex.getSampleTrackIndex();
                if (t < 0) break;
                Integer dst = map.get(t);
                if (dst != null) {
                    info.offset = 0;
                    info.size = ex.readSampleData(buf, 0);
                    if (info.size < 0) break;
                    long pts = ex.getSampleTime();
                    Long prev = last.get(t);
                    if (prev != null && pts <= prev) pts = prev + 1000;     // muxer monoton vaqt talab qiladi
                    last.put(t, pts);
                    info.presentationTimeUs = Math.max(0, pts);
                    info.flags = ex.getSampleFlags();
                    mux.writeSampleData(dst, buf, info);
                }
                ex.advance();
            }
            mux.stop();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try { if (mux != null) mux.release(); } catch (Exception ignored) { }
            ex.release();
        }
    }

    /** Qayta o'rab bo'lmasa: moov/mvhd dagi davomiylikni haqiqiy qiymatga yozib qo'yamiz. */
    private void patchMp4Duration(File f, long ms) {
        if (ms <= 0 || !f.exists() || f.length() < 32) return;
        try (RandomAccessFile r = new RandomAccessFile(f, "rw")) {
            long len = r.length(), pos = 0, moovEnd = -1;
            while (pos + 8 <= len) {
                r.seek(pos);
                long size = r.readInt() & 0xffffffffL;
                int type = r.readInt();
                if (size < 8) return;
                if (type == 0x6d6f6f76) { moovEnd = pos + size; pos += 8; break; }   // "moov"
                pos += size;
            }
            if (moovEnd < 0) return;
            while (pos + 8 <= moovEnd) {
                r.seek(pos);
                long size = r.readInt() & 0xffffffffL;
                int type = r.readInt();
                if (size < 8) return;
                if (type == 0x6d766864) {                                             // "mvhd"
                    int version = r.readUnsignedByte();
                    r.skipBytes(3);
                    if (version == 0) { r.skipBytes(8); long ts = r.readInt() & 0xffffffffL; if (ts > 0) r.writeInt((int) (ts * ms / 1000)); }
                    else if (version == 1) { r.skipBytes(16); long ts = r.readInt() & 0xffffffffL; if (ts > 0) r.writeLong(ts * ms / 1000); }
                    return;
                }
                pos += size;
            }
        } catch (Exception ignored) { }
    }

    // --------------------------------------------------------------- SFX --
    @JavascriptInterface
    public String listSfx() {
        try {
            String[] all = activity.getAssets().list("sfx");
            JSONArray a = new JSONArray();
            if (all != null) for (String n : all) if (n.toLowerCase(Locale.ROOT).matches(".*\\.(mp3|m4a|wav|ogg)$")) a.put(n);
            return a.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    @JavascriptInterface
    public String getAssetBase64(String path) {
        // faqat ilova ichidagi sfx/ va img/ fayllari; boshqa yo'l (".." va h.k.) rad etiladi
        if (path == null || path.contains("..") || !(path.startsWith("sfx/") || path.startsWith("img/"))) return "";
        try (InputStream in = activity.getAssets().open(path)) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            copy(in, b);
            return Base64.encodeToString(b.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    // ---------------------------------------------------------- qurilma ID --
    /**
     * Qayta o'rnatishda o'zgarmaydigan qurilma ID (FC-XXXX-XXXX-XXXX-XXXX-XXXX).
     * ANDROID_ID ilova imzosi va qurilma foydalanuvchisiga bog'langan: ilova
     * o'chirib qayta o'rnatilsa ham bir xil qoladi, shuning uchun litsenziya
     * yo'qolmaydi. Xom ANDROID_ID tashqariga chiqmaydi (SHA-256 dan hosila).
     */
    @JavascriptInterface
    public String deviceId() {
        try {
            String aid = Settings.Secure.getString(activity.getContentResolver(), Settings.Secure.ANDROID_ID);
            if (aid == null || aid.isEmpty()) return "";
            byte[] h = MessageDigest.getInstance("SHA-256").digest((aid + ":" + activity.getPackageName() + ":flowcraft").getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 10; i++) hex.append(String.format(Locale.ROOT, "%02X", h[i]));
            String x = hex.toString();
            return "FC-" + x.substring(0, 4) + "-" + x.substring(4, 8) + "-" + x.substring(8, 12) + "-" + x.substring(12, 16) + "-" + x.substring(16, 20);
        } catch (Exception e) {
            return "";
        }
    }

    // ------------------------------------------------------------ yordamchi --
    private static void copy(InputStream in, OutputStream o) throws java.io.IOException {
        byte[] b = new byte[1 << 16];
        int k;
        while ((k = in.read(b)) > 0) o.write(b, 0, k);
    }

    private void closeQuietly() {
        try { if (out != null) out.close(); } catch (Exception ignored) { }
        out = null;
        if (raw != null) raw.delete();
        raw = null;
    }

    private void toast(String msg) {
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }
}
