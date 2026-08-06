package com.staffaxis.hsm

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import java.io.PrintWriter
import java.io.StringWriter
import javax.inject.Inject

@HiltAndroidApp
class StaffAxisApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Sin adb a mano (dispositivos remotos), guardamos cualquier crash en
        // SharedPreferences para poder mostrarlo en pantalla en el proximo arranque.
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                getSharedPreferences("crash_log", MODE_PRIVATE).edit()
                    .putString("last_crash", sw.toString())
                    .putLong("last_crash_time", System.currentTimeMillis())
                    .commit()
            } catch (_: Exception) {
                // no hacer nada, no queremos que el handler de crash tire otro crash
            }
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
