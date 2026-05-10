package com.staffaxis.hsm.presentation.screens.bienvenida

import android.content.Context
import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BienvenidaUiState(
    val isChecking: Boolean = true,
    val isLoading: Boolean = false,
    val tieneToken: Boolean = false,
    val mostrarFormulario: Boolean = false,
    val sectores: List<Sector> = emptyList(),
    val sectorSeleccionado: Sector? = null,
    val isPending: Boolean = false,
    val error: String? = null,
    val navegarAMain: Boolean = false
)

@HiltViewModel
class BienvenidaViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val prefs: AppPreferences,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(BienvenidaUiState())
    val uiState: StateFlow<BienvenidaUiState> = _uiState.asStateFlow()

    init { checkRegistration() }

    private fun checkRegistration() {
        viewModelScope.launch {
            val token = authRepository.getDeviceToken().first()
            if (token != null) {
                val activeSectorId = prefs.activeSectorId.first()
                if (activeSectorId != null) {
                    _uiState.update { it.copy(isChecking = false, navegarAMain = true) }
                    return@launch
                }
                _uiState.update { it.copy(isChecking = false, isLoading = true, tieneToken = true) }
                when (val result = authRepository.getAllowedSectors()) {
                    is AppResult.Success -> {
                        val sectors = result.data
                        if (sectors.size == 1) {
                            prefs.saveActiveSector(sectors[0].id, sectors[0].name, sectors[0].tipoCarga)
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

    fun registrarDispositivo() {
        val state = _uiState.value
        val sector = state.sectorSeleccionado ?: return
        val encargadoName = sector.encargado ?: sector.name

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            when (val result = authRepository.registerDevice(deviceId, sector.id, encargadoName)) {
                is AppResult.Success -> {
                    prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado)
                    _uiState.update { it.copy(isLoading = false, navegarAMain = true) }
                }
                is AppResult.Error -> {
                    val isPending = result.message.contains("pendiente", ignoreCase = true)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isPending = isPending,
                            error = if (!isPending) result.message else null
                        )
                    }
                }
            }
        }
    }

    fun confirmarSector() {
        val sector = _uiState.value.sectorSeleccionado ?: return
        viewModelScope.launch {
            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado)
            _uiState.update { it.copy(navegarAMain = true) }
        }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
