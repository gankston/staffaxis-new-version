package com.staffaxis.hsm.presentation.screens.bienvenida

import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.LocationHelper
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.model.AccessRequestResult
import com.staffaxis.hsm.domain.model.AccessStatus
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

data class BienvenidaUiState(
    val isChecking: Boolean = true,
    val isLoading: Boolean = false,
    val tieneToken: Boolean = false,
    val mostrarFormulario: Boolean = false,
    val sectores: List<Sector> = emptyList(),
    val sectorSeleccionado: Sector? = null,
    val nombreCompleto: String = "",
    val esperandoAutorizacion: Boolean = false,
    val rechazado: Boolean = false,
    val error: String? = null,
    val navegarAMain: Boolean = false
)

@HiltViewModel
class BienvenidaViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val prefs: AppPreferences,
    private val locationHelper: LocationHelper,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(BienvenidaUiState())
    val uiState: StateFlow<BienvenidaUiState> = _uiState.asStateFlow()

    init { checkRegistration() }

    private fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

    private fun phoneModel(): String =
        "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    private fun checkRegistration() {
        viewModelScope.launch {
            // Timeout de seguridad: nunca se queda colgado en la pantalla negra de "isChecking".
            val listo = withTimeoutOrNull(5_000) {
                val token = authRepository.getDeviceToken().first()
                if (token != null) {
                    val activeSectorId = prefs.activeSectorId.first()
                    if (activeSectorId != null) {
                        _uiState.update { it.copy(isChecking = false, navegarAMain = true) }
                        return@withTimeoutOrNull
                    }
                    _uiState.update { it.copy(isChecking = false, isLoading = true, tieneToken = true) }
                    when (val result = authRepository.getAllowedSectors()) {
                        is AppResult.Success -> {
                            val sectors = result.data
                            if (sectors.size == 1) {
                                prefs.saveActiveSector(sectors[0].id, sectors[0].name, sectors[0].tipoCarga, tiposCarga = sectors[0].tiposCarga)
                                _uiState.update { it.copy(isLoading = false, navegarAMain = true) }
                            } else {
                                _uiState.update { it.copy(isLoading = false, mostrarFormulario = true, sectores = sectors) }
                            }
                        }
                        is AppResult.Error -> {
                            _uiState.update { it.copy(isLoading = false, error = result.message) }
                        }
                    }
                } else {
                    _uiState.update { it.copy(isChecking = false) }
                }
            }
            if (listo == null) {
                _uiState.update { it.copy(isChecking = false, isLoading = false) }
            }
        }
    }

    fun mostrarFormularioRegistro() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val result = authRepository.fetchPublicSectors()) {
                is AppResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            mostrarFormulario = true,
                            sectores = result.data
                        )
                    }
                }
                is AppResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "No se pudieron cargar los sectores: ${result.message}"
                        )
                    }
                }
            }
        }
    }

    fun onSectorSelected(sector: Sector) = _uiState.update { it.copy(sectorSeleccionado = sector) }
    fun onNombreCompletoChanged(v: String) = _uiState.update { it.copy(nombreCompleto = v) }

    // Reemplaza al viejo "registrarDispositivo": ya no se auto-aprueba nadie.
    // Pide autorizacion con nombre completo — puede quedar pendiente (StaffAdmin tiene que
    // aprobarla) o autorizarse al toque si el telefono es maestro o ya estaba aprobado antes.
    fun solicitarAutorizacion() {
        val state = _uiState.value
        val sector = state.sectorSeleccionado ?: return
        val nombre = state.nombreCompleto.trim()
        if (nombre.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val ubicacion = locationHelper.getLocation()
            val result = authRepository.requestAccess(
                deviceId = deviceId(),
                sectorId = sector.id,
                fullName = nombre,
                phoneModel = phoneModel(),
                latitude = ubicacion?.latitude,
                longitude = ubicacion?.longitude
            )
            when (result) {
                is AppResult.Success -> when (val r = result.data) {
                    is AccessRequestResult.Authorized -> {
                        prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado, sector.tiposCarga)
                        _uiState.update { it.copy(isLoading = false, navegarAMain = true) }
                    }
                    is AccessRequestResult.Pending -> {
                        _uiState.update { it.copy(isLoading = false, esperandoAutorizacion = true) }
                        esperarAutorizacion(r.requestId, sector)
                    }
                }
                is AppResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    // Polling: consulta cada 3 segundos si ya lo autorizaron. Se corta solo si
    // el usuario cierra la app o si el ViewModel se destruye (viewModelScope).
    private fun esperarAutorizacion(requestId: String, sector: Sector) {
        viewModelScope.launch {
            while (isActive) {
                delay(3_000)
                when (val result = authRepository.checkAccessStatus(requestId, deviceId())) {
                    is AppResult.Success -> when (val status = result.data) {
                        is AccessStatus.Pending -> { /* seguir esperando */ }
                        is AccessStatus.Authorized -> {
                            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado, sector.tiposCarga)
                            _uiState.update { it.copy(esperandoAutorizacion = false, navegarAMain = true) }
                            return@launch
                        }
                        is AccessStatus.Rejected -> {
                            _uiState.update { it.copy(esperandoAutorizacion = false, rechazado = true) }
                            return@launch
                        }
                    }
                    is AppResult.Error -> { /* error de red puntual, reintenta en el proximo ciclo */ }
                }
            }
        }
    }

    fun cancelarEspera() = _uiState.update {
        it.copy(esperandoAutorizacion = false, rechazado = false, sectorSeleccionado = null, nombreCompleto = "")
    }

    fun confirmarSector() {
        val sector = _uiState.value.sectorSeleccionado ?: return
        viewModelScope.launch {
            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado, sector.tiposCarga)
            _uiState.update { it.copy(navegarAMain = true) }
        }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
