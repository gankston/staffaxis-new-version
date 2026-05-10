package com.staffaxis.hsm.presentation.screens.ausencias

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.model.Absence
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.domain.repository.AbsenceRepository
import com.staffaxis.hsm.domain.repository.EmployeeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import javax.inject.Inject

data class AusenciasUiState(
    val isLoading: Boolean = false,
    val mesActual: YearMonth = YearMonth.now(),
    val empleados: List<Employee> = emptyList(),
    val ausencias: List<Absence> = emptyList(),
    val empleadoSeleccionado: Employee? = null,
    val fechaInicio: LocalDate? = null,
    val fechaFin: LocalDate? = null,
    val certificadoMedico: Boolean = false,
    val observaciones: String = "",
    val mostrarFormulario: Boolean = false,
    val error: String? = null,
    val mensajeExito: String? = null
)

@HiltViewModel
class AusenciasViewModel @Inject constructor(
    private val absenceRepository: AbsenceRepository,
    private val employeeRepository: EmployeeRepository,
    private val prefs: AppPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(AusenciasUiState())
    val uiState: StateFlow<AusenciasUiState> = _uiState.asStateFlow()

    init { loadData() }

    private fun loadData() {
        viewModelScope.launch {
            val sectorId = prefs.activeSectorId.first() ?: return@launch
            absenceRepository.removeDuplicates()

            combine(
                employeeRepository.getEmployeesForSector(sectorId),
                absenceRepository.getAllAbsences()
            ) { empleados, ausencias -> Pair(empleados, ausencias) }.collect { (empleados, ausencias) ->
                _uiState.update { it.copy(empleados = empleados, ausencias = ausencias) }
            }
        }
    }

    fun onEmpleadoSelected(e: Employee) = _uiState.update { it.copy(empleadoSeleccionado = e) }
    fun onFechaInicioChanged(f: LocalDate) = _uiState.update { it.copy(fechaInicio = f) }
    fun onFechaFinChanged(f: LocalDate) = _uiState.update { it.copy(fechaFin = f) }
    fun onCertificadoChanged(v: Boolean) = _uiState.update { it.copy(certificadoMedico = v) }
    fun onObservacionesChanged(v: String) = _uiState.update { it.copy(observaciones = v) }
    fun mostrarFormulario() = _uiState.update { it.copy(mostrarFormulario = true) }
    fun cerrarFormulario() = _uiState.update { it.copy(mostrarFormulario = false, empleadoSeleccionado = null) }
    fun clearMensajes() = _uiState.update { it.copy(mensajeExito = null, error = null) }

    fun guardarAusencia() {
        val state = _uiState.value
        val empleado = state.empleadoSeleccionado ?: return
        val inicio = state.fechaInicio ?: return
        val fin = state.fechaFin ?: return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val result = absenceRepository.createAbsence(
                empleado.id, empleado.nombre,
                inicio.toString(), fin.toString(),
                state.certificadoMedico, state.observaciones.ifBlank { null }
            )
            when (result) {
                is AppResult.Success -> _uiState.update { it.copy(isLoading = false, mostrarFormulario = false, mensajeExito = "Ausencia registrada") }
                is AppResult.Error -> _uiState.update { it.copy(isLoading = false, error = result.message) }
            }
        }
    }
}
