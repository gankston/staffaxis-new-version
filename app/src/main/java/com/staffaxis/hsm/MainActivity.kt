package com.staffaxis.hsm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.staffaxis.hsm.presentation.navigation.AppNavigation
import com.staffaxis.hsm.presentation.screens.update.UpdateDownloadScreen
import com.staffaxis.hsm.presentation.screens.update.UpdateInfo
import com.staffaxis.hsm.presentation.theme.StaffAxisTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var okHttpClient: OkHttpClient

    private val updateHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StaffAxisTheme {
                var updateAvailable by remember { mutableStateOf<UpdateInfo?>(null) }
                var showUpdateScreen by remember { mutableStateOf(false) }
                var pendingUpdate by remember { mutableStateOf<UpdateInfo?>(null) }

                LaunchedEffect(Unit) {
                    updateAvailable = checkForUpdate()
                }

                if (showUpdateScreen && pendingUpdate != null) {
                    // Pantalla completa de descarga con progreso e instalación automática
                    UpdateDownloadScreen(
                        updateInfo = pendingUpdate!!,
                        onClose = { showUpdateScreen = false },
                        onInstall = { showUpdateScreen = false }
                    )
                } else {
                    AppNavigation()

                    updateAvailable?.let { info ->
                        AlertDialog(
                            onDismissRequest = { if (!info.mandatory) updateAvailable = null },
                            title = { Text("Nueva versión disponible") },
                            text = { Text("Versión ${info.versionName} disponible.\n${info.notes}") },
                            confirmButton = {
                                TextButton(onClick = {
                                    pendingUpdate = info
                                    updateAvailable = null
                                    showUpdateScreen = true
                                }) { Text("Actualizar") }
                            },
                            dismissButton = if (!info.mandatory) ({
                                TextButton(onClick = { updateAvailable = null }) { Text("Ahora no") }
                            }) else null
                        )
                    }
                }
            }
        }
    }

    private suspend fun checkForUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val request = okhttp3.Request.Builder()
                .url("https://raw.githubusercontent.com/gankston/staffaxis-updates/main/version.json")
                .build()
            val response = updateHttpClient.newCall(request).execute()
            val body = response.body?.string() ?: return@withContext null
            val json = JSONObject(body)
            val remoteCode = json.getInt("versionCode")
            if (remoteCode > BuildConfig.VERSION_CODE) {
                UpdateInfo(
                    versionCode = remoteCode,
                    versionName = json.getString("versionName"),
                    apkUrl = json.getString("apkUrl"),
                    mandatory = json.optBoolean("mandatory", false),
                    notes = json.optString("notes", "")
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }
}
