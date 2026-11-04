# JS ko'prigi: R8 @JavascriptInterface metodlarini o'chirib yoki nomini o'zgartirib yubormasin
-keepattributes JavascriptInterface
-keepclassmembers class com.example.flowcraftmobile.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
