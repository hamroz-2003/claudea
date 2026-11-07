# JS ko'prigi metodlari nomi saqlanadi (WebView ularni nomi bilan chaqiradi)
-keepclassmembers class uz.flowcraft.studio.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
