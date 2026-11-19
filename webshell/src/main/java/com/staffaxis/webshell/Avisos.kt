package com.staffaxis.webshell

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Notificaciones del telefono (las que suenan con la app cerrada, como WhatsApp).
 *
 * Llegan por Firebase Cloud Messaging. Con la app cerrada o en segundo plano
 * las muestra Android solo, en el canal "avisos" (ver meta-data del manifest).
 * Con la app abierta Android NO las muestra: llegan a onMessageReceived y las
 * mostramos nosotros, asi suenan igual.
 *
 * El token (la "direccion" del telefono en Firebase) se guarda aca y la web lo
 * lee por el puente (getPushToken) para mandarselo al servidor con la sesion.
 */
object Avisos {
    const val CANAL = "avisos"
    private const val PREFS = "staffaxis_avisos"
    private const val CLAVE_TOKEN = "token"

    fun crearCanal(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CANAL) != null) return
        val canal = NotificationChannel(CANAL, "Avisos de StaffAxis", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Tarjas, autorizaciones y avisos del sistema"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 150, 250)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        nm.createNotificationChannel(canal)
    }

    fun token(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CLAVE_TOKEN, "") ?: ""

    fun guardarToken(ctx: Context, token: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CLAVE_TOKEN, token).apply()
    }

    /** Pide el token a Firebase (la primera vez tarda unos segundos). */
    fun refrescarToken(ctx: Context) {
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { t ->
                if (!t.isNullOrBlank()) guardarToken(ctx.applicationContext, t)
            }
        } catch (_: Exception) {
            // Sin Google Play Services no hay notificaciones; la app anda igual.
        }
    }

    fun mostrar(ctx: Context, titulo: String, cuerpo: String) {
        crearCanal(ctx)
        val abrir = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            ctx, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(0xFF9C27B0.toInt())
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n)
        } catch (_: SecurityException) {
            // Sin permiso de notificaciones (Android 13+ y el tipo dijo que no).
        }
    }
}

class AvisosService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Avisos.guardarToken(applicationContext, token)
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        val titulo = msg.notification?.title ?: msg.data["titulo"] ?: "StaffAxis"
        val cuerpo = msg.notification?.body ?: msg.data["cuerpo"] ?: return
        Avisos.mostrar(applicationContext, titulo, cuerpo)
    }
}
