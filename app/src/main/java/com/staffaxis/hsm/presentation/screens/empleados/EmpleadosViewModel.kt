package com.staffaxis.hsm.presentation.screens.empleados

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.domain.model.OutboxSubmission
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.domain.repository.AbsenceRepository
import com.staffaxis.hsm.domain.repository.AuthRepository
import com.staffaxis.hsm.domain.repository.EmployeeRepository
import com.staffaxis.hsm.domain.repository.SubmissionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class EmpleadosUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val empleados: List<Employee> = emptyList(),
    val empleadosFiltrados: List<Employee> = emptyList(),
    val busqueda: String = "",
    val sectorId: String = "",
    val sectorName: String = "",
    val tipoCarga: String = "importe",
    val empleadosConHorasHoy: Set<String> = emptySet(),
    val empleadosAusentesHoy: Set<String> = emptySet(),
    val error: String? = null,
    // Dialog cargar horas
    val mostrarDialogoHoras: Boolean = false,
    val empleadoSeleccionado: Employee? = null,
    val fechaSeleccionada: LocalDate = LocalDate.now(),
    val horasSeleccionadas: Int = 8,
    val cargaPorCosecha: Boolean = false,
    val importeMonto: String = "",
    val observaciones: String = "",
    // Dialog editar empleado
    val mostrarDialogoEditar: Boolean = false,
    val empleadoParaEditar: Employee? = null,
    val editNombre: String = "",
    val editApellido: String = "",
    val editDni: String = "",
    val editObservacion: String = "",
    val registrosParaEditar: List<OutboxSubmission> = emptyList(),
    // Edición de un registro de horas
    val registroEnEdicion: OutboxSubmission? = null,
    val horasEdicion: Int = 8,
    val horasEdicionPorCosecha: Boolean = false,
    val horasEdicionPorImporte: String = "",
    // Dialog nuevo empleado
    val mostrarDialogoNuevo: Boolean = false,
    val nuevoDni: String = "",
    val nuevoNombre: String = "",
    val nuevoApellido: String = "",
    val pedirConfirmTransferencia: Boolean = false,
    val pedirConfirmReactivar: Boolean = false,
    val empleadoInactivoId: String = "",
    val empleadoInactivoNombre: String = "",
    // Mensajes
    val mensajeExito: String? = null,
    val mensajeError: String? = null,
    val allowedSectors: List<Sector> = emptyList(),
    val navegarACambiarSector: Boolean = false,
    val recargarMain: Boolean = false
)

@HiltViewModel
class EmpleadosViewModel @Inject constructor(
    private val employeeRepository: EmployeeRepository,
    private val submissionRepository: SubmissionRepository,
    private val absenceRepository: AbsenceRepository,
    private val authRepository: AuthRepository,
    private val prefs: AppPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(EmpleadosUiState())
    val uiState: StateFlow<EmpleadosUiState> = _uiState.asStateFlow()

    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    init {
        loadData()
        loadAllowedSectors()
    }

    private fun loadData() {
        viewModelScope.launch {
            submissionRepository.migrateMinutesToHours()

            val sectorId = prefs.activeSectorId.first() ?: return@launch
            val sectorName = prefs.activeSectorName.first() ?: ""
            val tipoCarga = prefs.activeSectorTipo.first() ?: "importe"
            _uiState.update { it.copy(sectorId = sectorId, sectorName = sectorName, tipoCarga = tipoCarga, isLoading = true) }

            employeeRepository.syncEmployeesFromApi(sectorId, sectorName)

            employeeRepository.getEmployeesForSector(sectorId).collect { empleados ->
                val today = LocalDate.now().format(dateFormatter)
                val sentIds = submissionRepository.getAllActiveForDate(today, sectorId).map { it.employeeId }.toSet()
                val absences = absenceRepository.getAllAbsences().first()
                val todayDate = LocalDate.now()
                val ausentesHoy = absences.filter { a ->
                    a.certificadoMedico && !todayDate.isBefore(a.fechaInicio) && !todayDate.isAfter(a.fechaFin)
                }.map { it.employeeId }.toSet()

                _uiState.update { state ->
                    val filtrados = filtrarEmpleados(empleados, state.busqueda)
                    state.copy(
                        isLoading = false,
                        empleados = empleados,
                        empleadosFiltrados = filtrados,
                        empleadosConHorasHoy = sentIds,
                        empleadosAusentesHoy = ausentesHoy
                    )
                }
            }
        }
    }

    fun refresh() {
        val state = _uiState.value
        if (state.isRefreshing || state.sectorId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            employeeRepository.syncEmployeesFromApi(state.sectorId, state.sectorName)
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    fun onBusquedaChanged(q: String) {
        _uiState.update { it.copy(busqueda = q, empleadosFiltrados = filtrarEmpleados(it.empleados, q)) }
    }

    private fun filtrarEmpleados(lista: List<Employee>, q: String): List<Employee> {
        if (q.isBlank()) return lista
        val lower = q.lowercase()
        return lista.filter { it.nombre.lowercase().contains(lower) || it.dni?.contains(lower) == true }
    }

    fun abrirDialogoHoras(empleado: Employee) {
        _uiState.update {
            it.copy(
                mostrarDialogoHoras = true,
                empleadoSeleccionado = empleado,
                fechaSeleccionada = LocalDate.now(),
                horasSeleccionadas = 8,
                cargaPorCosecha = it.tipoCarga == "cosecha",
                importeMonto = "",
                observaciones = ""
            )
        }
    }

    fun cerrarDialogoHoras() = _uiState.update { it.copy(mostrarDialogoHoras = false, empleadoSeleccionado = null) }

    fun onFechaChanged(fecha: LocalDate) = _uiState.update { it.copy(fechaSeleccionada = fecha) }
    fun onHorasChanged(h: Int) = _uiState.update { it.copy(horasSeleccionadas = h) }
    fun onCosechaChanged(v: Boolean) = _uiState.update { it.copy(cargaPorCosecha = v) }
    fun onImporteChanged(v: String) = _uiState.update { it.copy(importeMonto = v) }
    fun onObservacionesChanged(v: String) = _uiState.update { it.copy(observaciones = v) }

    fun guardarHoras() {
        val state = _uiState.value
        val empleado = state.empleadoSeleccionado ?: return
        val sectorId = state.sectorId
        val fecha = state.fechaSeleccionada.format(dateFormatter)

        val minutesWorked: String? = when {
            state.cargaPorCosecha -> "C"
            state.importeMonto.isNotBlank() -> "\$${state.importeMonto}"
            else -> state.horasSeleccionadas.toString()
        }

        viewModelScope.launch {
            val result = submissionRepository.saveHoras(empleado.id, sectorId, fecha, minutesWorked, state.observaciones.ifBlank { null })
            when (result) {
                is AppResult.Success -> {
                    val sentIds = submissionRepository.getSubmissionsForDate(fecha, sectorId).map { it.employeeId }.toSet()
                    _uiState.update { it.copy(mostrarDialogoHoras = false, empleadoSeleccionado = null, empleadosConHorasHoy = it.empleadosConHorasHoy + empleado.id, mensajeExito = "Horas guardadas correctamente") }
                }
                is AppResult.Error -> _uiState.update { it.copy(mostrarDialogoHoras = false, empleadoSeleccionado = null, mensajeError = result.message) }
            }
        }
    }

    fun abrirDialogoEditar(empleado: Employee) {
        val apellido = empleado.apellido.trim()
        val nombre = empleado.nombre.trim()
        val firstName = if (apellido.isNotEmpty()) nombre.removeSuffix(apellido).trim() else nombre
        _uiState.update {
            it.copy(
                mostrarDialogoEditar = true,
                empleadoParaEditar = empleado,
                editNombre = firstName,
                editApellido = apellido,
                editDni = empleado.dni ?: "",
                editObservacion = empleado.observacion ?: "",
                registrosParaEditar = emptyList()
            )
        }
        viewModelScope.launch {
            val registros = submissionRepository.getSubmissionsForEmployee(empleado.id)
            _uiState.update { it.copy(registrosParaEditar = registros) }
        }
    }

    fun cerrarDialogoEditar() = _uiState.update {
        it.copy(mostrarDialogoEditar = false, empleadoParaEditar = null, registrosParaEditar = emptyList(), registroEnEdicion = null)
    }

    fun abrirEdicionRegistro(registro: OutboxSubmission) {
        val horas = registro.minutesWorked?.toIntOrNull() ?: 8
        val esCosecha = registro.minutesWorked == "C"
        val esImporte = registro.minutesWorked?.startsWith("$") == true
        _uiState.update {
            it.copy(
                registroEnEdicion = registro,
                horasEdicion = if (esCosecha || esImporte) 8 else horas,
                horasEdicionPorCosecha = esCosecha,
                horasEdicionPorImporte = if (esImporte) registro.minutesWorked!!.removePrefix("$") else ""
            )
        }
    }

    fun cerrarEdicionRegistro() = _uiState.update { it.copy(registroEnEdicion = null) }
    fun onHorasEdicionChanged(h: Int) = _uiState.update { it.copy(horasEdicion = h) }
    fun onHorasEdicionPorCosechaChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorCosecha = v, horasEdicionPorImporte = "") }
    fun onHorasEdicionPorImporteChanged(v: String) = _uiState.update { it.copy(horasEdicionPorImporte = v) }

    fun guardarEdicionRegistro() {
        val state = _uiState.value
        val registro = state.registroEnEdicion ?: return
        val nuevasHoras: String? = when {
            state.horasEdicionPorCosecha -> "C"
            state.horasEdicionPorImporte.isNotBlank() -> "$${state.horasEdicionPorImporte}"
            else -> state.horasEdicion.toString()
        }
        viewModelScope.launch {
            submissionRepository.updateHoras(registro.id, nuevasHoras)
            // Refrescar la lista de registros
            val registros = submissionRepository.getSubmissionsForEmployee(registro.employeeId)
            _uiState.update { it.copy(registroEnEdicion = null, registrosParaEditar = registros, mensajeExito = "Registro actualizado") }
        }
    }
    fun onEditNombreChanged(v: String) = _uiState.update { it.copy(editNombre = v) }
    fun onEditApellidoChanged(v: String) = _uiState.update { it.copy(editApellido = v) }
    fun onEditDniChanged(v: String) = _uiState.update { it.copy(editDni = v) }
    fun onEditObservacionChanged(v: String) = _uiState.update { it.copy(editObservacion = v) }

    fun guardarEdicion() {
        val state = _uiState.value
        val empleado = state.empleadoParaEditar ?: return
        viewModelScope.launch {
            employeeRepository.updateEmployee(
                empleado.id,
                state.editNombre.trim(),
                state.editApellido.trim(),
                state.editDni.ifBlank { null },
                state.editObservacion.ifBlank { null }
            )
            _uiState.update { it.copy(mostrarDialogoEditar = false, empleadoParaEditar = null, mensajeExito = "Empleado actualizado") }
        }
    }

    fun ocultarEmpleado(empleado: Employee) {
        viewModelScope.launch {
            employeeRepository.hideEmployee(empleado.id)
            _uiState.update { it.copy(mostrarDialogoEditar = false, empleadoParaEditar = null, mensajeExito = "Empleado eliminado de la lista") }
        }
    }

    fun abrirDialogoNuevo() = _uiState.update { it.copy(mostrarDialogoNuevo = true, nuevoDni = "", nuevoNombre = "", nuevoApellido = "", pedirConfirmTransferencia = false) }
    fun cerrarDialogoNuevo() = _uiState.update { it.copy(mostrarDialogoNuevo = false, pedirConfirmTransferencia = false) }
    fun onNuevoDniChanged(v: String) = _uiState.update { it.copy(nuevoDni = v) }
    fun onNuevoNombreChanged(v: String) = _uiState.update { it.copy(nuevoNombre = v) }
    fun onNuevoApellidoChanged(v: String) = _uiState.update { it.copy(nuevoApellido = v) }

    fun crearEmpleado() {
        val state = _uiState.value
        val nombreCompleto = "${state.nuevoNombre.trim()} ${state.nuevoApellido.trim()}".trim()
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (val result = employeeRepository.createEmployee(nombreCompleto, state.nuevoDni, state.sectorId, state.sectorName, forceTransfer = false)) {
                is AppResult.Success -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, mensajeExito = "Empleado creado: ${result.data.nombre}")
                }
                is AppResult.Error -> when (result.message) {
                    "EXISTS_SAME_SECTOR" -> _uiState.update {
                        it.copy(isLoading = false, mostrarDialogoNuevo = false, mensajeError = "El empleado ya existe en tu sector")
                    }
                    "EXISTS_OTHER_SECTOR" -> _uiState.update {
                        it.copy(isLoading = false, mostrarDialogoNuevo = true, pedirConfirmTransferencia = true)
                    }
                    else -> if (result.message.startsWith("EXISTS_INACTIVE")) {
                        val parts = result.message.split(":", limit = 3)
                        _uiState.update {
                            it.copy(isLoading = false, mostrarDialogoNuevo = true, pedirConfirmReactivar = true, empleadoInactivoId = parts.getOrElse(1) { "" }, empleadoInactivoNombre = parts.getOrElse(2) { "" })
                        }
                    } else {
                        _uiState.update {
                            it.copy(isLoading = false, mostrarDialogoNuevo = false, mensajeError = result.message)
                        }
                    }
                }
            }
        }
    }

    fun confirmarTransferencia() {
        val state = _uiState.value
        val nombreCompleto = "${state.nuevoNombre.trim()} ${state.nuevoApellido.trim()}".trim()
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (val result = employeeRepository.createEmployee(nombreCompleto, state.nuevoDni, state.sectorId, state.sectorName, forceTransfer = true)) {
                is AppResult.Success -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmTransferencia = false, mensajeExito = "Empleado transferido: ${result.data.nombre}")
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmTransferencia = false, mensajeError = result.message)
                }
            }
        }
    }

    fun cancelarTransferencia() = _uiState.update { it.copy(pedirConfirmTransferencia = false, isLoading = false) }

    fun confirmarReactivar() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (employeeRepository.reactivateEmployee(state.empleadoInactivoId)) {
                is AppResult.Success -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmReactivar = false, empleadoInactivoId = "", empleadoInactivoNombre = "", mensajeExito = "${state.empleadoInactivoNombre} vuelve a estar en la lista")
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmReactivar = false, mensajeError = "No se pudo reactivar el empleado")
                }
            }
        }
    }

    fun cancelarReactivar() = _uiState.update { it.copy(pedirConfirmReactivar = false, empleadoInactivoId = "", empleadoInactivoNombre = "") }

    fun clearMensajeExito() = _uiState.update { it.copy(mensajeExito = null) }
    fun clearMensajeError() = _uiState.update { it.copy(mensajeError = null) }

    private fun loadAllowedSectors() {
        viewModelScope.launch {
            when (val result = authRepository.getAllowedSectors()) {
                is AppResult.Success -> _uiState.update { it.copy(allowedSectors = result.data) }
                is AppResult.Error -> Unit
            }
        }
    }

    fun cambiarSector(sector: Sector) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val deviceId = prefs.deviceId.first() ?: return@launch
            val encargadoName = prefs.activeSectorEncargado.first() ?: _uiState.value.sectorName
            authRepository.registerDevice(deviceId, sector.id, encargadoName)
            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, encargadoName)
            _uiState.update { it.copy(isLoading = false, recargarMain = true) }
        }
    }

    fun navegarACambiarSector() {
        viewModelScope.launch {
            prefs.clearActiveSector()
            _uiState.update { it.copy(navegarACambiarSector = true) }
        }
    }
}
