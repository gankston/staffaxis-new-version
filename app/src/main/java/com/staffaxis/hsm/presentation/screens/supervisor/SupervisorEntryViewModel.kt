package com.staffaxis.hsm.presentation.screens.supervisor

import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.LocationHelper
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.SupervisorAccessResult
import com.staffaxis.hsm.domain.model.SupervisorAccessStatus
import com.staffaxis.hsm.domain.model.SupervisorInfo
import com.staffaxis.hsm.domain.repository.SupervisorRepository
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
import javax.inject.Inject

data class SupervisorEntryUiState(
    val isChecking: Boolean = true,
    val yaLogueado: Boolean = false,
    val isLoading: Boolean = false,
    val supervisores: List<SupervisorInfo> = emptyList(),
    val seleccionado: SupervisorInfo? = null,
    val esperandoAutorizacion: Boolean = false,
    val rechazado: Boolean = false,
    val error: String? = null,
    val navegarAlPanel: Boolean = false
)

@HiltViewModel
class SupervisorEntryViewModel @Inject constructor(
    private val repo: SupervisorRepository,
    private val locationHelper: LocationHelper,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(SupervisorEntryUiState())
    val uiState: StateFlow<SupervisorEntryUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val yaLogueado = repo.isSupervisorLoggedIn().first()
            if (yaLogueado) {
                _uiState.update { it.copy(isChecking = false, yaLogueado = true, navegarAlPanel = true) }
                return@launch
            }
            when (val r = repo.listSupervisors()) {
                is AppResult.Success -> _uiState.update { it.copy(isChecking = false, supervisores = r.data) }
                is AppResult.Error -> _uiState.update { it.copy(isChecking = false, error = r.message) }
            }
        }
    }

    private fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

    private fun phoneModel(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    fun onSupervisorSelected(s: SupervisorInfo) = _uiState.update { it.copy(seleccionado = s) }

    fun solicitarAutorizacion() {
        val supervisor = _uiState.value.seleccionado ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val ubicacion = locationHelper.getLocation()
            val result = repo.requestAccess(
                deviceId = deviceId(), supervisorId = supervisor.id, phoneModel = phoneModel(),
                latitude = ubicacion?.latitude, longitude = ubicacion?.longitude
            )
            when (result) {
                is AppResult.Success -> when (val r = result.data) {
                    is SupervisorAccessResult.Authorized -> _uiState.update { it.copy(isLoading = false, navegarAlPanel = true) }
                    is SupervisorAccessResult.Pending -> {
                        _uiState.update { it.copy(isLoading = false, esperandoAutorizacion = true) }
                        esperarAutorizacion(r.requestId, supervisor.id, supervisor.fullName)
                    }
                }
                is AppResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }

    private fun esperarAutorizacion(requestId: String, supervisorId: String, fullName: String) {
        viewModelScope.launch {
            while (isActive) {
                delay(3_000)
                when (val result = repo.checkAccessStatus(requestId, supervisorId, fullName)) {
                    is AppResult.Success -> when (result.data) {
                        is SupervisorAccessStatus.Pending -> { /* seguir esperando */ }
                        is SupervisorAccessStatus.Authorized -> {
                            _uiState.update { it.copy(esperandoAutorizacion = false, navegarAlPanel = true) }
                            return@launch
                        }
                        is SupervisorAccessStatus.Rejected -> {
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
        it.copy(esperandoAutorizacion = false, rechazado = false, seleccionado = null)
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
