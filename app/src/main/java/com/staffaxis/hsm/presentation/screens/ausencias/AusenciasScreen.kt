package com.staffaxis.hsm.presentation.screens.ausencias

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.domain.model.Absence
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.presentation.components.ConfirmacionFlotante
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AusenciasScreen(viewModel: AusenciasViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val mesActual = uiState.mesActual
    val hoy = LocalDate.now()

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text("Ausencias", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Color.White)
                Spacer(Modifier.height(4.dp))
                Text(
                    "${mesActual.month.getDisplayName(TextStyle.FULL, Locale("es"))} ${mesActual.year}",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color(0xFF26C6DA)
                )
            }

            item {
                CalendarioAusencias(
                    mes = mesActual,
                    ausencias = uiState.ausencias,
                    hoy = hoy
                )
            }

            item {
                Button(
                    onClick = viewModel::mostrarFormulario,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                    contentPadding = PaddingValues(0.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Brush.horizontalGradient(listOf(Color(0xFF9C27B0), Color(0xFF26C6DA))), RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Add, null, tint = Color.White)
                            Spacer(Modifier.width(8.dp))
                            Text("Registrar ausencia", color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (uiState.ausencias.isNotEmpty()) {
                item {
                    Text("Ausencias registradas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                items(uiState.ausencias.take(20)) { ausencia ->
                    AusenciaItem(ausencia)
                }
            }
        }

        if (uiState.mostrarFormulario) {
            RegistrarAusenciaDialog(
                uiState = uiState,
                onDismiss = viewModel::cerrarFormulario,
                onEmpleadoSelected = viewModel::onEmpleadoSelected,
                onFechaInicioChanged = viewModel::onFechaInicioChanged,
                onFechaFinChanged = viewModel::onFechaFinChanged,
                onCertificadoChanged = viewModel::onCertificadoChanged,
                onObservacionesChanged = viewModel::onObservacionesChanged,
                onGuardar = viewModel::guardarAusencia
            )
        }

        uiState.mensajeExito?.let {
            ConfirmacionFlotante(
                mensajePrincipal = "✓ Ausencia registrada",
                mensajeSecundario = it,
                icono = Icons.Default.CheckCircle,
                colorFondo = Color(0xFF4CAF50),
                onDismiss = viewModel::clearMensajes
            )
        }
    }
}

@Composable
private fun CalendarioAusencias(mes: YearMonth, ausencias: List<Absence>, hoy: LocalDate) {
    val primerDia = mes.atDay(1)
    val diasEnMes = mes.lengthOfMonth()
    val offsetInicio = primerDia.dayOfWeek.value % 7

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
                listOf("Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb").forEach {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = Color(0xFF888888), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(8.dp))

            val diasConAusencia = mutableSetOf<LocalDate>()
            ausencias.filter { it.certificadoMedico }.forEach { ausencia ->
                var d = ausencia.fechaInicio
                while (!d.isAfter(ausencia.fechaFin)) {
                    if (d.month == mes.month && d.year == mes.year) diasConAusencia.add(d)
                    d = d.plusDays(1)
                }
            }

            LazyVerticalGrid(
                columns = GridCells.Fixed(7),
                modifier = Modifier.height(240.dp),
                userScrollEnabled = false,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(offsetInicio) { Box(Modifier.size(34.dp)) }
                items(diasEnMes) { idx ->
                    val fecha = mes.atDay(idx + 1)
                    val esHoy = fecha == hoy
                    val estaAusente = diasConAusencia.contains(fecha)
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .background(
                                when {
                                    estaAusente -> Color(0xFFFF5252).copy(alpha = 0.8f)
                                    esHoy -> Color(0xFF9C27B0).copy(alpha = 0.6f)
                                    else -> Color(0xFF3A3A5E).copy(alpha = 0.5f)
                                },
                                CircleShape
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "${idx + 1}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White,
                            fontWeight = if (esHoy) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(Color(0xFFFF5252), CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Ausente (c/cert.)", style = MaterialTheme.typography.labelSmall, color = Color(0xFF888888))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(Color(0xFF9C27B0), CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Hoy", style = MaterialTheme.typography.labelSmall, color = Color(0xFF888888))
                }
            }
        }
    }
}

@Composable
private fun AusenciaItem(ausencia: Absence) {
    val fmt = DateTimeFormatter.ofPattern("dd/MM")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Row(modifier = Modifier.padding(12.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(ausencia.employeeName, fontWeight = FontWeight.Bold, color = Color.White)
                Text("${ausencia.fechaInicio.format(fmt)} → ${ausencia.fechaFin.format(fmt)}", style = MaterialTheme.typography.bodySmall, color = Color(0xFF888888))
            }
            if (ausencia.certificadoMedico) {
                Surface(shape = MaterialTheme.shapes.small, color = Color(0xFFFF5252).copy(alpha = 0.2f)) {
                    Text("Cert. médico", modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = Color(0xFFFF5252))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RegistrarAusenciaDialog(
    uiState: AusenciasUiState,
    onDismiss: () -> Unit,
    onEmpleadoSelected: (Employee) -> Unit,
    onFechaInicioChanged: (LocalDate) -> Unit,
    onFechaFinChanged: (LocalDate) -> Unit,
    onCertificadoChanged: (Boolean) -> Unit,
    onObservacionesChanged: (String) -> Unit,
    onGuardar: () -> Unit
) {
    var expandidoEmpleado by remember { mutableStateOf(false) }
    var mostrarPickerInicio by remember { mutableStateOf(false) }
    var mostrarPickerFin by remember { mutableStateOf(false) }
    val fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar Ausencia") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ExposedDropdownMenuBox(expanded = expandidoEmpleado, onExpandedChange = { expandidoEmpleado = it }) {
                    OutlinedTextField(
                        value = uiState.empleadoSeleccionado?.nombre ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Empleado") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandidoEmpleado) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(expanded = expandidoEmpleado, onDismissRequest = { expandidoEmpleado = false }) {
                        uiState.empleados.forEach { emp ->
                            DropdownMenuItem(
                                text = { Text("${emp.nombre} - ${emp.dni ?: ""}") },
                                onClick = { onEmpleadoSelected(emp); expandidoEmpleado = false }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = uiState.fechaInicio?.format(fmt) ?: "",
                    onValueChange = {},
                    label = { Text("Fecha inicio") },
                    readOnly = true,
                    trailingIcon = { IconButton(onClick = { mostrarPickerInicio = true }) { Icon(Icons.Default.DateRange, null) } },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = uiState.fechaFin?.format(fmt) ?: "",
                    onValueChange = {},
                    label = { Text("Fecha fin") },
                    readOnly = true,
                    trailingIcon = { IconButton(onClick = { mostrarPickerFin = true }) { Icon(Icons.Default.DateRange, null) } },
                    modifier = Modifier.fillMaxWidth()
                )

                if (mostrarPickerInicio) {
                    val state = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
                    DatePickerDialog(
                        onDismissRequest = { mostrarPickerInicio = false },
                        confirmButton = { TextButton(onClick = { state.selectedDateMillis?.let { onFechaInicioChanged(LocalDate.ofEpochDay(it / 86400000L)) }; mostrarPickerInicio = false }) { Text("OK") } },
                        dismissButton = { TextButton(onClick = { mostrarPickerInicio = false }) { Text("Cancelar") } }
                    ) { DatePicker(state = state) }
                }

                if (mostrarPickerFin) {
                    val state = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
                    DatePickerDialog(
                        onDismissRequest = { mostrarPickerFin = false },
                        confirmButton = { TextButton(onClick = { state.selectedDateMillis?.let { onFechaFinChanged(LocalDate.ofEpochDay(it / 86400000L)) }; mostrarPickerFin = false }) { Text("OK") } },
                        dismissButton = { TextButton(onClick = { mostrarPickerFin = false }) { Text("Cancelar") } }
                    ) { DatePicker(state = state) }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onCertificadoChanged(!uiState.certificadoMedico) },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = uiState.certificadoMedico, onCheckedChange = onCertificadoChanged)
                    Spacer(Modifier.width(8.dp))
                    Text("Certificado médico (marca rojo en calendario)")
                }

                OutlinedTextField(
                    value = uiState.observaciones,
                    onValueChange = onObservacionesChanged,
                    label = { Text("Observaciones") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 2
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onGuardar,
                enabled = uiState.empleadoSeleccionado != null && uiState.fechaInicio != null && uiState.fechaFin != null && !uiState.isLoading
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
