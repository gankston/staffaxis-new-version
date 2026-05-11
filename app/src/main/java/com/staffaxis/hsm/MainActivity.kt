package com.staffaxis.hsm

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.staffaxis.hsm.presentation.navigation.AppNavigation
import com.staffaxis.hsm.presentation.theme.StaffAxisTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.json.JSONObject
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var okHttpClient: OkHttpClient

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StaffAxisTheme {
                var updateAvailable by remember { mutableStateOf<UpdateInfo?>(null) }

                LaunchedEffect(Unit) {
                    updateAvailable = checkForUpdate()
                }

                updateAvailable?.let { info ->
                    AlertDialog(
                        onDismissRequest = { updateAvailable = null },
                        title = { Text("Nueva versión disponible") },
                        text = { Text("Versión ${info.versionName} disponible.\n${info.notes}") },
                        confirmButton = {
                            TextButton(onClick = {
                                downloadAndInstall(info.apkUrl, info.versionName)
                                updateAvailable = null
                            }) { Text("Actualizar") }
                        },
                        dismissButton = {
                            TextButton(onClick = { updateAvailable = null }) { Text("Ahora no") }
                        }
                    )
                }

                AppNavigation()
            }
        }
    }

    private data class UpdateInfo(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val notes: String
    )

    private suspend fun checkForUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val request = okhttp3.Request.Builder()
                .url("https://raw.githubusercontent.com/gankston/staffaxis-updates/main/version.json")
                .build()
            val response = okHttpClient.newCall(request).execute()
            val body = response.body?.string() ?: return@withContext null
            val json = JSONObject(body)
            val remoteCode = json.getInt("versionCode")
            if (remoteCode > BuildConfig.VERSION_CODE) {
                UpdateInfo(
                    versionCode = remoteCode,
                    versionName = json.getString("versionName"),
                    apkUrl = json.getString("apkUrl"),
                    notes = json.optString("notes", "")
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun downloadAndInstall(apkUrl: String, versionName: String) {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("StaffAxis $versionName")
            .setDescription("Descargando actualización...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "StaffAxis-$versionName.apk")
            .setMimeType("application/vnd.android.package-archive")
        dm.enqueue(request)
    }
}
