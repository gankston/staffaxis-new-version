package com.staffaxis.hsm.presentation.screens.tarja

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.presentation.components.ConfirmacionFlotante
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun TarjaScreen(
    onCambiarSector: () -> Unit = {},
    onRecargarMain: () -> Unit = {},
    viewModel: TarjaViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val hoy = LocalDate.now()
    val fechaLegible = "${hoy.dayOfMonth} de ${hoy.month.getDisplayName(TextStyle.FULL, Locale("es"))} ${hoy.year}"
    val fechaCorta = hoy.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    var sectorExpandido by remember { mutableStateOf(false) }
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
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: Hola encargado + sector
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Hola ${uiState.encargadoName.ifBlank { uiState.sectorName }}",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            "Sector: ${uiState.sectorName}",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color(0xFF26C6DA)
                        )
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            fechaLegible,
                            style = MaterialTheme.typography.labelMedium,
                            color = Color(0xFF888888),
                            textAlign = TextAlign.End
                        )
                        if (uiState.allowedSectors.size > 1) {
                            Box {
                                TextButton(
                                    onClick = { sectorExpandido = true },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Icon(Icons.Default.SwapHoriz, null, tint = Color(0xFF26C6DA), modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Cambiar sector", style = MaterialTheme.typography.labelSmall, color = Color(0xFF26C6DA))
                                }
                                DropdownMenu(
                                    expanded = sectorExpandido,
                                    onDismissRequest = { sectorExpandido = false },
                                    modifier = Modifier.background(Color(0xFF2A2A3E))
                                ) {
                                    uiState.allowedSectors.forEach { sector ->
                                        DropdownMenuItem(
                                            text = { Text(sector.name, color = if (sector.id == uiState.sectorId) Color(0xFF26C6DA) else Color.White) },
                                            onClick = { sectorExpandido = false; sectorParaCambiar = sector },
                                            leadingIcon = if (sector.id == uiState.sectorId) ({
                                                Icon(Icons.Default.Check, null, tint = Color(0xFF26C6DA), modifier = Modifier.size(16.dp))
                                            }) else null
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Gradient stats card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.horizontalGradient(listOf(Color(0xFF6A1B9A), Color(0xFF1976D2), Color(0xFF26C6DA))),
                                RoundedCornerShape(20.dp)
                            )
                            .padding(20.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(
                                "Estadísticas del día",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceAround
                            ) {
                                GradientStat("${uiState.empleadosTarjados}", "Tarjados")
                                GradientStat("${uiState.empleadosTotal}", "Total")
                                GradientStat(formatHoras(uiState.horasTarjadas), "Horas")
                                GradientStat("${uiState.ausentesHoy}", "Ausentes")
                            }
                            HorizontalDivider(color = Color.White.copy(alpha = 0.2f))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceAround
                            ) {
                                GradientStat(formatCantidad(uiState.cosechaDelDia), "Cosecha")
                                GradientStat("${uiState.cajasDelDia}", "Cajas")
                                GradientStat("${uiState.cajonesDelDia}", "Cajones")
                                GradientStat(formatMonto(uiState.montoDelDia), "Monto")
                            }
                        }
                    }
                }
            }

            // Tarja status card
            item { EstadoTarjaCard(uiState, fechaCorta) }

            // Movimientos del día
            if (uiState.transfers.isNotEmpty()) {
                item { MovimientosCard(uiState) }
            }

            // Cierre de Tarja
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E)),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            "Cierre de Tarja",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )

                        // Selector de período
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF1A1A30), RoundedCornerShape(10.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            IconButton(onClick = { viewModel.cambiarPeriodo(-1) }) {
                                Icon(Icons.Default.ChevronLeft, null, tint = Color(0xFF26C6DA))
                            }
                            Text(
                                uiState.periodoLabel,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White,
                                textAlign = TextAlign.Center
                            )
                            IconButton(
                                onClick = { viewModel.cambiarPeriodo(1) },
                                enabled = uiState.periodoOffset < 0
                            ) {
                                Icon(
                                    Icons.Default.ChevronRight, null,
                                    tint = if (uiState.periodoOffset < 0) Color(0xFF26C6DA) else Color(0xFF444466)
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = viewModel::abrirVisualizador,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF26C6DA)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26C6DA))
                        ) {
                            Icon(Icons.Default.TableChart, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Mostrar horas cargadas", fontWeight = FontWeight.SemiBold)
                        }
                        val tarjaYaEnviada = uiState.tarjaStatus?.enviada == true
                        Button(
                            onClick = viewModel::cerrarTarja,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !uiState.isCerrando,
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                            contentPadding = PaddingValues(0.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        if (!uiState.isCerrando)
                                            Brush.horizontalGradient(listOf(Color(0xFF9C27B0), Color(0xFF26C6DA)))
                                        else
                                            Brush.horizontalGradient(listOf(Color(0xFF555555), Color(0xFF555555))),
                                        RoundedCornerShape(12.dp)
                                    )
                                    .padding(14.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                if (uiState.isCerrando) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Enviando tarja...", color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                } else {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Send, null, tint = Color.White)
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            if (tarjaYaEnviada) "Reenviar tarja" else "Realizar cierre de tarja",
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (uiState.pendingCount > 0) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFF9800).copy(alpha = 0.15f)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CloudUpload, null, tint = Color(0xFFFF9800))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "${uiState.pendingCount} ${if (uiState.pendingCount == 1) "registro pendiente" else "registros pendientes"} de sincronización",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFFF9800)
                            )
                        }
                    }
                }
            }

            uiState.error?.let { err ->
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFD32F2F).copy(alpha = 0.2f))
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Warning, null, tint = Color(0xFFFF5252))
                            Spacer(Modifier.width(8.dp))
                            Text(err, style = MaterialTheme.typography.bodySmall, color = Color(0xFFFF5252))
                        }
                    }
                }
            }
        }

        if (uiState.mostrarVisualizador) {
            VisualizadorHorasDialog(
                uiState = uiState,
                onDismiss = viewModel::cerrarVisualizador
            )
        }

        uiState.mensajeExito?.let {
            ConfirmacionFlotante(
                mensajePrincipal = "✓ Tarja cerrada",
                mensajeSecundario = it,
                icono = Icons.Default.CheckCircle,
                colorFondo = Color(0xFF4CAF50),
                onDismiss = viewModel::clearMensajes
            )
        }
    }
}

@Composable
private fun GradientStat(valor: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(valor, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 22.sp)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
    }
}

@Composable
private fun EstadoTarjaCard(uiState: TarjaUiState, fechaCorta: String) {
    val status = uiState.tarjaStatus

    if (status?.enviada == true) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            shape = RoundedCornerShape(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.horizontalGradient(listOf(Color(0xFF1B5E20), Color(0xFF2E7D32))),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(16.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF66BB6A))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Tarja del $fechaCorta enviada ✓",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                    HorizontalDivider(color = Color.White.copy(alpha = 0.2f))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
                        TarjaEnviadaStat("${status.empleadosTarjados}", "Empleados\ntarjados")
                        // Totales calculados en vivo: los guardados en tarja_status de tarjas
                        // viejas quedaron en 0 por el bug de parseo del formato compuesto.
                        TarjaEnviadaStat(formatHoras(uiState.horasTarjadas), "Horas\ntarjadas")
                        TarjaEnviadaStat("${status.jornalesTotales}", "Jornales\nde hoy")
                    }

                    val hayExtras = uiState.cosechaDelDia > 0f || uiState.cajasDelDia > 0 ||
                            uiState.cajonesDelDia > 0 || uiState.montoDelDia > 0f
                    if (hayExtras) {
                        HorizontalDivider(color = Color.White.copy(alpha = 0.2f))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
                            if (uiState.cosechaDelDia > 0f) TarjaEnviadaStat(formatCantidad(uiState.cosechaDelDia), "Cosecha")
                            if (uiState.cajasDelDia > 0) TarjaEnviadaStat("${uiState.cajasDelDia}", "Cajas")
                            if (uiState.cajonesDelDia > 0) TarjaEnviadaStat("${uiState.cajonesDelDia}", "Cajones")
                            if (uiState.montoDelDia > 0f) TarjaEnviadaStat(formatMonto(uiState.montoDelDia), "Importe")
                        }
                    }
                    status.horaEnvio?.let { millis ->
                        val hora = java.time.Instant.ofEpochMilli(millis)
                            .atZone(java.time.ZoneId.systemDefault())
                            .format(DateTimeFormatter.ofPattern("HH:mm"))
                        Text("Enviado a las $hora", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.6f))
                    }
                }
            }
        }
    } else {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            shape = RoundedCornerShape(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.horizontalGradient(listOf(Color(0xFFE65100), Color(0xFFFF6F00))),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(16.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, null, tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "La tarja del $fechaCorta aún no fue enviada",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun TarjaEnviadaStat(valor: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(valor, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 20.sp)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f), textAlign = TextAlign.Center)
    }
}

@Composable
private fun MovimientosCard(uiState: TarjaUiState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SwapHoriz, null, tint = Color(0xFF26C6DA), modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    "Movimientos del día",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
            HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
            uiState.transfers.forEach { transfer ->
                val esSalida = transfer.toSectorName != uiState.sectorName
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        if (esSalida) Icons.Default.ArrowForward else Icons.Default.ArrowBack,
                        null,
                        tint = if (esSalida) Color(0xFFFF9800) else Color(0xFF26C6DA),
                        modifier = Modifier.size(16.dp)
                    )
                    Column {
                        Text(
                            transfer.employeeName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White
                        )
                        Text(
                            if (esSalida) "Se fue a ${transfer.toSectorName}" else "Viene de ${transfer.fromSectorName}",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (esSalida) Color(0xFFFF9800) else Color(0xFF26C6DA)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VisualizadorHorasDialog(
    uiState: TarjaUiState,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = true, dismissOnClickOutside = false)
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF1A1A2E)) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brush.horizontalGradient(listOf(Color(0xFF6A1B9A), Color(0xFF1976D2), Color(0xFF26C6DA))))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.TableChart, null, tint = Color.White, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Horas cargadas — ${uiState.sectorName}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Default.Close, "Cerrar", tint = Color.White)
                            }
                        }
                        if (uiState.periodoLabel.isNotBlank()) {
                            Text(
                                "Período: ${uiState.periodoLabel}",
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White.copy(alpha = 0.8f)
                            )
                        }
                    }
                }

                when {
                    uiState.visualizadorLoading -> {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                CircularProgressIndicator(color = Color(0xFF26C6DA))
                                Text("Cargando desde el servidor...", color = Color(0xFF888888))
                            }
                        }
                    }
                    uiState.visualizadorError != null -> {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 32.dp)) {
                                Icon(Icons.Default.Warning, null, tint = Color(0xFFFF5252), modifier = Modifier.size(48.dp))
                                Text(uiState.visualizadorError, color = Color(0xFFFF5252), textAlign = TextAlign.Center)
                            }
                        }
                    }
                    uiState.visualizadorData.isEmpty() -> {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.Inbox, null, tint = Color(0xFF888888), modifier = Modifier.size(48.dp))
                                Text("No hay horas cargadas en este período", color = Color(0xFF888888), textAlign = TextAlign.Center)
                            }
                        }
                    }
                    else -> {
                        val totalHoras = uiState.visualizadorData.sumOf { it.totalHoras.toDouble() }.toFloat()
                        val totalCosecha = uiState.visualizadorData.sumOf { it.cosechaTotal.toDouble() }.toFloat()
                        val totalImporte = uiState.visualizadorData.sumOf { it.importeTotal.toDouble() }.toFloat()
                        val totalCajas = uiState.visualizadorData.sumOf { it.cajasTotal }
                        val totalCajones = uiState.visualizadorData.sumOf { it.cajonesTotal }

                        Card(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceAround) {
                                ResumenStat("${uiState.visualizadorData.size}", "Empleados")
                                ResumenStat(formatHoras(totalHoras), "Total horas")
                                if (totalCosecha > 0f) ResumenStat(formatCantidad(totalCosecha), "Cosecha")
                                if (totalCajas > 0) ResumenStat("$totalCajas", "Cajas")
                                if (totalCajones > 0) ResumenStat("$totalCajones", "Cajones")
                                if (totalImporte > 0f) ResumenStat(formatMonto(totalImporte), "Importe")
                            }
                        }

                        val hScroll = rememberScrollState()
                        val dateFmt = remember { DateTimeFormatter.ofPattern("dd/MM") }
                        val nameW = 118.dp
                        val dayW = 36.dp
                        val totalW = 50.dp

                        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            // Cabecera de tabla
                            Row(
                                modifier = Modifier.fillMaxWidth().background(Color(0xFF252545)).horizontalScroll(hScroll),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "EMPLEADO",
                                    modifier = Modifier.width(nameW).padding(horizontal = 6.dp, vertical = 8.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF26C6DA),
                                    maxLines = 1
                                )
                                uiState.visualizadorFechas.forEach { date ->
                                    val label = try { LocalDate.parse(date).format(dateFmt) } catch (_: Exception) { date.takeLast(5) }
                                    Text(
                                        label,
                                        modifier = Modifier.width(dayW).padding(2.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF26C6DA),
                                        textAlign = TextAlign.Center,
                                        maxLines = 1
                                    )
                                }
                                Text(
                                    "TOTAL",
                                    modifier = Modifier.width(totalW).padding(horizontal = 4.dp, vertical = 8.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF26C6DA),
                                    textAlign = TextAlign.Center,
                                    maxLines = 1
                                )
                            }
                            HorizontalDivider(color = Color(0xFF26C6DA).copy(alpha = 0.4f))

                            // Filas de empleados
                            uiState.visualizadorData.forEachIndexed { idx, resumen ->
                                val rowBg = if (idx % 2 == 0) Color(0xFF1E1E30) else Color(0xFF252545)
                                Row(
                                    modifier = Modifier.fillMaxWidth().background(rowBg).horizontalScroll(hScroll),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        formatNombreViz(resumen.empleado),
                                        modifier = Modifier.width(nameW).padding(horizontal = 6.dp, vertical = 7.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White,
                                        maxLines = 2
                                    )
                                    uiState.visualizadorFechas.forEach { date ->
                                        val (text, color) = celdaValor(resumen.horasPorDia[date])
                                        Text(
                                            text,
                                            modifier = Modifier.width(dayW).padding(2.dp),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = color,
                                            textAlign = TextAlign.Center,
                                            maxLines = 2
                                        )
                                    }
                                    val totalText = buildString {
                                        if (resumen.totalHoras > 0f) append(formatHoras(resumen.totalHoras))
                                        if (resumen.cosechaTotal > 0f) {
                                            if (isNotEmpty()) append(" ")
                                            append("C${formatCantidad(resumen.cosechaTotal)}")
                                        }
                                        if (resumen.cajasTotal > 0) {
                                            if (isNotEmpty()) append("\n")
                                            append("Cajas ${resumen.cajasTotal}")
                                        }
                                        if (resumen.cajonesTotal > 0) {
                                            if (isNotEmpty()) append(" ")
                                            append("Cajones ${resumen.cajonesTotal}")
                                        }
                                        if (resumen.importeTotal > 0f) {
                                            if (isNotEmpty()) append("\n")
                                            append(formatMonto(resumen.importeTotal))
                                        }
                                    }
                                    Text(
                                        totalText.ifBlank { "-" },
                                        modifier = Modifier.width(totalW).padding(horizontal = 4.dp, vertical = 7.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF26C6DA),
                                        textAlign = TextAlign.Center,
                                        maxLines = 3
                                    )
                                }
                                HorizontalDivider(color = Color.White.copy(alpha = 0.05f))
                            }
                            Spacer(Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResumenStat(valor: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(valor, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF26C6DA))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFF888888))
    }
}

private fun formatNombreViz(emp: com.staffaxis.hsm.domain.model.Employee): String {
    val apellido = emp.apellido.trim()
    return if (apellido.isNotBlank()) {
        val nombre = emp.nombre.removeSuffix(apellido).trim()
        "$apellido $nombre".trim()
    } else {
        // nombre = "FIRSTNAME LASTNAME" → rearrangar a "LASTNAME FIRSTNAME"
        val partes = emp.nombre.trim().split(" ")
        if (partes.size >= 2) "${partes.last()} ${partes.dropLast(1).joinToString(" ")}"
        else emp.nombre
    }
}

private fun celdaValor(mw: String?): Pair<String, Color> {
    if (mw == null) return Pair("-", Color(0xFF444466))
    val parts = mw.split("|")
    // Formato nuevo "H 4" primero; si no hay, cae al número plano viejo (compatibilidad)
    val horasPartNuevo = parts.firstOrNull { it.startsWith("H ") }
    val horasPartViejo = parts.firstOrNull { it.toFloatOrNull() != null }
    val horas = horasPartNuevo?.removePrefix("H ")?.trim()?.toFloatOrNull() ?: horasPartViejo?.toFloatOrNull()
    val hasHoras = horas != null
    val hasCosecha = parts.any { it == "C" || it.startsWith("C:") }
    val hasAbonada = parts.any { it.startsWith("AB:") }
    val isImporte = parts.any { it.startsWith("$") }
    val cajasCajonesPart = parts.firstOrNull { it.startsWith("Cajas ") || it.startsWith("Cajones ") }
    val hasCajasCajones = cajasCajonesPart != null
    // Abreviado para que entre en la celda angosta del visualizador ("Cajas 32" -> "Cj32")
    val cajasCajonesCompacto = cajasCajonesPart?.let {
        buildString {
            Regex("Cajas ([0-9]+(?:[.,][0-9]+)?)").find(it)?.let { m -> append("Cj${m.groupValues[1]}") }
            Regex("Cajones ([0-9]+(?:[.,][0-9]+)?)").find(it)?.let { m ->
                if (isNotEmpty()) append(" ")
                append("Cn${m.groupValues[1]}")
            }
        }
    } ?: ""
    return when {
        hasCosecha || hasAbonada || hasCajasCajones -> {
            val cachos = parts.firstOrNull { it.startsWith("C:") }?.removePrefix("C:") ?: ""
            val label = buildString {
                if (hasHoras) {
                    append(if (horas!! % 1f == 0f) "${horas.toInt()}h" else "${horas}h")
                    append("+")
                }
                if (hasCosecha) append(if (cachos.isNotBlank()) "C$cachos" else "C")
                if (hasCosecha && hasAbonada) append("+")
                if (hasAbonada) append("AB")
                if ((hasCosecha || hasAbonada) && hasCajasCajones) append("+")
                if (hasCajasCajones) append(cajasCajonesCompacto)
            }
            val color = if (hasCajasCajones) Color(0xFF66BB6A)
                        else if (hasCosecha && hasAbonada) Color(0xFFAB47BC)
                        else if (hasCosecha) Color(0xFFFF9800)
                        else Color(0xFF7E57C2)
            Pair(label, color)
        }
        isImporte -> {
            val imp = parts.firstOrNull { it.startsWith("$") } ?: ""
            Pair(imp, Color(0xFF4CAF50))
        }
        hasHoras -> {
            Pair(if (horas!! % 1f == 0f) "${horas.toInt()}h" else "${horas}h", Color(0xFF26C6DA))
        }
        else -> Pair(mw, Color(0xFF888888))
    }
}

private fun formatHoras(horas: Float): String {
    val h = horas.toInt()
    val m = ((horas - h) * 60).toInt()
    return if (m == 0) "${h}h" else "${h}h${m}m"
}

private fun formatMonto(monto: Float): String {
    return if (monto == 0f) "$0"
    else if (monto == monto.toLong().toFloat()) "$${monto.toLong()}"
    else "$${"%.2f".format(monto)}"
}

// Cantidades sueltas (cachos de cosecha): sin decimales cuando son enteras.
private fun formatCantidad(valor: Float): String =
    if (valor == valor.toLong().toFloat()) "${valor.toLong()}" else "%.1f".format(valor)
