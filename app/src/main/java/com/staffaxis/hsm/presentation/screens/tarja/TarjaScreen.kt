package com.staffaxis.hsm.presentation.screens.tarja

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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

            // Send button section
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
                        TarjaEnviadaStat(formatHoras(status.horasTarjadas), "Horas\ntarjadas")
                        TarjaEnviadaStat("${status.jornalesTotales}", "Jornales\nde hoy")
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

private fun formatHoras(horas: Float): String {
    val h = horas.toInt()
    val m = ((horas - h) * 60).toInt()
    return if (m == 0) "${h}h" else "${h}h${m}m"
}
