package com.staffaxis.hsm.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.staffaxis.hsm.domain.model.Employee
import com.staffaxis.hsm.presentation.theme.*

@Composable
fun EmpleadoCard(
    empleado: Employee,
    tieneHorasHoy: Boolean,
    estaAusenteHoy: Boolean,
    onRelojClick: () -> Unit,
    onEditarClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val gradientColors = remember(estaAusenteHoy, tieneHorasHoy) {
        when {
            estaAusenteHoy  -> listOf(CardAusente1, CardAusente2)
            tieneHorasHoy   -> listOf(CardConHoras1, CardConHoras2)
            else            -> listOf(CardNormal1, CardNormal2)
        }
    }
    val clockTint = if (estaAusenteHoy || tieneHorasHoy) Color.White else TurquesaBrillante
    val editTint  = if (estaAusenteHoy || tieneHorasHoy) Color.White else Purple80

    Card(
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
        elevation = CardDefaults.cardElevation(0.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.horizontalGradient(gradientColors),
                    shape = MaterialTheme.shapes.medium
                )
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = empleado.nombre,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("DNI: ${empleado.dni ?: "Sin datos"}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
                    Text("Sector: ${empleado.sectorName}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
                    if (!empleado.observacion.isNullOrBlank()) {
                        Spacer(Modifier.height(2.dp))
                        Text("Obs: ${empleado.observacion}", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f), fontWeight = FontWeight.Medium)
                    }
                    if (estaAusenteHoy) {
                        Spacer(Modifier.height(4.dp))
                        Text("AUSENTE", style = MaterialTheme.typography.labelMedium, color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onRelojClick, enabled = !estaAusenteHoy) {
                        Icon(Icons.Default.Schedule, "Cargar horas", tint = clockTint)
                    }
                    IconButton(onClick = onEditarClick) {
                        Icon(Icons.Default.Edit, "Editar", tint = editTint)
                    }
                }
            }
        }
    }
}
