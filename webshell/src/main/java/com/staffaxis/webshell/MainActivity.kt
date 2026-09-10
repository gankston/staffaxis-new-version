package com.staffaxis.webshell

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Shell nativo: la app vive en el servidor y esto es el WebView que la muestra.
 * Lo unico que queda del lado nativo es lo que el navegador no resuelve bien:
 *
 *   - device_id  -> Settings.Secure.ANDROID_ID. Si viviera en el navegador se
 *                   borraria con los datos del sitio y el telefono perderia el acceso.
 *   - camara     -> intent nativo para las fotos de DNI.
 *   - ubicacion  -> con timeout de 8s, igual que LocationHelper de la app.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    // Pedidos asincronicos en curso (la web manda un id y le contestamos con el).
    private var pedidoFoto: String? = null
    private var pedidoUbicacion: String? = null
    private var archivoFoto: File? = null

    private val tomarFoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val id = pedidoFoto ?: return@registerForActivityResult
        pedidoFoto = null
        if (!ok) return@registerForActivityResult responder(id, null)
        responder(id, JSONObject().put("dataUrl", archivoADataUrl()))
    }

    private val permisoCamara = registerForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
        val id = pedidoFoto
        if (!concedido && id != null) {
            pedidoFoto = null
            responder(id, null)
        } else if (concedido) {
            lanzarCamara()
        }
    }

    private val permisoUbicacion = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { resolverUbicacion() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Sin caché propia del WebView: los headers que manda el servidor son
            // los que mandan (assets con hash inmutables, index revalidado). Si el
            // WebView cachea por su cuenta, una version nueva puede no llegar nunca.
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            addJavascriptInterface(Puente(), "StaffAxisNative")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: android.webkit.WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    // La pantalla de "sin conexión" la dibuja la propia web; si ni
                    // siquiera cargó, mostramos una mínima para no dejar el blanco.
                    if (request?.isForMainFrame == true) view?.loadDataWithBaseURL(
                        null, HTML_SIN_CONEXION, "text/html", "utf-8", null
                    )
                }
            }
        }
        setContentView(web)
        web.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    /** Le contesta a la web el pedido `id` con un JSON (o null si no se pudo). */
    private fun responder(id: String, payload: JSONObject?) {
        val json = payload?.toString() ?: "null"
        val escapado = JSONObject.quote(json)
        runOnUiThread {
            web.evaluateJavascript("window.__staffaxisCallback && window.__staffaxisCallback(${JSONObject.quote(id)}, $escapado)", null)
        }
    }

    private fun archivoADataUrl(): String? {
        val f = archivoFoto ?: return null
        return try {
            // Se comprime antes de mandarla: una foto de 12MP en base64 dentro de
            // un WebView es garantia de OutOfMemory.
            val original = BitmapFactory.decodeFile(f.absolutePath) ?: return null
            val escala = minOf(1f, 1600f / maxOf(original.width, original.height))
            val bmp = if (escala < 1f) Bitmap.createScaledBitmap(
                original, (original.width * escala).toInt(), (original.height * escala).toInt(), true
            ) else original
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 80, out)
            if (bmp !== original) bmp.recycle()
            original.recycle()
            f.delete()
            "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }

    private fun lanzarCamara() {
        val dir = File(cacheDir, "fotos").apply { mkdirs() }
        val f = File(dir, "dni_${System.currentTimeMillis()}.jpg")
        archivoFoto = f
        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", f)
        try {
            tomarFoto.launch(uri)
        } catch (e: Exception) {
            pedidoFoto?.let { responder(it, null) }
            pedidoFoto = null
        }
    }

    @SuppressLint("MissingPermission")
    private fun resolverUbicacion() {
        val id = pedidoUbicacion ?: return
        val tienePermiso = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!tienePermiso) {
            pedidoUbicacion = null
            return responder(id, null)
        }
        try {
            LocationServices.getFusedLocationProviderClient(this)
                .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { loc ->
                    pedidoUbicacion = null
                    if (loc == null) responder(id, null)
                    else responder(id, JSONObject().put("latitude", loc.latitude).put("longitude", loc.longitude))
                }
                .addOnFailureListener {
                    pedidoUbicacion = null
                    responder(id, null)
                }
        } catch (e: Exception) {
            pedidoUbicacion = null
            responder(id, null)
        }
    }

    /** Lo que la web ve como window.StaffAxisNative. */
    inner class Puente {

        @JavascriptInterface
        fun getDeviceId(): String =
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

        @JavascriptInterface
        fun getPhoneModel(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

        @JavascriptInterface
        fun getShellVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun requestLocation(requestId: String) {
            pedidoUbicacion = requestId
            runOnUiThread {
                val falta = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) !=
                    PackageManager.PERMISSION_GRANTED
                if (falta) {
                    permisoUbicacion.launch(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    )
                } else {
                    resolverUbicacion()
                }
            }
        }

        @JavascriptInterface
        fun takePhoto(requestId: String) {
            pedidoFoto = requestId
            runOnUiThread {
                val falta = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) !=
                    PackageManager.PERMISSION_GRANTED
                if (falta) permisoCamara.launch(Manifest.permission.CAMERA) else lanzarCamara()
            }
        }
    }

    private companion object {
        const val HTML_SIN_CONEXION = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{background:#1E1E2E;color:#E1E1E1;font-family:sans-serif;display:flex;
            flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;
            text-align:center;padding:32px}h1{font-size:20px}p{color:#888}</style></head>
            <body><div style="font-size:48px">&#128225;</div><h1>Sin conexión</h1>
            <p>Necesitás señal o wifi para usar StaffAxis.</p></body></html>
        """
    }
}
