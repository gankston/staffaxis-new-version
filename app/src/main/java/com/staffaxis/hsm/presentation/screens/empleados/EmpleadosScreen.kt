package com.staffaxis.hsm.presentation.screens.empleados

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.presentation.components.ConfirmacionFlotante
import com.staffaxis.hsm.presentation.components.EmpleadoCard
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmpleadosScreen(
    onCambiarSector: () -> Unit = {},
    onRecargarMain: () -> Unit = {},
    viewModel: EmpleadosViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var sectorDropdownExpanded by remember { mutableStateOf(false) }
    var sectorParaCambiar by remember { mutableStateOf<com.staffaxis.hsm.domain.model.Sector?>(null) }

    LaunchedEffect(uiState.navegarACambiarSector) {
        if (uiState.navegarACambiarSector) onCambiarSector()
    }

    LaunchedEffect(uiState.recargarMain) {
        if (uiState.recargarMain) onRecargarMain()
    }

    sectorParaCambiar?.let { sector ->
        val esNavegacionDirecta = sector.id == "__navigate__"
        AlertDialog(
            onDismissRequest = { sectorParaCambiar = null },
            icon = { Icon(Icons.Default.SwapHoriz, null, tint = Color(0xFF26C6DA)) },
            title = { Text("¿Cambiar de sector?") },
            text = {
                Text(
                    if (esNavegacionDirecta) "Vas a ir al selector de sectores. Los datos locales no se borran."
                    else "Vas a pasar al sector ${sector.name}. La app va a recargar los datos."
                )
            },
            confirmButton = {
                Button(onClick = {
                    sectorParaCambiar = null
                    if (esNavegacionDirecta) viewModel.navegarACambiarSector()
                    else viewModel.cambiarSector(sector)
                }) { Text("Cambiar") }
            },
            dismissButton = { TextButton(onClick = { sectorParaCambiar = null }) { Text("Cancelar") } }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (uiState.isLoading && uiState.empleados.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color(0xFF26C6DA))
                }
            } else {
                PullToRefreshBox(
                    isRefreshing = uiState.isRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize()
                ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 120.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    item {
                        Box {
                            val puedeCambiarSector = uiState.allowedSectors.size > 1
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = if (puedeCambiarSector) Modifier.clickable { sectorDropdownExpanded = true } else Modifier
                            ) {
                                Text(
                                    text = uiState.sectorName.ifBlank { "Empleados" },
                                    style = MaterialTheme.typography.headlineMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                                if (puedeCambiarSector) {
                                    Icon(
                                        Icons.Default.ArrowDropDown,
                                        contentDescription = "Cambiar sector",
                                        tint = Color(0xFF26C6DA),
                                        modifier = Modifier.size(28.dp)
                                    )
                                }
                            }
                            DropdownMenu(
                                expanded = sectorDropdownExpanded,
                                onDismissRequest = { sectorDropdownExpanded = false },
                                modifier = Modifier.background(Color(0xFF2A2A3E))
                            ) {
                                uiState.allowedSectors.forEach { sector ->
                                    DropdownMenuItem(
                                        text = { Text(sector.name, color = if (sector.id == uiState.sectorId) Color(0xFF26C6DA) else Color.White) },
                                        onClick = { sectorDropdownExpanded = false; sectorParaCambiar = sector },
                                        leadingIcon = if (sector.id == uiState.sectorId) ({
                                            Icon(Icons.Default.Check, null, tint = Color(0xFF26C6DA), modifier = Modifier.size(16.dp))
                                        }) else null
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = uiState.busqueda,
                            onValueChange = viewModel::onBusquedaChanged,
                            label = { Text("Buscar empleado") },
                            leadingIcon = { Icon(Icons.Default.Search, null) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${uiState.empleadosFiltrados.size} empleados",
                            style = MaterialTheme.typography.labelMedium,
                            color = Color(0xFF888888)
                        )
                        Spacer(Modifier.height(4.dp))
                    }

                    items(uiState.empleadosFiltrados, key = { it.id }) { empleado ->
                        EmpleadoCard(
                            empleado = empleado,
                            tieneHorasHoy = uiState.empleadosConHorasHoy.contains(empleado.id),
                            estaAusenteHoy = uiState.empleadosAusentesHoy.contains(empleado.id),
                            onRelojClick = { viewModel.abrirDialogoHoras(empleado) },
                            onEditarClick = { viewModel.abrirDialogoEditar(empleado) }
                        )
                    }
                }
                } // PullToRefreshBox
            }
        }

        FloatingActionButton(
            onClick = viewModel::abrirDialogoNuevo,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = MaterialTheme.colorScheme.primary
        ) { Icon(Icons.Default.Add, "Agregar empleado") }

        if (uiState.mostrarDialogoHoras && uiState.empleadoSeleccionado != null) {
            HorasDialog(
                uiState = uiState,
                onDismiss = viewModel::cerrarDialogoHoras,
                onFechaChanged = viewModel::onFechaChanged,
                onHorasChanged = viewModel::onHorasChanged,
                onCosechaChanged = viewModel::onCosechaChanged,
                onImporteChanged = viewModel::onImporteChanged,
                onObservacionesChanged = viewModel::onObservacionesChanged,
                onConfirm = viewModel::guardarHoras
            )
        }

        if (uiState.mostrarDialogoEditar && uiState.empleadoParaEditar != null) {
            EditarEmpleadoDialog(
                uiState = uiState,
                onDismiss = viewModel::cerrarDialogoEditar,
                onNombreChanged = viewModel::onEditNombreChanged,
                onApellidoChanged = viewModel::onEditApellidoChanged,
                onDniChanged = viewModel::onEditDniChanged,
                onObservacionChanged = viewModel::onEditObservacionChanged,
                onGuardar = viewModel::guardarEdicion,
                onOcultar = { viewModel.ocultarEmpleado(uiState.empleadoParaEditar!!) },
                onEditarRegistro = viewModel::abrirEdicionRegistro,
                onCerrarEdicionRegistro = viewModel::cerrarEdicionRegistro,
                onHorasEdicionChanged = viewModel::onHorasEdicionChanged,
                onHorasEdicionPorCosechaChanged = viewModel::onHorasEdicionPorCosechaChanged,
                onHorasEdicionPorImporteChanged = viewModel::onHorasEdicionPorImporteChanged,
                onGuardarEdicionRegistro = viewModel::guardarEdicionRegistro
            )
        }

        if (uiState.mostrarDialogoNuevo) {
            NuevoEmpleadoDialog(
                uiState = uiState,
                onDismiss = viewModel::cerrarDialogoNuevo,
                onDniChanged = viewModel::onNuevoDniChanged,
                onNombreChanged = viewModel::onNuevoNombreChanged,
                onApellidoChanged = viewModel::onNuevoApellidoChanged,
                onCrear = viewModel::crearEmpleado,
                onConfirmarTransferencia = viewModel::confirmarTransferencia,
                onCancelarTransferencia = viewModel::cancelarTransferencia,
                onConfirmarReactivar = viewModel::confirmarReactivar,
                onCancelarReactivar = viewModel::cancelarReactivar
            )
        }

        uiState.mensajeExito?.let {
            ConfirmacionFlotante(
                mensajePrincipal = "✓ Listo",
                mensajeSecundario = it,
                icono = Icons.Default.CheckCircle,
                colorFondo = Color(0xFF4CAF50),
                onDismiss = viewModel::clearMensajeExito
            )
        }

        uiState.mensajeError?.let {
            ConfirmacionFlotante(
                mensajePrincipal = "Error",
                mensajeSecundario = it,
                icono = Icons.Default.Warning,
                colorFondo = Color(0xFFD32F2F),
                onDismiss = viewModel::clearMensajeError
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HorasDialog(
    uiState: EmpleadosUiState,
    onDismiss: () -> Unit,
    onFechaChanged: (LocalDate) -> Unit,
    onHorasChanged: (Int) -> Unit,
    onCosechaChanged: (Boolean) -> Unit,
    onImporteChanged: (String) -> Unit,
    onObservacionesChanged: (String) -> Unit,
    onConfirm: () -> Unit
) {
    val empleado = uiState.empleadoSeleccionado ?: return
    val today = LocalDate.now()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar Horas", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(modifier = Modifier.padding(12.dp).fillMaxWidth()) {
                        Text(empleado.nombre, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("DNI: ${empleado.dni ?: "Sin datos"}", style = MaterialTheme.typography.bodySmall)
                    }
                }

                // DatePicker — calendario completo
                var showDatePicker by remember { mutableStateOf(false) }
                val datePickerState = rememberDatePickerState(
                    initialSelectedDateMillis = uiState.fechaSeleccionada
                        .atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli(),
                    selectableDates = object : SelectableDates {
                        override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                            // No permitir fechas futuras
                            val selectedDay = java.time.Instant.ofEpochMilli(utcTimeMillis)
                                .atZone(java.time.ZoneOffset.UTC).toLocalDate()
                            return !selectedDay.isAfter(today)
                        }
                    }
                )

                if (showDatePicker) {
                    DatePickerDialog(
                        onDismissRequest = { showDatePicker = false },
                        confirmButton = {
                            TextButton(onClick = {
                                datePickerState.selectedDateMillis?.let { millis ->
                                    val selected = java.time.Instant.ofEpochMilli(millis)
                                        .atZone(java.time.ZoneOffset.UTC).toLocalDate()
                                    onFechaChanged(selected)
                                }
                                showDatePicker = false
                            }) { Text("Confirmar") }
                        },
                        dismissButton = {
                            TextButton(onClick = { showDatePicker = false }) { Text("Cancelar") }
                        }
                    ) {
                        DatePicker(state = datePickerState)
                    }
                }

                val labelFecha = when (uiState.fechaSeleccionada) {
                    today -> "Hoy"
                    today.minusDays(1) -> "Ayer"
                    today.minusDays(2) -> "Anteayer"
                    else -> uiState.fechaSeleccionada.format(
                        DateTimeFormatter.ofPattern("d 'de' MMMM", Locale("es"))
                    )
                }
                OutlinedButton(
                    onClick = { showDatePicker = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(labelFecha)
                }

                Column {
                    val displayValue = when {
                        uiState.cargaPorCosecha -> "Cosecha (C)"
                        uiState.importeMonto.isNotBlank() -> "$${uiState.importeMonto}"
                        else -> "${uiState.horasSeleccionadas}h"
                    }
                    Text(displayValue, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.align(Alignment.CenterHorizontally))
                    Slider(
                        value = uiState.horasSeleccionadas.toFloat(),
                        onValueChange = { onHorasChanged(it.roundToInt().coerceIn(0, 16)) },
                        valueRange = 0f..16f,
                        steps = 15,
                        enabled = !uiState.cargaPorCosecha && uiState.importeMonto.isBlank(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("0h", style = MaterialTheme.typography.bodySmall, color = Color(0xFF888888))
                        Text("16h", style = MaterialTheme.typography.bodySmall, color = Color(0xFF888888))
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onCosechaChanged(!uiState.cargaPorCosecha) },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = uiState.cargaPorCosecha, onCheckedChange = onCosechaChanged)
                    Spacer(Modifier.width(8.dp))
                    Text("Carga por cosecha", fontWeight = FontWeight.SemiBold)
                }

                OutlinedTextField(
                    value = uiState.importeMonto,
                    onValueChange = onImporteChanged,
                    label = { Text("Carga por importe (opcional)") },
                    prefix = { Text("$ ") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.cargaPorCosecha,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )

                OutlinedTextField(
                    value = uiState.observaciones,
                    onValueChange = onObservacionesChanged,
                    label = { Text("Observaciones (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 2
                )
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) {
                Icon(Icons.Default.Save, null)
                Spacer(Modifier.width(8.dp))
                Text("Guardar")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}

@Composable
private fun EditarEmpleadoDialog(
    uiState: EmpleadosUiState,
    onDismiss: () -> Unit,
    onNombreChanged: (String) -> Unit,
    onApellidoChanged: (String) -> Unit,
    onDniChanged: (String) -> Unit,
    onObservacionChanged: (String) -> Unit,
    onGuardar: () -> Unit,
    onOcultar: () -> Unit,
    onEditarRegistro: (com.staffaxis.hsm.domain.model.OutboxSubmission) -> Unit,
    onCerrarEdicionRegistro: () -> Unit,
    onHorasEdicionChanged: (Int) -> Unit,
    onHorasEdicionPorCosechaChanged: (Boolean) -> Unit,
    onHorasEdicionPorImporteChanged: (String) -> Unit,
    onGuardarEdicionRegistro: () -> Unit
) {
    var confirmarOcultar by remember { mutableStateOf(false) }
    var expandido by remember { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val dateFormatter = remember { DateTimeFormatter.ofPattern("dd/MM/yyyy") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar Empleado", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp)
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(value = uiState.editNombre, onValueChange = onNombreChanged, label = { Text("Nombre") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text))
                OutlinedTextField(value = uiState.editApellido, onValueChange = onApellidoChanged, label = { Text("Apellido") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text))
                OutlinedTextField(value = uiState.editDni, onValueChange = onDniChanged, label = { Text("DNI") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(value = uiState.editObservacion, onValueChange = onObservacionChanged, label = { Text("Observación") }, modifier = Modifier.fillMaxWidth(), maxLines = 2)

                // Historial de horas
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Horas cargadas", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)

                if (uiState.registrosParaEditar.isEmpty()) {
                    Text(
                        "No hay horas registradas",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    val registrosVisibles = if (expandido) uiState.registrosParaEditar else uiState.registrosParaEditar.take(5)
                    val hayMas = uiState.registrosParaEditar.size > 5

                    registrosVisibles.forEach { registro ->
                        val fechaFormato = try {
                            LocalDate.parse(registro.date).format(dateFormatter)
                        } catch (_: Exception) { registro.date }
                        val displayValue = when {
                            registro.minutesWorked == "C" -> "Cosecha"
                            registro.minutesWorked?.startsWith("$") == true -> registro.minutesWorked
                            else -> "${registro.minutesWorked ?: "?"}h"
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(fechaFormato, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    displayValue,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF4CAF50)
                                )
                            }
                            IconButton(
                                onClick = { onEditarRegistro(registro) },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.Edit, "Editar", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            }
                        }
                    }

                    if (hayMas) {
                        TextButton(onClick = { expandido = !expandido }, modifier = Modifier.fillMaxWidth()) {
                            Text(if (expandido) "Ver menos" else "Ver todas (${uiState.registrosParaEditar.size - 5} más)")
                        }
                    }
                }

                Spacer(Modifier.height(4.dp))
                Button(
                    onClick = { confirmarOcultar = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Icon(Icons.Default.VisibilityOff, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Quitar de la lista")
                }
            }
        },
        confirmButton = { Button(onClick = onGuardar, enabled = uiState.editNombre.isNotBlank() && uiState.editApellido.isNotBlank()) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )

    // Dialog de edición de un registro individual
    if (uiState.registroEnEdicion != null) {
        AlertDialog(
            onDismissRequest = onCerrarEdicionRegistro,
            title = { Text("Editar Horas", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    val fechaFormato = try {
                        LocalDate.parse(uiState.registroEnEdicion.date).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                    } catch (_: Exception) { uiState.registroEnEdicion.date }
                    Text("Fecha: $fechaFormato", style = MaterialTheme.typography.bodyMedium)

                    val displayValue = when {
                        uiState.horasEdicionPorCosecha -> "Cosecha (C)"
                        uiState.horasEdicionPorImporte.isNotBlank() -> "$${uiState.horasEdicionPorImporte}"
                        else -> "${uiState.horasEdicion}h"
                    }
                    Text(displayValue, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)

                    Slider(
                        value = uiState.horasEdicion.toFloat(),
                        onValueChange = { onHorasEdicionChanged(it.roundToInt().coerceIn(0, 16)) },
                        valueRange = 0f..16f,
                        steps = 15,
                        enabled = !uiState.horasEdicionPorCosecha && uiState.horasEdicionPorImporte.isBlank(),
                        modifier = Modifier.fillMaxWidth()
                    )

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onHorasEdicionPorCosechaChanged(!uiState.horasEdicionPorCosecha) },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(checked = uiState.horasEdicionPorCosecha, onCheckedChange = onHorasEdicionPorCosechaChanged)
                        Spacer(Modifier.width(8.dp))
                        Text("Carga por cosecha", fontWeight = FontWeight.SemiBold)
                    }

                    OutlinedTextField(
                        value = uiState.horasEdicionPorImporte,
                        onValueChange = onHorasEdicionPorImporteChanged,
                        label = { Text("Carga por importe (opcional)") },
                        prefix = { Text("$ ") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.horasEdicionPorCosecha,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true
                    )
                }
            },
            confirmButton = { Button(onClick = onGuardarEdicionRegistro) { Text("Guardar") } },
            dismissButton = { TextButton(onClick = onCerrarEdicionRegistro) { Text("Cancelar") } }
        )
    }

    if (confirmarOcultar) {
        AlertDialog(
            onDismissRequest = { confirmarOcultar = false },
            icon = { Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("¿Quitar de la lista?") },
            text = { Text("El empleado no se borrará, solo dejará de aparecer en la lista. Podés reactivarlo desde StaffAdmin.") },
            confirmButton = { Button(onClick = onOcultar, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Sí, quitar") } },
            dismissButton = { TextButton(onClick = { confirmarOcultar = false }) { Text("Cancelar") } }
        )
    }
}

@Composable
private fun NuevoEmpleadoDialog(
    uiState: EmpleadosUiState,
    onDismiss: () -> Unit,
    onDniChanged: (String) -> Unit,
    onNombreChanged: (String) -> Unit,
    onApellidoChanged: (String) -> Unit,
    onCrear: () -> Unit,
    onConfirmarTransferencia: () -> Unit,
    onCancelarTransferencia: () -> Unit,
    onConfirmarReactivar: () -> Unit,
    onCancelarReactivar: () -> Unit
) {
    if (uiState.pedirConfirmReactivar) {
        AlertDialog(
            onDismissRequest = onCancelarReactivar,
            icon = { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFF26C6DA)) },
            title = { Text("Empleado oculto") },
            text = { Text("${uiState.empleadoInactivoNombre} ya estaba en la lista pero fue quitado. ¿Querés volver a listarlo?") },
            confirmButton = {
                Button(onClick = onConfirmarReactivar, enabled = !uiState.isLoading) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Sí, volver a listar")
                    }
                }
            },
            dismissButton = { TextButton(onClick = onCancelarReactivar) { Text("Cancelar") } }
        )
    } else if (uiState.pedirConfirmTransferencia) {
        AlertDialog(
            onDismissRequest = onCancelarTransferencia,
            icon = { Icon(Icons.Default.SwapHoriz, null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Empleado en otro sector") },
            text = {
                val nombreCompleto = "${uiState.nuevoNombre.trim()} ${uiState.nuevoApellido.trim()}".trim()
                Text("$nombreCompleto (DNI ${uiState.nuevoDni}) ya está registrado en otro sector. ¿Querés transferirlo a ${uiState.sectorName}?")
            },
            confirmButton = {
                Button(onClick = onConfirmarTransferencia, enabled = !uiState.isLoading) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Sí, transferir")
                    }
                }
            },
            dismissButton = { TextButton(onClick = onCancelarTransferencia) { Text("Cancelar") } }
        )
    } else {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Agregar Empleado") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = uiState.nuevoDni,
                        onValueChange = onDniChanged,
                        label = { Text("DNI *") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        isError = uiState.nuevoDni.isBlank()
                    )
                    OutlinedTextField(
                        value = uiState.nuevoNombre,
                        onValueChange = onNombreChanged,
                        label = { Text("Nombre *") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                        isError = uiState.nuevoNombre.isBlank()
                    )
                    OutlinedTextField(
                        value = uiState.nuevoApellido,
                        onValueChange = onApellidoChanged,
                        label = { Text("Apellido *") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                        isError = uiState.nuevoApellido.isBlank()
                    )
                    Text("Sector: ${uiState.sectorName}", style = MaterialTheme.typography.bodySmall, color = Color(0xFF888888))
                }
            },
            confirmButton = {
                Button(
                    onClick = onCrear,
                    enabled = uiState.nuevoDni.isNotBlank() && uiState.nuevoNombre.isNotBlank() && uiState.nuevoApellido.isNotBlank() && !uiState.isLoading
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Crear")
                    }
                }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
        )
    }
}
