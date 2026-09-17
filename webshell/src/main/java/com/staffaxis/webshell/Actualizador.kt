package com.staffaxis.webshell

import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Actualizador del shell — el mismo que tenia la app nativa, portado tal cual.
 *
 * Aunque la app viva en el servidor y casi todo se actualice solo al recargar la
 * web, esto tiene que estar: si algun dia hay que cambiar el shell (el WebView,
 * la camara, el GPS, el puente del device_id) no hay otra forma de llegar a los
 * telefonos, que estan en el campo. Sin esto habria que instalarlo a mano en cada
 * uno.
 */
object Actualizador {

    private const val URL_VERSION = "https://raw.githubusercontent.com/gankston/staffaxis-updates/main/version.json"
    private const val MAX_INTENTOS = 3

    data class Info(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val mandatory: Boolean,
        val notes: String,
        // Tamaño y hash del APK real, para verificar que la descarga llego entera.
        // Si version.json no los trae (publicacion vieja) quedan null y se saltea.
        val expectedSize: Long?,
        val expectedSha256: String?,
    )

    /** Lee version.json. Devuelve null si no hay nada nuevo o si falla la red. */
    fun buscar(): Info? = try {
        val con = (URL(URL_VERSION).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
        }
        val cuerpo = con.inputStream.bufferedReader().use { it.readText() }
        con.disconnect()
        val j = JSONObject(cuerpo)
        val remoto = j.getInt("versionCode")
        if (remoto > BuildConfig.VERSION_CODE) {
            Info(
                versionCode = remoto,
                versionName = j.getString("versionName"),
                apkUrl = j.getString("apkUrl"),
                mandatory = j.optBoolean("mandatory", false),
                notes = j.optString("notes", ""),
                expectedSize = if (j.has("size")) j.optLong("size") else null,
                expectedSha256 = j.optString("sha256").takeIf { it.isNotBlank() },
            )
        } else null
    } catch (e: Exception) {
        null
    }

    /**
     * Baja el APK y lo verifica. Reintenta solo hasta 3 veces: DownloadManager da la
     * descarga por "exitosa" apenas la conexion HTTP cierra sin error, sin garantizar
     * que el archivo haya llegado entero. Con señal mala en el campo eso deja un APK
     * cortado y Android tira "hay un problema con el archivo" al instalar.
     *
     * Devuelve el nombre del archivo verificado, o null si no se pudo.
     */
    fun descargar(ctx: Context, info: Info, aviso: (String) -> Unit): String? {
        for (intento in 1..MAX_INTENTOS) {
            try {
                aviso(if (intento == 1) "Iniciando descarga..." else "Reintentando descarga ($intento/$MAX_INTENTOS)...")
                val nombre = "StaffAxis_update_${System.currentTimeMillis()}_$intento.apk"
                val id = iniciar(ctx, info.apkUrl, nombre)
                if (id == -1L) continue
                if (!esperar(ctx, id, aviso)) continue

                aviso("Verificando archivo...")
                val f = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), nombre)
                if (verificar(f, info.expectedSize, info.expectedSha256)) return nombre
                f.delete()
                aviso("Descarga incompleta, reintentando...")
            } catch (e: Exception) {
                aviso("Error: ${e.message}")
            }
        }
        return null
    }

    private fun iniciar(ctx: Context, apkUrl: String, nombre: String): Long = try {
        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        dm.enqueue(
            DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("Descargando StaffAxis")
                .setDescription("Descargando actualización...")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
        )
    } catch (e: Exception) {
        -1L
    }

    /** Bloquea hasta que DownloadManager termina. Corre en un hilo aparte. */
    private fun esperar(ctx: Context, id: Long, aviso: (String) -> Unit): Boolean {
        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val q = DownloadManager.Query().setFilterById(id)
        while (true) {
            Thread.sleep(1000)
            val c = dm.query(q)
            try {
                if (!c.moveToFirst()) return false   // el usuario borro la descarga
                when (c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
                    DownloadManager.STATUS_SUCCESSFUL -> return true
                    DownloadManager.STATUS_FAILED -> { aviso("Error en la descarga"); return false }
                    DownloadManager.STATUS_RUNNING -> {
                        val hecho = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                        val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                        aviso("Descargando... ${if (total > 0) (hecho * 100 / total).toInt() else 0}%")
                    }
                    DownloadManager.STATUS_PENDING -> aviso("Preparando descarga...")
                    DownloadManager.STATUS_PAUSED -> aviso("Descarga pausada...")
                }
            } finally {
                c.close()
            }
        }
    }

    /** Compara contra lo que dice version.json. Igual que ApkVerifier de la app. */
    fun verificar(f: File, tam: Long?, sha: String?): Boolean {
        if (!f.exists() || f.length() == 0L) return false
        if (tam != null && f.length() != tam) return false
        if (sha != null && !sha256(f).equals(sha, ignoreCase = true)) return false
        return true
    }

    private fun sha256(f: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { inp ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val leidos = inp.read(buf)
                if (leidos <= 0) break
                d.update(buf, 0, leidos)
            }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    fun instalar(ctx: Context, nombre: String) {
        val f = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), nombre)
        if (!f.exists()) return
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
            FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
        else Uri.fromFile(f)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        )
    }

    /**
     * El cartel, igual que en la app nativa: si la actualizacion es obligatoria no
     * hay "Ahora no" ni se puede cerrar tocando afuera.
     */
    fun mostrarCartel(act: MainActivity, info: Info) {
        val d = AlertDialog.Builder(act)
            .setTitle("Nueva versión disponible")
            .setMessage("Versión ${info.versionName} disponible.\n${info.notes}")
            .setCancelable(!info.mandatory)
            .setPositiveButton("Actualizar") { _, _ -> act.bajarEInstalar(info) }
        if (!info.mandatory) d.setNegativeButton("Ahora no") { dlg, _ -> dlg.dismiss() }
        d.show()
    }
}
