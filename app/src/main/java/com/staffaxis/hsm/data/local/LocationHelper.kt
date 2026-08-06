package com.staffaxis.hsm.data.local

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

// Portado de Magui DistriManaos, donde se probo el arreglo del "GPS en frio": pedir la
// ubicacion sin timeout puede dejar la app esperando para siempre en telefonos donde el
// chip de GPS no se uso hace rato. Esto nunca cuelga: a los 8 segundos sigue de largo
// con null, y quien llame decide si manda la tarja/solicitud igual sin ubicacion.
@Singleton
class LocationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    fun hasPermission() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED

    /** Devuelve la ubicación actual o null si no hay permiso / timeout (8 seg). */
    suspend fun getLocation(): Location? {
        if (!hasPermission()) return null

        // Intentar última ubicación conocida de ambos providers, quedarse con la más reciente
        val last = try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .mapNotNull { provider ->
                    runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
                }
                .maxByOrNull { it.time }
        } catch (_: Exception) { null }

        // Solo usar la última conocida si fue hace menos de 2 minutos
        if (last != null && System.currentTimeMillis() - last.time < 2 * 60 * 1000) return last

        // Pedir una lectura fresca con timeout de 8 segundos
        // Registrar listener en GPS y Network simultáneamente — el que responda primero gana
        return withTimeoutOrNull(8_000) {
            suspendCancellableCoroutine { cont ->
                val listeners = mutableListOf<android.location.LocationListener>()

                fun resolve(location: Location) {
                    if (cont.isActive) {
                        listeners.forEach { runCatching { manager.removeUpdates(it) } }
                        listeners.clear()
                        cont.resume(location)
                    }
                }

                val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                    .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

                if (providers.isEmpty()) { cont.resume(null); return@suspendCancellableCoroutine }

                providers.forEach { provider ->
                    val listener = object : android.location.LocationListener {
                        override fun onLocationChanged(location: Location) = resolve(location)
                        @Deprecated("") override fun onStatusChanged(p: String?, s: Int, e: android.os.Bundle?) {}
                    }
                    listeners.add(listener)
                    runCatching { manager.requestSingleUpdate(provider, listener, Looper.getMainLooper()) }
                }

                cont.invokeOnCancellation {
                    listeners.forEach { runCatching { manager.removeUpdates(it) } }
                }
            }
        }
    }
}
