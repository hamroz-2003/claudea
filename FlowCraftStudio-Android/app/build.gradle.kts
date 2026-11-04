import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---- Release imzosi: keystore.properties yoki muhit o'zgaruvchilaridan (CI uchun) ----
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
    (keystoreProps.getProperty(propKey) ?: System.getenv(envKey))?.takeIf { it.isNotBlank() }

val releaseStoreFile = signingValue("storeFile", "FC_KEYSTORE_FILE")
val hasReleaseSigning = releaseStoreFile != null && file(releaseStoreFile).isFile

android {
    namespace = "com.example.flowcraftmobile"
    compileSdk = 36

    defaultConfig {
        // DIQQAT: applicationId o'zgarsa telefon buni BOSHQA ilova deb biladi va eski loyihalar ko'chmaydi.
        applicationId = "com.example.flowcraftmobile"
        minSdk = 24
        targetSdk = 36
        versionCode = 410          // 4.0.4 (versionCode=1) dan katta — ustidan yangilanadi
        versionName = "4.1.0"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = signingValue("storePassword", "FC_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "FC_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "FC_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Kalit berilmagan bo'lsa debug kaliti bilan imzolanadi (sinash uchun; eski ilova ustiga O'RNATILMAYDI)
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release")
            else signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"   // asosiy ilova bilan yonma-yon o'rnatiladi
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        // Web fayllar siqilmasdan saqlansin (assets'dan tez o'qiladi)
        noCompress += listOf("woff", "pack", "mp3", "m4a", "wav")
    }

    lint {
        checkReleaseBuilds = true
        abortOnError = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Tashqi kutubxona yo'q: faqat Android SDK + Kotlin stdlib (APK kichik va tez)
dependencies {}
