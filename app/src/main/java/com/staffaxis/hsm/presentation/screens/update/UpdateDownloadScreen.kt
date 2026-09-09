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
import com.staffaxis.hsm.data.update.ApkVerifier
import kotlinx.coroutines.delay
import java.io.File

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val mandatory: Boolean = false,
    val notes: String = "",
    // Para verificar que la descarga llego entera antes de instalar. DownloadManager
    // marca "exitosa" con solo que la conexion HTTP haya terminado sin error — con
    // señal debil en el campo eso puede pasar con el archivo truncado, y ahi Android
    // tira "hay un problema con el archivo de la app" al intentar instalar.
    val expectedSize: Long? = null,
    val expectedSha256: String? = null
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
    var showRetryButton by remember { mutableStateOf(false) }
    var intentoManual by remember { mutableIntStateOf(0) }
    // Nombre real del archivo que quedo bien descargado y verificado — se completa
    // recien cuando la verificacion pasa, es el que usa el boton de instalar.
    var apkFileNameFinal by remember { mutableStateOf("") }

    // Descarga con reintento automatico: DownloadManager marca "exitosa" apenas la
    // conexion HTTP termina sin error, sin garantizar que el archivo haya llegado
    // entero. Con señal debil en el campo eso deja un APK truncado y Android tira
    // "hay un problema con el archivo" al querer instalar. Por eso se verifica tamaño
    // y hash contra lo que dice version.json antes de ofrecer instalar, y si no cierra
    // se reintenta solo — hasta 3 veces — antes de pedirle al usuario que lo intente el.
    LaunchedEffect(intentoManual) {
        showRetryButton = false
        val maxIntentosAuto = 3
        var descargaOk = false
        for (intento in 1..maxIntentosAuto) {
            try {
                downloadStatus = if (intento == 1) "Iniciando descarga..." else "Reintentando descarga ($intento/$maxIntentosAuto)..."
                val nombreArchivo = "StaffAxis_update_${System.currentTimeMillis()}_$intento.apk"
                val downloadId = startDownload(context, updateInfo.apkUrl, nombreArchivo)
                if (downloadId == -1L) {
                    downloadStatus = "Error al iniciar la descarga"
                    continue
                }
                downloadStatus = "Descargando..."
                val transferOk = esperarDescarga(context, downloadId) { status -> downloadStatus = status }
                if (!transferOk) continue

                downloadStatus = "Verificando archivo..."
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val file = File(downloadsDir, nombreArchivo)
                if (ApkVerifier.verificar(file, updateInfo.expectedSize, updateInfo.expectedSha256)) {
                    apkFileNameFinal = nombreArchivo
                    downloadStatus = "¡Descarga completada!"
                    showInstallButton = true
                    descargaOk = true
                    break
                } else {
                    file.delete()
                    downloadStatus = "Descarga incompleta, reintentando..."
                }
            } catch (e: Exception) {
                downloadStatus = "Error: ${e.message}"
            }
        }
        if (!descargaOk) {
            downloadStatus = "No se pudo completar la descarga.\nRevisá la conexión e intentá de nuevo."
            showRetryButton = true
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
                            color = when {
                                showInstallButton -> Color(0xFF4CAF50)
                                showRetryButton -> Color(0xFFFF5252)
                                else -> Color.White
                            },
                            fontWeight = FontWeight.Bold
                        )
                        if (!showInstallButton && !showRetryButton) {
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

                // Se agotaron los reintentos automaticos — deja al usuario intentar de
                // nuevo a mano en vez de dejarlo trabado (la obligatoria no tiene "volver").
                if (showRetryButton) {
                    Button(
                        onClick = { intentoManual++ },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF26C6DA)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            "Reintentar descarga",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }

                // Botón instalar — aparece automáticamente al terminar la descarga y
                // pasar la verificacion de integridad.
                if (showInstallButton) {
                    Button(
                        onClick = { installApk(context, apkFileNameFinal, onInstall) },
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

private fun startDownload(context: Context, apkUrl: String, fileName: String): Long {
    return try {
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("Descargando StaffAxis")
            .setDescription("Descargando actualización...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
        dm.enqueue(request)
    } catch (e: Exception) {
        -1L
    }
}

/** Espera a que DownloadManager termine. Devuelve true solo si la transferencia HTTP
 *  cerro sin error — esto NO garantiza que el archivo este entero, ver verificarApk. */
private suspend fun esperarDescarga(
    context: Context,
    downloadId: Long,
    onUpdate: (String) -> Unit
): Boolean {
    val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val query = DownloadManager.Query().setFilterById(downloadId)
    while (true) {
        delay(1000)
        val cursor = dm.query(query)
        try {
            if (cursor.moveToFirst()) {
                val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> return true
                    DownloadManager.STATUS_FAILED -> {
                        onUpdate("Error en la descarga")
                        return false
                    }
                    DownloadManager.STATUS_RUNNING -> {
                        val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                        val pct = if (total > 0) (downloaded * 100 / total).toInt() else 0
                        onUpdate("Descargando... $pct%")
                    }
                    DownloadManager.STATUS_PENDING  -> onUpdate("Preparando descarga...")
                    DownloadManager.STATUS_PAUSED   -> onUpdate("Descarga pausada...")
                }
            } else {
                // El registro desaparecio de DownloadManager (puede pasar si el usuario
                // borro la descarga desde la notificacion) — no queda nada que esperar.
                return false
            }
        } finally {
            cursor.close()
        }
    }
}


private fun installApk(context: Context, fileName: String, onInstall: () -> Unit) {
    try {
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = File(downloadsDir, fileName)
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
