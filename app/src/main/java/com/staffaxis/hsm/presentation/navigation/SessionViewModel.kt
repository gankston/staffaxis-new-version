package com.staffaxis.hsm.presentation.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.BuildConfig
import com.staffaxis.hsm.data.local.SessionEvents
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val prefs: AppPreferences,
    private val sessionEvents: SessionEvents,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _startDestination = MutableStateFlow<String?>(null)
    val startDestination: StateFlow<String?> = _startDestination

    // La UI (AppNavigation) escucha esto para cortar en caliente y volver a
    // bienvenida apenas el backend contesta 403 revocado en cualquier pedido.
    val forceLogout: SharedFlow<Unit> = sessionEvents.forceLogout

    fun handleForcedLogout() {
        viewModelScope.launch {
            prefs.clearSessionKeepingLocalData()
        }
    }

    init {
        viewModelScope.launch {
            // Timeout de seguridad: si algo de DataStore se cuelga, nunca dejamos
            // la pantalla en negro para siempre — a los 5s cae a "bienvenida".
            val destino = withTimeoutOrNull(5_000) {
                // Si esta build es mas nueva que la ultima vista, fuerza a pasar de nuevo
                // por la pantalla de autorizacion (sin tocar Room / outbox de tarjas).
                // Se limpia SIEMPRE que cambie el versionCode (incluida la primera vez
                // que corre esta build), que es justamente el objetivo de la migracion
                // al nuevo sistema de autorizacion.
                val lastSeen = prefs.getLastSeenVersionCode()
                if (lastSeen != BuildConfig.VERSION_CODE) {
                    prefs.clearSessionKeepingLocalData()
                    prefs.setLastSeenVersionCode(BuildConfig.VERSION_CODE)
                }

                val token = prefs.deviceToken.first()
                val sectorId = prefs.activeSectorId.first()
                if (token != null && sectorId != null) "main" else "bienvenida"
            }
            _startDestination.value = destino ?: "bienvenida"
        }

        // Heartbeat: mientras haya sesion activa, cada 25s pega contra el backend para
        // detectar una revocacion aunque el usuario no toque nada. El interceptor global
        // de red es el que realmente actua si la respuesta viene 403 revoked.
        viewModelScope.launch {
            while (isActive) {
                delay(25_000)
                if (prefs.deviceToken.first() != null) {
                    authRepository.pingDeviceStatus()
                }
            }
        }
    }
}
