plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.staffaxis.webshell"
    compileSdk = 35

    defaultConfig {
        // Sufijo .web a proposito mientras se prueba: se instala AL LADO de la app
        // actual, para poder comparar las dos abiertas en el mismo telefono. Cuando
        // este aprobada se saca el sufijo y ahi si pisa la app de todos.
        applicationId = "com.registro.empleados.web"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

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
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}
