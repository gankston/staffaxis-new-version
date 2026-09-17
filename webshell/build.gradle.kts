plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.staffaxis.webshell"
    compileSdk = 35

    defaultConfig {
        // Sin sufijo: mismo applicationId que la app nativa, asi el shell la PISA
        // en vez de instalarse al lado. Ya no se comparan las dos, la web reemplaza.
        applicationId = "com.registro.empleados"
        minSdk = 26
        targetSdk = 35
        // Tiene que ser mayor que el de la app nativa instalada (la publicada es 64,
        // la compilada 65), si no Android lo rechaza como si fuera una version vieja.
        versionCode = 66
        versionName = "5.0.0"

        buildConfigField("String", "WEB_URL", "\"https://staffaxis-new-version-production.up.railway.app/app\"")
    }

    // Mismo keystore que la app, para que pueda instalarse como actualizacion
    // cuando se le saque el sufijo del applicationId.
    signingConfigs {
        create("release") {
            storeFile = file("${System.getenv("USERPROFILE")}\\Desktop\\Versions Staffaxis\\staffaxis-release.keystore")
            storePassword = "staffaxis123"
            keyAlias = "staffaxis"
            keyPassword = "staffaxis123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    // Solo para los tests del actualizador: no entra en el APK.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}
