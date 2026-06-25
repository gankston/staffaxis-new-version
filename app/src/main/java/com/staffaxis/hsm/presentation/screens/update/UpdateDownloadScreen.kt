package com.staffaxis.hsm.presentation.screens.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import java.io.File

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val mandatory: Boolean = false,
    val notes: String = ""
)

@Composable
fun UpdateDownloadScreen(
    updateInfo: UpdateInfo,
    onClose: () -> Unit,
    onInstall: () -> Unit
) {
    val context = LocalContext.current
    var downloadStatus by remember { mutableStateOf("Iniciando descarga...") }
    var showInstallButton by remember { mutableStateOf(false) }
    var downloadedApkPath by remember { mutableStateOf<String?>(null) }

    // Inicia la descarga automáticamente al entrar a la pantalla
    LaunchedEffect(Unit) {
        try {
            val downloadId = startDownload(context, updateInfo.apkUrl)
            if (downloadId != -1L) {
                downloadStatus = "Descargando..."
                checkDownloadStatus(context, downloadId) { status, path ->
                    downloadStatus = status
                    if (path != null) {
                        downloadedApkPath = path
                        showInstallButton = true
                    }
                }
            } else {
                downloadStatus = "Error al iniciar la descarga"
            }
        } catch (e: Exception) {
            downloadStatus = "Error: ${e.message}"
        }
    }

    // Solo permite volver atrás si la actualización no es obligatoria
    BackHandler(enabled = !updateInfo.mandatory) { onClose() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF6A1B9A), Color(0xFF4A148C), Color(0xFF1E1E2E))
                )
            )
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.85f)
                .align(Alignment.Center)
                .padding(16.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF2A223C))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Actualización disponible",
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            "Versión ${updateInfo.versionName}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFFB0B0B0)
                        )
                    }
                    if (!updateInfo.mandatory) {
                        IconButton(onClick = onClose) {
                            Icon(Icons.Default.Close, "Cerrar", tint = Color.White)
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Notas de la versión
                if (updateInfo.notes.isNotBlank()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF3A2F4C))
                    ) {
                        Text(
                            updateInfo.notes,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                }

                // Estado de la descarga
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E2E))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            downloadStatus,
                            style = MaterialTheme.typography.titleLarge,
                            color = if (showInstallButton) Color(0xFF4CAF50) else Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        if (!showInstallButton) {
                            Spacer(Modifier.height(20.dp))
                            CircularProgressIndicator(
                                modifier = Modifier.size(52.dp),
                                strokeWidth = 4.dp,
                                color = Color(0xFF26C6DA)
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Botón instalar — aparece automáticamente al terminar la descarga
                if (showInstallButton && downloadedApkPath != null) {
                    Button(
                        onClick = { installApk(context, onInstall) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            "Instalar actualización",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
        }
    }
}

private fun startDownload(context: Context, apkUrl: String): Long {
    return try {
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("Descargando StaffAxis")
            .setDescription("Descargando actualización...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "StaffAxis_update.apk")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
        dm.enqueue(request)
    } catch (e: Exception) {
        -1L
    }
}

private suspend fun checkDownloadStatus(
    context: Context,
    downloadId: Long,
    onUpdate: (String, String?) -> Unit
) {
    val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val query = DownloadManager.Query().setFilterById(downloadId)
    while (true) {
        delay(1000)
        val cursor = dm.query(query)
        try {
            if (cursor.moveToFirst()) {
                val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        val uri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
                        onUpdate("¡Descarga completada!", uri)
                        break
                    }
                    DownloadManager.STATUS_FAILED -> {
                        onUpdate("Error en la descarga", null)
                        break
                    }
                    DownloadManager.STATUS_RUNNING -> {
                        val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                        val pct = if (total > 0) (downloaded * 100 / total).toInt() else 0
                        onUpdate("Descargando... $pct%", null)
                    }
                    DownloadManager.STATUS_PENDING  -> onUpdate("Preparando descarga...", null)
                    DownloadManager.STATUS_PAUSED   -> onUpdate("Descarga pausada...", null)
                }
            }
        } finally {
            cursor.close()
        }
    }
}

private fun installApk(context: Context, onInstall: () -> Unit) {
    try {
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = File(downloadsDir, "StaffAxis_update.apk")
        if (!file.exists()) return

        val installUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        } else {
            Uri.fromFile(file)
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(installUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        onInstall()
    } catch (e: Exception) {
        android.util.Log.e("UpdateInstall", "Error al instalar APK", e)
    }
}
