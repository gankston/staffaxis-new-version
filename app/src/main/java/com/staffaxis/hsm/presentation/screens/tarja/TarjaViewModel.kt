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
    val cosechaDelDia: Int = 0,
    val montoDelDia: Float = 0f,
    val transfers: List<EmployeeTransfer> = emptyList(),
    val error: String? = null,
    val mensajeExito: String? = null,
    val allowedSectors: List<Sector> = emptyList(),
    val navegarACambiarSector: Boolean = false,
    val recargarMain: Boolean = false,
    // Visualizador de horas
    val mostrarVisualizador: Boolean = false,
    val visualizadorData: List<ResumenEmpleadoHoras> = emptyList(),
    val visualizadorFechas: List<String> = emptyList(),
    val visualizadorLoading: Boolean = false,
    val visualizadorPeriodo: String = "",
    val visualizadorError: String? = null
)

data class ResumenEmpleadoHoras(
    val empleado: Employee,
    val horasPorDia: Map<String, String?>,  // date (yyyy-MM-dd) -> minutesWorked
    val totalHoras: Float,
    val cosechaCount: Int,
    val importeTotal: Float
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
                val horas = submissions.sumOf { sub ->
                    when {
                        sub.minutesWorked == "C" -> 8
                        sub.minutesWorked?.startsWith("$") == true -> 0
                        sub.minutesWorked != null -> sub.minutesWorked.toIntOrNull() ?: 0
                        else -> 0
                    }
                }.toFloat()
                val cosechaDelDia = submissions.count { it.minutesWorked == "C" }
                val montoDelDia = submissions
                    .filter { it.minutesWorked?.startsWith("$") == true }
                    .sumOf { it.minutesWorked!!.substring(1).toDoubleOrNull() ?: 0.0 }
                    .toFloat()

                Quad(status, empleados.size, ausentesHoy, tarjados, horas, pending, transfers, cosechaDelDia, montoDelDia)
            }.collect { (status, total, ausentes, tarjados, horas, pending, transfers, cosecha, monto) ->
                _uiState.update { state ->
                    state.copy(
                        tarjaStatus = status,
                        empleadosTotal = total,
                        empleadosTarjados = status?.empleadosTarjados ?: tarjados,
                        ausentesHoy = ausentes,
                        horasTarjadas = status?.horasTarjadas ?: horas,
                        pendingCount = pending,
                        cosechaDelDia = cosecha,
                        montoDelDia = monto,
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
            val encargadoName = prefs.activeSectorEncargado.first() ?: _uiState.value.encargadoName
            authRepository.registerDevice(deviceId, sector.id, encargadoName)
            prefs.saveActiveSector(sector.id, sector.name, sector.tipoCarga, encargadoName)
            _uiState.update { it.copy(isLoading = false, recargarMain = true) }
        }
    }

    fun clearMensajes() = _uiState.update { it.copy(mensajeExito = null, error = null) }

    fun abrirVisualizador() {
        val state = _uiState.value
        if (state.sectorId.isBlank()) return
        _uiState.update { it.copy(mostrarVisualizador = true, visualizadorLoading = true, visualizadorError = null) }
        viewModelScope.launch {
            val today = LocalDate.now()
            val (startDate, endDate) = calcularPeriodo(today)
            val periodoLabel = "${startDate.format(DateTimeFormatter.ofPattern("dd/MM"))} – ${endDate.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))}"

            // Generar lista de fechas del período
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
                    val totalHoras = subs.sumOf { sub ->
                        when {
                            sub.minutesWorked == "C" -> 0.0
                            sub.minutesWorked?.startsWith("$") == true -> 0.0
                            else -> sub.minutesWorked?.toDoubleOrNull() ?: 0.0
                        }
                    }.toFloat()
                    val cosechaCount = subs.count { it.minutesWorked == "C" }
                    val importeTotal = subs.filter { it.minutesWorked?.startsWith("$") == true }
                        .sumOf { it.minutesWorked!!.substring(1).toDoubleOrNull() ?: 0.0 }.toFloat()
                    ResumenEmpleadoHoras(emp, horasPorDia, totalHoras, cosechaCount, importeTotal)
                }
                .sortedBy { it.empleado.apellido }

            _uiState.update {
                it.copy(
                    visualizadorData = resumen,
                    visualizadorFechas = fechas,
                    visualizadorLoading = false,
                    visualizadorPeriodo = periodoLabel
                )
            }
        }
    }

    fun cerrarVisualizador() = _uiState.update { it.copy(mostrarVisualizador = false) }

    private fun calcularPeriodo(today: LocalDate): Pair<LocalDate, LocalDate> {
        return if (today.dayOfMonth >= 21) {
            val start = today.withDayOfMonth(21)
            val end = today.plusMonths(1).withDayOfMonth(20)
            Pair(start, end)
        } else {
            val start = today.minusMonths(1).withDayOfMonth(21)
            val end = today.withDayOfMonth(20)
            Pair(start, end)
        }
    }
}

private data class Quad(
    val status: TarjaStatus?,
    val total: Int,
    val ausentes: Int,
    val tarjados: Int,
    val horas: Float,
    val pending: Int,
    val transfers: List<EmployeeTransfer>,
    val cosechaDelDia: Int,
    val montoDelDia: Float
)
