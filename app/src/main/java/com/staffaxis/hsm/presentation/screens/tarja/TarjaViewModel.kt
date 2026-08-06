package com.staffaxis.hsm.presentation.screens.tarja

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.domain.model.EmployeeTransfer
import com.staffaxis.hsm.domain.model.OutboxSubmission
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.domain.model.TarjaStatus
import com.staffaxis.hsm.domain.model.TarjaValores
import com.staffaxis.hsm.domain.repository.AbsenceRepository
import com.staffaxis.hsm.domain.repository.AuthRepository
import com.staffaxis.hsm.domain.repository.EmployeeRepository
import com.staffaxis.hsm.domain.repository.SubmissionRepository
import com.staffaxis.hsm.domain.repository.TarjaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class TarjaUiState(
    val isLoading: Boolean = false,
    val isCerrando: Boolean = false,
    val fecha: String = "",
    val sectorId: String = "",
    val sectorName: String = "",
    val encargadoName: String = "",
    val tarjaStatus: TarjaStatus? = null,
    val empleadosTotal: Int = 0,
    val empleadosTarjados: Int = 0,
    val ausentesHoy: Int = 0,
    val horasTarjadas: Float = 0f,
    val pendingCount: Int = 0,
    val cosechaDelDia: Float = 0f,
    val cajasDelDia: Int = 0,
    val cajonesDelDia: Int = 0,
    val montoDelDia: Float = 0f,
    val transfers: List<EmployeeTransfer> = emptyList(),
    val error: String? = null,
    val mensajeExito: String? = null,
    val allowedSectors: List<Sector> = emptyList(),
    val navegarACambiarSector: Boolean = false,
    val recargarMain: Boolean = false,
    // Selector de período
    val periodoOffset: Int = 0,
    val periodoLabel: String = "",
    // Visualizador de horas
    val mostrarVisualizador: Boolean = false,
    val visualizadorData: List<ResumenEmpleadoHoras> = emptyList(),
    val visualizadorFechas: List<String> = emptyList(),
    val visualizadorLoading: Boolean = false,
    val visualizadorError: String? = null
)

data class ResumenEmpleadoHoras(
    val empleado: Employee,
    val horasPorDia: Map<String, String?>,
    val totalHoras: Float,
    // Cachos de cosecha sumados (antes contaba cuantos empleados tenian cosecha)
    val cosechaTotal: Float,
    val importeTotal: Float,
    val cajasTotal: Int = 0,
    val cajonesTotal: Int = 0
)

@HiltViewModel
class TarjaViewModel @Inject constructor(
    private val tarjaRepository: TarjaRepository,
    private val submissionRepository: SubmissionRepository,
    private val employeeRepository: EmployeeRepository,
    private val absenceRepository: AbsenceRepository,
    private val authRepository: AuthRepository,
    private val prefs: AppPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(TarjaUiState())
    val uiState: StateFlow<TarjaUiState> = _uiState.asStateFlow()

    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    init {
        loadData()
        loadAllowedSectors()
        actualizarPeriodoLabel(0)
    }

    private fun loadData() {
        viewModelScope.launch {
            val sectorId = prefs.activeSectorId.first() ?: return@launch
            val sectorName = prefs.activeSectorName.first() ?: ""
            val encargado = prefs.activeSectorEncargado.first() ?: ""
            val today = LocalDate.now().format(dateFormatter)

            _uiState.update { it.copy(sectorId = sectorId, sectorName = sectorName, encargadoName = encargado, fecha = today) }

            combine(
                tarjaRepository.getTarjaStatus(today, sectorId),
                employeeRepository.getEmployeesForSector(sectorId),
                absenceRepository.getAllAbsences(),
                submissionRepository.countPending(),
                employeeRepository.getTransfersForDate(sectorId, today)
            ) { status, empleados, ausencias, pending, transfers ->
                val todayDate = LocalDate.now()
                val ausentesHoy = ausencias.count { a ->
                    a.certificadoMedico && !todayDate.isBefore(a.fechaInicio) && !todayDate.isAfter(a.fechaFin)
                }
                val submissions = submissionRepository.getAllActiveForDate(today, sectorId)
                val tarjados = submissions.size
                val valores = TarjaValores.sumar(submissions.map { it.minutesWorked })

                Quad(status, empleados.size, ausentesHoy, tarjados, valores, pending, transfers)
            }.collect { (status, total, ausentes, tarjados, valores, pending, transfers) ->
                _uiState.update { state ->
                    state.copy(
                        tarjaStatus = status,
                        empleadosTotal = total,
                        empleadosTarjados = status?.empleadosTarjados ?: tarjados,
                        ausentesHoy = ausentes,
                        // Siempre los totales calculados en vivo: los guardados en tarja_status
                        // de tarjas viejas quedaron en 0 por el bug de parseo.
                        horasTarjadas = valores.horas,
                        pendingCount = pending,
                        cosechaDelDia = valores.cosecha,
                        cajasDelDia = valores.cajas,
                        cajonesDelDia = valores.cajones,
                        montoDelDia = valores.importe,
                        transfers = transfers,
                        isLoading = false
                    )
                }
            }
        }
    }

    fun cerrarTarja() {
        val state = _uiState.value
        if (state.isCerrando || state.sectorId.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isCerrando = true, error = null) }
            when (val result = tarjaRepository.cerrarTarja(state.sectorId, state.fecha)) {
                is AppResult.Success -> _uiState.update {
                    it.copy(
                        isCerrando = false,
                        tarjaStatus = result.data,
                        mensajeExito = "Tarja cerrada correctamente"
                    )
                }
                is AppResult.Error -> _uiState.update {
                    it.copy(isCerrando = false, error = result.message)
                }
            }
        }
    }

    private fun loadAllowedSectors() {
        viewModelScope.launch {
            when (val result = authRepository.getAllowedSectors()) {
                is AppResult.Success -> _uiState.update { it.copy(allowedSectors = result.data) }
                is AppResult.Error -> Unit
            }
        }
    }

    fun navegarACambiarSector() {
        viewModelScope.launch {
            prefs.clearActiveSector()
            _uiState.update { it.copy(navegarACambiarSector = true) }
        }
    }

    fun cambiarSector(sector: Sector) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val deviceId = prefs.deviceId.first() ?: return@launch
            val nombre = prefs.userFullName.first()
                ?: prefs.activeSectorEncargado.first()
                ?: _uiState.value.encargadoName
            // requestAccess (no el registro viejo): el endpoint viejo devolvia el token
            // que ya existia sin actualizar el sector en el servidor, asi que el token
            // quedaba apuntando al sector anterior.
            authRepository.requestAccess(
                deviceId = deviceId, sectorId = sector.id, fullName = nombre,
                phoneModel = null, latitude = null, longitude = null
            )
            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, sector.encargado)
            _uiState.update { it.copy(isLoading = false, recargarMain = true) }
        }
    }

    fun clearMensajes() = _uiState.update { it.copy(mensajeExito = null, error = null) }

    fun cambiarPeriodo(delta: Int) {
        val nuevoOffset = (_uiState.value.periodoOffset + delta).coerceAtMost(0)
        actualizarPeriodoLabel(nuevoOffset)
    }

    private fun actualizarPeriodoLabel(offset: Int) {
        val (start, end) = calcularPeriodo(LocalDate.now(), offset)
        val fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")
        _uiState.update {
            it.copy(periodoOffset = offset, periodoLabel = "${start.format(fmt)} – ${end.format(fmt)}")
        }
    }

    fun abrirVisualizador() {
        val state = _uiState.value
        if (state.sectorId.isBlank()) return
        _uiState.update { it.copy(mostrarVisualizador = true, visualizadorLoading = true, visualizadorError = null) }
        viewModelScope.launch {
            val today = LocalDate.now()
            val (startDate, endDate) = calcularPeriodo(today, state.periodoOffset)

            val fechas = mutableListOf<String>()
            var d = startDate
            while (!d.isAfter(endDate)) {
                fechas.add(d.format(dateFormatter))
                d = d.plusDays(1)
            }

            val startStr = startDate.format(dateFormatter)
            val endStr = endDate.format(dateFormatter)

            val periodSubmissions = try {
                submissionRepository.fetchReport(state.sectorId, startStr, endStr)
            } catch (e: Exception) {
                _uiState.update { it.copy(visualizadorLoading = false, visualizadorError = "Error al cargar: ${e.message}") }
                return@launch
            }

            val empleados = employeeRepository.getEmployeesForSector(state.sectorId).first()
            val empleadoMap = empleados.associateBy { it.id }

            val resumen = periodSubmissions
                .groupBy { it.employeeId }
                .mapNotNull { (empId, subs) ->
                    val emp = empleadoMap[empId] ?: return@mapNotNull null
                    val horasPorDia = subs.associate { it.date to it.minutesWorked }
                    val v = TarjaValores.sumar(subs.map { it.minutesWorked })
                    ResumenEmpleadoHoras(emp, horasPorDia, v.horas, v.cosecha, v.importe, v.cajas, v.cajones)
                }
                .sortedBy { emp ->
                    emp.empleado.apellido.ifBlank {
                        // fallback: último token de nombre (nombre = "FIRSTNAME LASTNAME")
                        emp.empleado.nombre.trim().substringAfterLast(" ").ifBlank { emp.empleado.nombre }
                    }
                }

            _uiState.update {
                it.copy(
                    visualizadorData = resumen,
                    visualizadorFechas = fechas,
                    visualizadorLoading = false
                )
            }
        }
    }

    fun cerrarVisualizador() = _uiState.update { it.copy(mostrarVisualizador = false) }

    private fun calcularPeriodo(today: LocalDate, offset: Int = 0): Pair<LocalDate, LocalDate> {
        val (start, end) = if (today.dayOfMonth >= 21) {
            Pair(today.withDayOfMonth(21), today.plusMonths(1).withDayOfMonth(20))
        } else {
            Pair(today.minusMonths(1).withDayOfMonth(21), today.withDayOfMonth(20))
        }
        return Pair(start.plusMonths(offset.toLong()), end.plusMonths(offset.toLong()))
    }
}

private data class Quad(
    val status: TarjaStatus?,
    val total: Int,
    val ausentes: Int,
    val tarjados: Int,
    val valores: TarjaValores,
    val pending: Int,
    val transfers: List<EmployeeTransfer>
)
