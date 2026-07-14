package com.staffaxis.hsm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.staffaxis.hsm.presentation.navigation.AppNavigation
import com.staffaxis.hsm.presentation.screens.update.UpdateDownloadScreen
import com.staffaxis.hsm.presentation.screens.update.UpdateInfo
import com.staffaxis.hsm.presentation.theme.StaffAxisTheme
import com.staffaxis.hsm.security.EmulatorDetector
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
        val isEmulator = EmulatorDetector.isEmulator(this)

        setContent {
            StaffAxisTheme {
                if (isEmulator) {
                    SafetyNetErrorScreen()
                    return@StaffAxisTheme
                }

                var updateAvailable by remember { mutableStateOf<UpdateInfo?>(null) }
                var showUpdateScreen by remember { mutableStateOf(false) }
                var pendingUpdate by remember { mutableStateOf<UpdateInfo?>(null) }

                LaunchedEffect(Unit) {
                    updateAvailable = checkForUpdate()
                }

                if (showUpdateScreen && pendingUpdate != null) {
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

private data class FakeError(val title: String, val body: String, val detail: String)

private val FAKE_ERRORS = listOf(
    FakeError(
        title = "Initialization failed",
        body = "Play Integrity API could not verify this device. The request could not be completed.",
        detail = "com.google.android.play.core.integrity\nIntegrityServiceException: -8\nDEVICE_NOT_INTEGRITY_VERIFIED"
    ),
    FakeError(
        title = "Security check failed",
        body = "Firebase App Check token could not be obtained. The app cannot connect to backend services.",
        detail = "com.google.firebase.appcheck\nAppCheckException: ERROR_UNKNOWN\nProvider: play-integrity · HTTP 403"
    ),
    FakeError(
        title = "Device binding error",
        body = "Hardware-backed key attestation is not supported on this device. Cannot establish a secure session.",
        detail = "android.security.keystore\nKeyStoreException: HARDWARE_TYPE_UNAVAILABLE\nStrongBox: false · TEE: false"
    ),
    FakeError(
        title = "Compatibility check failed",
        body = "Google Play Services returned an error during attestation. This device does not meet security requirements.",
        detail = "com.google.android.gms.safetynet\nApiException: 7001 · cts: false\nDEVICE_NOT_SUPPORTED"
    )
)

@Composable
private fun SafetyNetErrorScreen() {
    val activity = LocalContext.current as? android.app.Activity
    val error = remember { FAKE_ERRORS.random() }
    var showDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        delay(1500)
        showDialog = true
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (!showDialog) {
            CircularProgressIndicator(
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp)
            )
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { },
            icon = {
                Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
            },
            title = { Text(error.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(error.body)
                    Text(
                        text = error.detail,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 16.sp
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { activity?.finishAffinity() }) {
                    Text("Retry")
                }
            },
            dismissButton = {
                TextButton(onClick = { activity?.finishAffinity() }) {
                    Text("Close")
                }
            }
        )
    }
}
