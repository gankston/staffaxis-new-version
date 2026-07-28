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
    val cachosCount: String = "",
    val cargaPorAbonada: Boolean = false,
    val abonadaValor: String = "",
    val cargaPorCajas: Boolean = false,
    val cajasCount: String = "",
    val cargaPorCajones: Boolean = false,
    val cajonesCount: String = "",
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
    val horasEdicionCachosCount: String = "",
    val horasEdicionPorAbonada: Boolean = false,
    val horasEdicionAbonadaValor: String = "",
    val horasEdicionPorCajas: Boolean = false,
    val horasEdicionCajasCount: String = "",
    val horasEdicionPorCajones: Boolean = false,
    val horasEdicionCajonesCount: String = "",
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
                cachosCount = "",
                cargaPorAbonada = false,
                abonadaValor = "",
                cargaPorCajas = false,
                cajasCount = "",
                cargaPorCajones = false,
                cajonesCount = "",
                observaciones = ""
            )
        }
    }

    fun cerrarDialogoHoras() = _uiState.update { it.copy(mostrarDialogoHoras = false, empleadoSeleccionado = null) }

    fun onFechaChanged(fecha: LocalDate) = _uiState.update { it.copy(fechaSeleccionada = fecha) }
    fun onHorasChanged(h: Float) = _uiState.update { it.copy(horasSeleccionadas = h) }
    fun onCosechaChanged(v: Boolean) = _uiState.update { it.copy(cargaPorCosecha = v, cachosCount = if (!v) "" else it.cachosCount) }
    fun onCachosCountChanged(v: String) = _uiState.update { it.copy(cachosCount = v) }
    fun onAbonadaChanged(v: Boolean) = _uiState.update { it.copy(cargaPorAbonada = v, abonadaValor = if (!v) "" else it.abonadaValor) }
    fun onAbonadaValorChanged(v: String) = _uiState.update { it.copy(abonadaValor = v) }
    fun onCajasChanged(v: Boolean) = _uiState.update { it.copy(cargaPorCajas = v, cajasCount = if (!v) "" else it.cajasCount) }
    fun onCajasCountChanged(v: String) = _uiState.update { it.copy(cajasCount = v) }
    fun onCajonesChanged(v: Boolean) = _uiState.update { it.copy(cargaPorCajones = v, cajonesCount = if (!v) "" else it.cajonesCount) }
    fun onCajonesCountChanged(v: String) = _uiState.update { it.copy(cajonesCount = v) }
    fun onObservacionesChanged(v: String) = _uiState.update { it.copy(observaciones = v) }

    // Arma el segmento "Cajas X Cajones Y" (o solo uno de los dos) para el string compuesto.
    private fun buildCajasCajonesSegment(porCajas: Boolean, cajas: String, porCajones: Boolean, cajones: String): String =
        buildString {
            if (porCajas) append("Cajas ${cajas.trim()}")
            if (porCajas && porCajones) append(" ")
            if (porCajones) append("Cajones ${cajones.trim()}")
        }

    fun guardarHoras() {
        val state = _uiState.value
        val empleado = state.empleadoSeleccionado ?: return
        // A partir de ahora, sin DNI cargado no se puede registrar una tarja nueva.
        if (empleado.dni.isNullOrBlank()) return
        if (state.cargaPorCosecha && state.cachosCount.isBlank()) return
        if (state.cargaPorAbonada && state.abonadaValor.isBlank()) return
        if (state.cargaPorCajas && state.cajasCount.isBlank()) return
        if (state.cargaPorCajones && state.cajonesCount.isBlank()) return

        val sectorId = state.sectorId
        val fecha = state.fechaSeleccionada.format(dateFormatter)

        val parts = mutableListOf(formatHorasValue(state.horasSeleccionadas))
        if (state.cargaPorCosecha) parts.add("C:${state.cachosCount.trim()}")
        if (state.cargaPorAbonada) parts.add("AB:${state.abonadaValor.trim()}")
        val cajasCajones = buildCajasCajonesSegment(state.cargaPorCajas, state.cajasCount, state.cargaPorCajones, state.cajonesCount)
        if (cajasCajones.isNotBlank()) parts.add(cajasCajones)
        val minutesWorked: String? = if (parts.size == 1) parts[0] else parts.joinToString("|")

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
        val mw = registro.minutesWorked
        val parts = mw?.split("|") ?: emptyList()
        val cosechaPart = parts.firstOrNull { it == "C" || it.startsWith("C:") }
        val abonadaPart = parts.firstOrNull { it.startsWith("AB:") }
        val esCosecha = cosechaPart != null
        val cachosCount = if (cosechaPart?.startsWith("C:") == true) cosechaPart.removePrefix("C:") else ""
        val esAbonada = abonadaPart != null
        val abonadaValor = abonadaPart?.removePrefix("AB:") ?: ""
        // Segmento "Cajas X Cajones Y" (o solo uno de los dos)
        val cajasCajonesPart = parts.firstOrNull { it.startsWith("Cajas ") || it.startsWith("Cajones ") }
        val cajasMatch = cajasCajonesPart?.let { Regex("Cajas ([0-9]+(?:[.,][0-9]+)?)").find(it) }
        val cajonesMatch = cajasCajonesPart?.let { Regex("Cajones ([0-9]+(?:[.,][0-9]+)?)").find(it) }
        val esCajas = cajasMatch != null
        val cajasCount = cajasMatch?.groupValues?.get(1) ?: ""
        val esCajones = cajonesMatch != null
        val cajonesCount = cajonesMatch?.groupValues?.get(1) ?: ""
        // Horas: nuevo formato "H 4" tiene prioridad; si no, cae al formato viejo (número plano) para compatibilidad
        val horasPartNuevo = parts.firstOrNull { it.startsWith("H ") }
        val horasPartViejo = parts.firstOrNull { it.toFloatOrNull() != null }
        val horas = horasPartNuevo?.removePrefix("H ")?.trim()?.toFloatOrNull()
            ?: horasPartViejo?.toFloatOrNull()
            ?: if (esCosecha || esAbonada || esCajas || esCajones) 0f else mw?.toFloatOrNull() ?: 8f
        _uiState.update {
            it.copy(
                registroEnEdicion = registro,
                horasEdicion = horas,
                horasEdicionPorCosecha = esCosecha,
                horasEdicionCachosCount = cachosCount,
                horasEdicionPorAbonada = esAbonada,
                horasEdicionAbonadaValor = abonadaValor,
                horasEdicionPorCajas = esCajas,
                horasEdicionCajasCount = cajasCount,
                horasEdicionPorCajones = esCajones,
                horasEdicionCajonesCount = cajonesCount,
            )
        }
    }

    fun cerrarEdicionRegistro() = _uiState.update { it.copy(registroEnEdicion = null) }
    fun onHorasEdicionChanged(h: Float) = _uiState.update { it.copy(horasEdicion = h) }
    fun onHorasEdicionPorCosechaChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorCosecha = v, horasEdicionCachosCount = if (!v) "" else it.horasEdicionCachosCount) }
    fun onHorasEdicionCachosCountChanged(v: String) = _uiState.update { it.copy(horasEdicionCachosCount = v) }
    fun onHorasEdicionPorAbonadaChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorAbonada = v, horasEdicionAbonadaValor = if (!v) "" else it.horasEdicionAbonadaValor) }
    fun onHorasEdicionAbonadaValorChanged(v: String) = _uiState.update { it.copy(horasEdicionAbonadaValor = v) }
    fun onHorasEdicionPorCajasChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorCajas = v, horasEdicionCajasCount = if (!v) "" else it.horasEdicionCajasCount) }
    fun onHorasEdicionCajasCountChanged(v: String) = _uiState.update { it.copy(horasEdicionCajasCount = v) }
    fun onHorasEdicionPorCajonesChanged(v: Boolean) = _uiState.update { it.copy(horasEdicionPorCajones = v, horasEdicionCajonesCount = if (!v) "" else it.horasEdicionCajonesCount) }
    fun onHorasEdicionCajonesCountChanged(v: String) = _uiState.update { it.copy(horasEdicionCajonesCount = v) }

    fun guardarEdicionRegistro() {
        val state = _uiState.value
        val registro = state.registroEnEdicion ?: return
        if (state.horasEdicionPorCosecha && state.horasEdicionCachosCount.isBlank()) return
        if (state.horasEdicionPorAbonada && state.horasEdicionAbonadaValor.isBlank()) return
        if (state.horasEdicionPorCajas && state.horasEdicionCajasCount.isBlank()) return
        if (state.horasEdicionPorCajones && state.horasEdicionCajonesCount.isBlank()) return
        val editParts = mutableListOf(formatHorasValue(state.horasEdicion))
        if (state.horasEdicionPorCosecha) editParts.add("C:${state.horasEdicionCachosCount.trim()}")
        if (state.horasEdicionPorAbonada) editParts.add("AB:${state.horasEdicionAbonadaValor.trim()}")
        val cajasCajonesEd = buildCajasCajonesSegment(state.horasEdicionPorCajas, state.horasEdicionCajasCount, state.horasEdicionPorCajones, state.horasEdicionCajonesCount)
        if (cajasCajonesEd.isNotBlank()) editParts.add(cajasCajonesEd)
        val nuevasHoras: String? = if (editParts.size == 1) editParts[0] else editParts.joinToString("|")
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
        "H " + (if (h % 1f == 0f) h.toInt().toString() else h.toString())

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
