package com.staffaxis.hsm.presentation.screens.supervisor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.staffaxis.hsm.domain.model.AppResult
import com.staffaxis.hsm.domain.model.SupervisorPendingItem
import com.staffaxis.hsm.domain.model.SupervisorResumenRow
import com.staffaxis.hsm.domain.repository.SupervisorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class SupervisorUiState(
    val isLoading: Boolean = true,
    val nombre: String = "",
    val sectores: List<String> = emptyList(),
    val pendientes: List<SupervisorPendingItem> = emptyList(),
    val seleccionadas: Set<String> = emptySet(),
    val procesando: Boolean = false,
    val mensaje: String? = null,
    val error: String? = null,
    // Resumen del periodo, igual que "Mostrar horas cargadas"
    val periodoOffset: Int = 0,
    val periodoLabel: String = "",
    val resumenLoading: Boolean = false,
    val resumen: List<SupervisorResumenRow> = emptyList(),
    // Filtros — null significa "todos"
    val sectorFiltro: String? = null,
    val tipoFiltro: String? = null,
    val fechaFiltro: String? = null,
    // Dialogo para escribir el motivo al rechazar
    val pidiendoMotivo: Boolean = false,
    val motivoRechazo: String = ""
)

// Tipos de carga por los que se puede filtrar el resumen (coinciden con TarjaValores).
val TIPOS_FILTRO_RESUMEN = listOf("Horas", "Cosecha", "Cajas", "Cajones", "Importe")

@HiltViewModel
class SupervisorViewModel @Inject constructor(
    private val repo: SupervisorRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SupervisorUiState())
    val uiState: StateFlow<SupervisorUiState> = _uiState.asStateFlow()

    init {
        cargarTodo()
    }

    private fun cargarTodo() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (val me = repo.me()) {
                is AppResult.Success -> _uiState.update {
                    it.copy(nombre = me.data.fullName, sectores = me.data.sectores.map { s -> s.name })
                }
                is AppResult.Error -> _uiState.update { it.copy(error = me.message) }
            }
            cargarPendientes()
            actualizarPeriodoLabel(0)
            cargarResumen()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun cargarPendientes() {
        viewModelScope.launch {
            when (val r = repo.pending()) {
                is AppResult.Success -> _uiState.update { st ->
                    // Arranca parado en el dia de hoy si hay tarjas de hoy sin aprobar,
                    // que es lo que el supervisor va a querer ver al abrir la pantalla.
                    val hoy = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                    val fechas = r.data.map { p -> p.date.take(10) }.distinct()
                    val filtroInicial = when {
                        st.fechaFiltro != null && fechas.contains(st.fechaFiltro) -> st.fechaFiltro
                        fechas.contains(hoy) -> hoy
                        else -> null
                    }
                    st.copy(pendientes = r.data, seleccionadas = emptySet(), fechaFiltro = filtroInicial)
                }
                is AppResult.Error -> _uiState.update { it.copy(error = r.message) }
            }
        }
    }

    fun toggleSeleccion(id: String) = _uiState.update {
        val nuevas = it.seleccionadas.toMutableSet()
        if (!nuevas.add(id)) nuevas.remove(id)
        it.copy(seleccionadas = nuevas)
    }

    fun seleccionarTodas(ids: List<String>) = _uiState.update { it.copy(seleccionadas = ids.toSet()) }
    fun deseleccionarTodas() = _uiState.update { it.copy(seleccionadas = emptySet()) }

    fun aprobarSeleccionadas() {
        val ids = _uiState.value.seleccionadas.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(procesando = true) }
            when (val r = repo.approve(ids)) {
                is AppResult.Success -> _uiState.update { it.copy(procesando = false, mensaje = "${r.data} tarja(s) aprobada(s)") }
                is AppResult.Error -> _uiState.update { it.copy(procesando = false, error = r.message) }
            }
            cargarPendientes()
            cargarResumen()
        }
    }

    fun pedirMotivoRechazo() = _uiState.update { it.copy(pidiendoMotivo = true, motivoRechazo = "") }
    fun cancelarMotivoRechazo() = _uiState.update { it.copy(pidiendoMotivo = false, motivoRechazo = "") }
    fun onMotivoRechazoChanged(v: String) = _uiState.update { it.copy(motivoRechazo = v) }

    fun rechazarSeleccionadas() {
        val ids = _uiState.value.seleccionadas.toList()
        val motivo = _uiState.value.motivoRechazo.trim()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(procesando = true, pidiendoMotivo = false) }
            when (val r = repo.reject(ids, motivo.ifBlank { null })) {
                is AppResult.Success -> _uiState.update { it.copy(procesando = false, motivoRechazo = "", mensaje = "${r.data} tarja(s) rechazada(s)") }
                is AppResult.Error -> _uiState.update { it.copy(procesando = false, error = r.message) }
            }
            cargarPendientes()
        }
    }

    fun clearMensaje() = _uiState.update { it.copy(mensaje = null, error = null) }

    fun filtrarPorSector(sector: String?) = _uiState.update { it.copy(sectorFiltro = sector) }
    fun filtrarPorTipo(tipo: String?) = _uiState.update { it.copy(tipoFiltro = tipo) }
    fun filtrarPorFecha(fecha: String?) = _uiState.update { it.copy(fechaFiltro = fecha) }

    // ── Resumen (igual criterio de periodo 21→20 que usa "Mostrar horas cargadas") ──

    private fun calcularPeriodo(today: LocalDate, offset: Int = 0): Pair<LocalDate, LocalDate> {
        val (start, end) = if (today.dayOfMonth >= 21) {
            Pair(today.withDayOfMonth(21), today.plusMonths(1).withDayOfMonth(20))
        } else {
            Pair(today.minusMonths(1).withDayOfMonth(21), today.withDayOfMonth(20))
        }
        return Pair(start.plusMonths(offset.toLong()), end.plusMonths(offset.toLong()))
    }

    private fun actualizarPeriodoLabel(offset: Int) {
        val (start, end) = calcularPeriodo(LocalDate.now(), offset)
        val fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")
        _uiState.update { it.copy(periodoOffset = offset, periodoLabel = "${start.format(fmt)} – ${end.format(fmt)}") }
    }

    fun cambiarPeriodo(delta: Int) {
        val nuevoOffset = (_uiState.value.periodoOffset + delta).coerceAtMost(0)
        actualizarPeriodoLabel(nuevoOffset)
        cargarResumen()
    }

    fun cargarResumen() {
        viewModelScope.launch {
            _uiState.update { it.copy(resumenLoading = true) }
            val (start, end) = calcularPeriodo(LocalDate.now(), _uiState.value.periodoOffset)
            val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")
            when (val r = repo.resumen(start.format(fmt), end.format(fmt))) {
                is AppResult.Success -> _uiState.update { it.copy(resumenLoading = false, resumen = r.data) }
                is AppResult.Error -> _uiState.update { it.copy(resumenLoading = false, error = r.message) }
            }
        }
    }

    fun cerrarSesion() {
        viewModelScope.launch { repo.cerrarSesion() }
    }
}
