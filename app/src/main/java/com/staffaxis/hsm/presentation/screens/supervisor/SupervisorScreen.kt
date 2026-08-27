package com.staffaxis.hsm.presentation.screens.supervisor

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.SwitchAccount
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.domain.model.SupervisorPendingItem
import com.staffaxis.hsm.domain.model.SupervisorResumenRow
import com.staffaxis.hsm.domain.model.TarjaValores
import com.staffaxis.hsm.domain.model.TiposCargaNuevos

// Una fila del resumen del periodo: empleado + sector con todos sus totales sumados.
private data class ResumenFila(
    val nombre: String,
    val sector: String,
    val valores: TarjaValores,
    val tipos: TiposCargaNuevos
)

@Composable
fun SupervisorScreen(
    onCerrarSesion: () -> Unit,
    hasDeviceSession: Boolean = false,
    onCambiarATarja: () -> Unit = {},
    viewModel: SupervisorViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Fechas disponibles entre las tarjas pendientes, mas nuevas primero.
    val fechasDisponibles = remember(uiState.pendientes) {
        uiState.pendientes.map { it.date }.distinct().sortedDescending()
    }

    // Pendientes filtrados por sector y fecha, y agrupados — para que se vea claro de
    // que sector es cada tarja en vez de una lista larga toda mezclada.
    val pendientesFiltrados = remember(uiState.pendientes, uiState.sectorFiltro, uiState.fechaFiltro) {
        uiState.pendientes.filter {
            (uiState.sectorFiltro == null || it.sector == uiState.sectorFiltro) &&
            (uiState.fechaFiltro == null || it.date == uiState.fechaFiltro)
        }
    }
    val pendientesPorSector = remember(pendientesFiltrados) {
        pendientesFiltrados.groupBy { it.sector }.toSortedMap()
    }

    // Resumen agrupado por empleado+sector — mismo criterio de parseo que Tarja/Excel.
    // Filtrable por sector y por tipo de carga (solo muestra filas con datos de ese tipo).
    val resumenAgrupado = remember(uiState.resumen, uiState.sectorFiltro, uiState.tipoFiltro) {
        uiState.resumen
            .filter { uiState.sectorFiltro == null || it.sectorName == uiState.sectorFiltro }
            .groupBy { it.employeeId to it.sectorName }
            .map { (key, filas) ->
                val nombre = filas.first().nombre
                val valores = filas.fold(TarjaValores.CERO) { acc, f -> acc + TarjaValores.parse(f.minutesWorked) }
                val tipos = TiposCargaNuevos.sumar(filas.map { f -> f.tiposNuevos })
                ResumenFila(nombre, key.second, valores, tipos)
            }
            .filter { cumpleTipoFiltro(it.valores, uiState.tipoFiltro) }
            .sortedWith(compareBy({ it.sector }, { it.nombre }))
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFF1E1E2E))) {
        // Cabecera
        Column(
            modifier = Modifier.fillMaxWidth()
                .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Color(0xFF6A1B9A), Color(0xFF1976D2))))
                .statusBarsPadding()
                .padding(20.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("SUPERVISOR", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    Text(uiState.nombre, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(
                        uiState.sectores.joinToString(", ").ifBlank { "Sin sectores asignados" },
                        color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall
                    )
                }
                Row {
                    if (hasDeviceSession) {
                        IconButton(onClick = onCambiarATarja) {
                            Icon(Icons.Default.SwitchAccount, contentDescription = "Cambiar a modo tarja", tint = Color.White)
                        }
                    }
                    IconButton(onClick = { viewModel.cerrarSesion(); onCerrarSesion() }) {
                        Icon(Icons.Default.Logout, contentDescription = "Cerrar sesión", tint = Color.White)
                    }
                }
            }
        }

        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF26C6DA))
            }
            return
        }

        LazyColumn(modifier = Modifier.fillMaxSize().weight(1f), contentPadding = PaddingValues(16.dp)) {

            // Filtro por sector — aplica tanto a pendientes como al resumen de abajo.
            if (uiState.sectores.size > 1) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FiltroChip("Todos", uiState.sectorFiltro == null) { viewModel.filtrarPorSector(null) }
                        uiState.sectores.forEach { sec ->
                            FiltroChip(sec, uiState.sectorFiltro == sec) { viewModel.filtrarPorSector(sec) }
                        }
                    }
                }
            }

            // Dropdown de fechas — arranca mostrando el dia de hoy y desde ahi se
            // puede pasar a los dias anteriores que tengan tarjas sin aprobar.
            if (fechasDisponibles.isNotEmpty()) {
                item {
                    FechaDropdown(
                        fechas = fechasDisponibles,
                        seleccionada = uiState.fechaFiltro,
                        onSeleccionar = { viewModel.filtrarPorFecha(it) },
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${pendientesFiltrados.size} pendientes por aprobar",
                        color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold
                    )
                    if (pendientesFiltrados.isNotEmpty()) {
                        TextButton(onClick = {
                            if (uiState.seleccionadas.size == pendientesFiltrados.size) viewModel.deseleccionarTodas()
                            else viewModel.seleccionarTodas(pendientesFiltrados.map { it.id })
                        }) {
                            Text(
                                if (uiState.seleccionadas.size == pendientesFiltrados.size) "Deseleccionar todas" else "Seleccionar todas",
                                color = Color(0xFF26C6DA), fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            if (pendientesFiltrados.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No hay tarjas pendientes en tus sectores", color = Color(0xFF888888))
                    }
                }
            }

            pendientesPorSector.forEach { (sector, itemsDelSector) ->
                item(key = "header_$sector") {
                    Text(
                        sector, color = Color(0xFF26C6DA), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
                    )
                }
                items(itemsDelSector, key = { it.id }) { item ->
                    PendienteCard(
                        item = item,
                        seleccionado = uiState.seleccionadas.contains(item.id),
                        onToggle = { viewModel.toggleSeleccion(item.id) }
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }

            if (uiState.seleccionadas.isNotEmpty()) {
                item {
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = viewModel::pedirMotivoRechazo,
                            enabled = !uiState.procesando,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF5252))
                        ) {
                            Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Rechazar (${uiState.seleccionadas.size})", color = Color.White)
                        }
                        Button(
                            onClick = viewModel::aprobarSeleccionadas,
                            enabled = !uiState.procesando,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                        ) {
                            Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Aprobar (${uiState.seleccionadas.size})", color = Color.White)
                        }
                    }
                }
            }

            item { HorizontalDivider(color = Color.White.copy(alpha = 0.08f), modifier = Modifier.padding(vertical = 16.dp)) }

            // ── Resumen del período, mismo dato que "Mostrar horas cargadas" ──
            item {
                Text("Resumen del período", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                // Fila propia, ancho completo: las flechas quedan fijas en los extremos
                // sin importar cuanto ocupe el texto del rango de fechas en el medio.
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { viewModel.cambiarPeriodo(-1) }) {
                        Text("‹", color = Color(0xFF26C6DA), fontSize = 20.sp)
                    }
                    Text(
                        uiState.periodoLabel, color = Color(0xFFB0B0B0), fontSize = 12.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = { viewModel.cambiarPeriodo(1) }) {
                        Text("›", color = Color(0xFF26C6DA), fontSize = 20.sp)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FiltroChip("Todos", uiState.tipoFiltro == null) { viewModel.filtrarPorTipo(null) }
                    TIPOS_FILTRO_RESUMEN.forEach { tipo ->
                        FiltroChip(tipo, uiState.tipoFiltro == tipo) { viewModel.filtrarPorTipo(tipo) }
                    }
                }
            }

            if (uiState.resumenLoading) {
                item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF26C6DA)) } }
            } else if (resumenAgrupado.isEmpty()) {
                item { Text("Sin datos en este período", color = Color(0xFF888888), modifier = Modifier.padding(vertical = 16.dp)) }
            } else {
                items(resumenAgrupado) { fila ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(fila.nombre, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(fila.sector, color = Color(0xFF888888), fontSize = 11.sp)
                            }
                            Text(
                                listOf(formatValores(fila.valores), formatTiposNuevos(fila.tipos))
                                    .filter { it.isNotBlank() && it != "-" }.joinToString(" "),
                                color = Color(0xFF26C6DA), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.End
                            )
                        }
                    }
                }
            }
        }
    }

    if (uiState.pidiendoMotivo) {
        AlertDialog(
            onDismissRequest = viewModel::cancelarMotivoRechazo,
            containerColor = Color(0xFF2A2A3E),
            title = { Text("Rechazar ${uiState.seleccionadas.size} tarja(s)", color = Color.White, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Escribí por qué la rechazás. El que cargó la tarja va a ver este mensaje para saber qué corregir.",
                        color = Color(0xFFB0B0B0), fontSize = 12.sp
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = uiState.motivoRechazo,
                        onValueChange = viewModel::onMotivoRechazoChanged,
                        placeholder = { Text("Ej: puso 8h y trabajó 4", color = Color(0xFF777777)) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2, maxLines = 4,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFFFF5252), unfocusedBorderColor = Color(0xFF444444),
                            cursorColor = Color(0xFFFF5252)
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = viewModel::rechazarSeleccionadas,
                    enabled = uiState.motivoRechazo.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF5252))
                ) { Text("Rechazar", color = Color.White) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::cancelarMotivoRechazo) {
                    Text("Cancelar", color = Color(0xFF888888))
                }
            }
        )
    }

    uiState.mensaje?.let {
        LaunchedEffect(it) {
            kotlinx.coroutines.delay(2500)
            viewModel.clearMensaje()
        }
    }
}

@Composable
private fun PendienteCard(item: SupervisorPendingItem, seleccionado: Boolean, onToggle: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = if (seleccionado) Color(0xFF33334A) else Color(0xFF2A2A3E)),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = seleccionado, onCheckedChange = { onToggle() }, colors = CheckboxDefaults.colors(checkedColor = Color(0xFF9C27B0)))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.empleado, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(item.date, color = Color(0xFF888888), fontSize = 11.sp)
                    if (item.fueModificada) {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .background(Color(0xFFFFA726).copy(alpha = 0.25f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text("MODIFICADA", color = Color(0xFFFFA726), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Text(
                listOf(formatValores(TarjaValores.parse(item.minutesWorked)), formatTiposNuevos(item.tiposNuevos))
                    .filter { it.isNotBlank() && it != "-" }.joinToString(" "),
                color = Color(0xFF26C6DA), fontSize = 12.sp, fontWeight = FontWeight.Bold
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FechaDropdown(
    fechas: List<String>,
    seleccionada: String?,
    onSeleccionar: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    var expandido by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expandido, onExpandedChange = { expandido = it }, modifier = modifier) {
        OutlinedTextField(
            value = seleccionada ?: "Todas las fechas",
            onValueChange = {},
            readOnly = true,
            label = { Text("Fecha") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandido) },
            modifier = Modifier.fillMaxWidth().menuAnchor(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                focusedBorderColor = Color(0xFF9C27B0), unfocusedBorderColor = Color(0xFF444444),
                disabledTextColor = Color.White, focusedLabelColor = Color(0xFF9C27B0), unfocusedLabelColor = Color(0xFF888888)
            ),
            shape = RoundedCornerShape(12.dp)
        )
        ExposedDropdownMenu(expanded = expandido, onDismissRequest = { expandido = false }, modifier = Modifier.background(Color(0xFF2A2A3E))) {
            DropdownMenuItem(
                text = { Text("Todas las fechas", color = Color.White) },
                onClick = { onSeleccionar(null); expandido = false },
                modifier = Modifier.background(Color(0xFF2A2A3E))
            )
            fechas.forEach { fecha ->
                DropdownMenuItem(
                    text = { Text(fecha, color = Color.White) },
                    onClick = { onSeleccionar(fecha); expandido = false },
                    modifier = Modifier.background(Color(0xFF2A2A3E))
                )
            }
        }
    }
}

@Composable
private fun FiltroChip(label: String, seleccionado: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = seleccionado,
        onClick = onClick,
        label = { Text(label, fontSize = 12.sp) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = Color(0xFF9C27B0),
            selectedLabelColor = Color.White,
            containerColor = Color(0xFF2A2A3E),
            labelColor = Color(0xFFB0B0B0)
        )
    )
}

private fun cumpleTipoFiltro(v: TarjaValores, tipo: String?): Boolean = when (tipo) {
    null -> true
    "Horas" -> v.horas > 0f
    "Cosecha" -> v.cosecha > 0f
    "Cajas" -> v.cajas > 0
    "Cajones" -> v.cajones > 0
    "Importe" -> v.importe > 0f
    else -> true
}

// Resumen corto de los tipos de carga nuevos para la tarjeta de pendientes.
private fun formatTiposNuevos(t: com.staffaxis.hsm.domain.model.TiposCargaNuevos): String {
    val partes = mutableListOf<String>()
    t.kmViajes?.let { partes.add("Km${fmtNum(it)}") }
    t.hasFumigadas?.let { partes.add("Ha${fmtNum(it)}") }
    t.siembraTrilla?.let { partes.add("ST${fmtNum(it)}") }
    t.bolseros?.let { partes.add("Bol${fmtNum(it)}") }
    t.etiquetado?.let { partes.add("Et${fmtNum(it)}") }
    if (t.cargaCamionKg50 == true || t.cargaCamionKg25 == true || t.cargaCamionOtro != null) {
        partes.add("CC" + listOfNotNull(
            if (t.cargaCamionKg50 == true) "50" else null,
            if (t.cargaCamionKg25 == true) "25" else null
        ).joinToString("/"))
    }
    if (t.movimientoEstibaKg50 == true || t.movimientoEstibaKg25 == true || t.movimientoEstibaOtro != null) {
        partes.add("ME" + listOfNotNull(
            if (t.movimientoEstibaKg50 == true) "50" else null,
            if (t.movimientoEstibaKg25 == true) "25" else null
        ).joinToString("/"))
    }
    return partes.joinToString(" ")
}

private fun formatValores(v: TarjaValores): String {
    val partes = mutableListOf<String>()
    if (v.horas > 0f) partes.add(fmtNum(v.horas) + "h")
    if (v.cosecha > 0f) partes.add("C" + fmtNum(v.cosecha))
    if (v.cajas > 0) partes.add("CJ${v.cajas}")
    if (v.cajones > 0) partes.add("CN${v.cajones}")
    if (v.importe > 0f) partes.add("$" + fmtNum(v.importe))
    return if (partes.isEmpty()) "-" else partes.joinToString(" ")
}

private fun fmtNum(n: Float): String = if (n == n.toLong().toFloat()) n.toLong().toString() else "%.1f".format(n)
