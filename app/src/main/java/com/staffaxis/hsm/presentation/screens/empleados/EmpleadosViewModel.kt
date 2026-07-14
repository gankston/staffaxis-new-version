package com.staffaxis.hsm.presentation.screens.empleados

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
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
    val horasSeleccionadas: Float = 8f,
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
    val horasEdicion: Float = 8f,
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
    // Fotos en dialog nuevo
    val nuevaFrenteUri: Uri? = null,
    val nuevaDorsoUri: Uri? = null,
    // Fotos en dialog editar
    val editFrenteLoading: Boolean = false,
    val editDorsoLoading: Boolean = false,
    val verFotoLado: String? = null,
    val verFotoLoading: Boolean = false,
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

    private val _verFotoBitmap = MutableStateFlow<Bitmap?>(null)
    val verFotoBitmap: StateFlow<Bitmap?> = _verFotoBitmap.asStateFlow()

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
        return lista.filter { it.apellido.lowercase().contains(lower) }
    }

    fun abrirDialogoHoras(empleado: Employee) {
        _uiState.update {
            it.copy(
                mostrarDialogoHoras = true,
                empleadoSeleccionado = empleado,
                fechaSeleccionada = LocalDate.now(),
                horasSeleccionadas = 8f,
                cargaPorCosecha = it.tipoCarga == "cosecha",
                importeMonto = "",
                observaciones = ""
            )
        }
    }

    fun cerrarDialogoHoras() = _uiState.update { it.copy(mostrarDialogoHoras = false, empleadoSeleccionado = null) }

    fun onFechaChanged(fecha: LocalDate) = _uiState.update { it.copy(fechaSeleccionada = fecha) }
    fun onHorasChanged(h: Float) = _uiState.update { it.copy(horasSeleccionadas = h) }
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
            else -> formatHorasValue(state.horasSeleccionadas)
        }

        viewModelScope.launch {
            val result = submissionRepository.saveHoras(empleado.id, sectorId, fecha, minutesWorked, state.observaciones.ifBlank { null })
            when (result) {
                is AppResult.Success -> {
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
                registrosParaEditar = emptyList(),
                editFrenteLoading = false,
                editDorsoLoading = false,
                verFotoLado = null,
                verFotoLoading = false,
            )
        }
        _verFotoBitmap.value = null
        viewModelScope.launch {
            val registros = submissionRepository.getSubmissionsForEmployee(empleado.id)
            _uiState.update { it.copy(registrosParaEditar = registros) }
        }
    }

    fun cerrarDialogoEditar() {
        _verFotoBitmap.value = null
        _uiState.update {
            it.copy(
                mostrarDialogoEditar = false, empleadoParaEditar = null,
                registrosParaEditar = emptyList(), registroEnEdicion = null,
                editFrenteLoading = false, editDorsoLoading = false,
                verFotoLado = null, verFotoLoading = false,
            )
        }
    }

    fun abrirEdicionRegistro(registro: OutboxSubmission) {
        val horas = registro.minutesWorked?.toFloatOrNull() ?: 8f
        val esCosecha = registro.minutesWorked == "C"
        val esImporte = registro.minutesWorked?.startsWith("$") == true
        _uiState.update {
            it.copy(
                registroEnEdicion = registro,
                horasEdicion = if (esCosecha || esImporte) 8f else horas,
                horasEdicionPorCosecha = esCosecha,
                horasEdicionPorImporte = if (esImporte) registro.minutesWorked!!.removePrefix("$") else ""
            )
        }
    }

    fun cerrarEdicionRegistro() = _uiState.update { it.copy(registroEnEdicion = null) }
    fun onHorasEdicionChanged(h: Float) = _uiState.update { it.copy(horasEdicion = h) }
    fun onHorasEdicionPorCosechaChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorCosecha = v, horasEdicionPorImporte = "") }
    fun onHorasEdicionPorImporteChanged(v: String) = _uiState.update { it.copy(horasEdicionPorImporte = v) }

    fun guardarEdicionRegistro() {
        val state = _uiState.value
        val registro = state.registroEnEdicion ?: return
        val nuevasHoras: String? = when {
            state.horasEdicionPorCosecha -> "C"
            state.horasEdicionPorImporte.isNotBlank() -> "$${state.horasEdicionPorImporte}"
            else -> formatHorasValue(state.horasEdicion)
        }
        viewModelScope.launch {
            submissionRepository.updateHoras(registro.id, nuevasHoras)
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

    fun abrirDialogoNuevo() = _uiState.update {
        it.copy(mostrarDialogoNuevo = true, nuevoDni = "", nuevoNombre = "", nuevoApellido = "",
                pedirConfirmTransferencia = false, nuevaFrenteUri = null, nuevaDorsoUri = null)
    }

    fun cerrarDialogoNuevo() = _uiState.update {
        it.copy(mostrarDialogoNuevo = false, pedirConfirmTransferencia = false,
                nuevaFrenteUri = null, nuevaDorsoUri = null)
    }

    fun onNuevoDniChanged(v: String) = _uiState.update { it.copy(nuevoDni = v) }
    fun onNuevoNombreChanged(v: String) = _uiState.update { it.copy(nuevoNombre = v.replace("\n", "")) }
    fun onNuevoApellidoChanged(v: String) = _uiState.update { it.copy(nuevoApellido = v.replace("\n", "")) }
    fun onNuevaFrenteUri(uri: Uri) = _uiState.update { it.copy(nuevaFrenteUri = uri) }
    fun onNuevaDorsoUri(uri: Uri) = _uiState.update { it.copy(nuevaDorsoUri = uri) }
    fun onBorrarNuevaFrente() = _uiState.update { it.copy(nuevaFrenteUri = null) }
    fun onBorrarNuevaDorso() = _uiState.update { it.copy(nuevaDorsoUri = null) }

    fun crearEmpleado() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (val result = employeeRepository.createEmployee(state.nuevoNombre.trim(), state.nuevoApellido.trim(), state.nuevoDni, state.sectorId, state.sectorName, forceTransfer = false)) {
                is AppResult.Success -> {
                    val empId = result.data.id
                    // Subir fotos capturadas (best effort, no bloquean la creación)
                    state.nuevaFrenteUri?.let { employeeRepository.uploadFoto(empId, "frente", it) }
                    state.nuevaDorsoUri?.let { employeeRepository.uploadFoto(empId, "dorso", it) }
                    _uiState.update {
                        it.copy(isLoading = false, mostrarDialogoNuevo = false,
                                nuevaFrenteUri = null, nuevaDorsoUri = null,
                                mensajeExito = "Empleado creado: ${result.data.nombre}")
                    }
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
                            it.copy(isLoading = false, mostrarDialogoNuevo = true, pedirConfirmReactivar = true,
                                    empleadoInactivoId = parts.getOrElse(1) { "" }, empleadoInactivoNombre = parts.getOrElse(2) { "" })
                        }
                    } else {
                        _uiState.update { it.copy(isLoading = false, mostrarDialogoNuevo = false, mensajeError = result.message) }
                    }
                }
            }
        }
    }

    fun confirmarTransferencia() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (val result = employeeRepository.createEmployee(state.nuevoNombre.trim(), state.nuevoApellido.trim(), state.nuevoDni, state.sectorId, state.sectorName, forceTransfer = true)) {
                is AppResult.Success -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmTransferencia = false,
                            nuevaFrenteUri = null, nuevaDorsoUri = null,
                            mensajeExito = "Empleado transferido: ${result.data.nombre}")
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
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmReactivar = false,
                            empleadoInactivoId = "", empleadoInactivoNombre = "",
                            mensajeExito = "${state.empleadoInactivoNombre} vuelve a estar en la lista")
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(isLoading = false, mostrarDialogoNuevo = false, pedirConfirmReactivar = false, mensajeError = "No se pudo reactivar el empleado")
                }
            }
        }
    }

    fun cancelarReactivar() = _uiState.update { it.copy(pedirConfirmReactivar = false, empleadoInactivoId = "", empleadoInactivoNombre = "") }

    // --- Fotos en dialog editar ---

    fun subirFoto(lado: String, uri: Uri) {
        val empId = _uiState.value.empleadoParaEditar?.id ?: return
        viewModelScope.launch {
            if (lado == "frente") _uiState.update { it.copy(editFrenteLoading = true) }
            else _uiState.update { it.copy(editDorsoLoading = true) }

            when (employeeRepository.uploadFoto(empId, lado, uri)) {
                is AppResult.Success -> {
                    val emp = _uiState.value.empleadoParaEditar
                    val updated = if (lado == "frente") emp?.copy(tieneFotoFrente = true)
                                  else emp?.copy(tieneFotoDorso = true)
                    _uiState.update {
                        it.copy(
                            empleadoParaEditar = updated ?: it.empleadoParaEditar,
                            editFrenteLoading = false, editDorsoLoading = false,
                            mensajeExito = "Foto guardada"
                        )
                    }
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(editFrenteLoading = false, editDorsoLoading = false, mensajeError = "Error al subir la foto")
                }
            }
        }
    }

    fun eliminarFoto(lado: String) {
        val empId = _uiState.value.empleadoParaEditar?.id ?: return
        viewModelScope.launch {
            if (lado == "frente") _uiState.update { it.copy(editFrenteLoading = true) }
            else _uiState.update { it.copy(editDorsoLoading = true) }

            when (employeeRepository.deleteFoto(empId, lado)) {
                is AppResult.Success -> {
                    val emp = _uiState.value.empleadoParaEditar
                    val updated = if (lado == "frente") emp?.copy(tieneFotoFrente = false)
                                  else emp?.copy(tieneFotoDorso = false)
                    _uiState.update {
                        it.copy(
                            empleadoParaEditar = updated ?: it.empleadoParaEditar,
                            editFrenteLoading = false, editDorsoLoading = false,
                            mensajeExito = "Foto eliminada"
                        )
                    }
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(editFrenteLoading = false, editDorsoLoading = false, mensajeError = "Error al eliminar la foto")
                }
            }
        }
    }

    fun verFoto(lado: String) {
        val empId = _uiState.value.empleadoParaEditar?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(verFotoLoading = true, verFotoLado = lado) }
            when (val result = employeeRepository.getFotoBytes(empId, lado)) {
                is AppResult.Success -> {
                    val bitmap = BitmapFactory.decodeByteArray(result.data, 0, result.data.size)
                    _verFotoBitmap.value = bitmap
                    _uiState.update { it.copy(verFotoLoading = false) }
                }
                is AppResult.Error -> {
                    _uiState.update { it.copy(verFotoLoading = false, verFotoLado = null, mensajeError = "Error al cargar la foto") }
                }
            }
        }
    }

    fun cerrarVerFoto() {
        _verFotoBitmap.value = null
        _uiState.update { it.copy(verFotoLado = null, verFotoLoading = false) }
    }

    fun clearMensajeExito() = _uiState.update { it.copy(mensajeExito = null) }
    fun clearMensajeError() = _uiState.update { it.copy(mensajeError = null) }

    private fun formatHorasValue(h: Float): String =
        if (h % 1f == 0f) h.toInt().toString() else h.toString()

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
