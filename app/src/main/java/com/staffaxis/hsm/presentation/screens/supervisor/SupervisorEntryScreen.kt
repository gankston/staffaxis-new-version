package com.staffaxis.hsm.presentation.screens.supervisor

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.domain.model.SupervisorInfo
import com.staffaxis.hsm.presentation.components.GradientButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorEntryScreen(
    onNavegar: () -> Unit,
    viewModel: SupervisorEntryViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var expandido by remember { mutableStateOf(false) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { viewModel.solicitarAutorizacion() }

    LaunchedEffect(uiState.navegarAlPanel) {
        if (uiState.navegarAlPanel) onNavegar()
    }

    if (uiState.isChecking) {
        Box(Modifier.fillMaxSize().background(Color(0xFF1E1E2E)))
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF6A1B9A), Color(0xFF4A148C), Color(0xFF1E1E2E))))
    ) {
        Column(
            modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "Modo Supervisor",
                style = MaterialTheme.typography.headlineLarge,
                color = Color.White, fontWeight = FontWeight.Bold, fontSize = 26.sp, textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(48.dp))

            when {
                uiState.rechazado -> RechazadoSupervisorCard(onVolver = viewModel::cancelarEspera)
                uiState.esperandoAutorizacion -> EsperandoSupervisorCard()
                else -> SeleccionarSupervisorCard(
                    uiState = uiState, expandido = expandido, onExpandedChange = { expandido = it },
                    onSeleccionado = { viewModel.onSupervisorSelected(it); expandido = false },
                    onSolicitar = {
                        locationPermissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                        )
                    }
                )
            }

            uiState.error?.let { err ->
                Spacer(Modifier.height(16.dp))
                Text(err, color = Color(0xFFFF5252), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SeleccionarSupervisorCard(
    uiState: SupervisorEntryUiState,
    expandido: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSeleccionado: (SupervisorInfo) -> Unit,
    onSolicitar: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Seleccione su nombre", color = Color.White, style = MaterialTheme.typography.labelLarge)

            ExposedDropdownMenuBox(expanded = expandido, onExpandedChange = onExpandedChange) {
                OutlinedTextField(
                    value = uiState.seleccionado?.fullName ?: "",
                    onValueChange = {},
                    readOnly = true,
                    placeholder = { Text("Elegí tu nombre", color = Color(0xFF888888)) },
                    leadingIcon = { Icon(Icons.Default.Person, null, tint = Color(0xFF26C6DA)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandido) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF9C27B0), unfocusedBorderColor = Color(0xFF444444),
                        disabledTextColor = Color.White,
                        cursorColor = Color(0xFF9C27B0)
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = expandido, onDismissRequest = { onExpandedChange(false) },
                    modifier = Modifier.background(Color(0xFF2A2A3E))
                ) {
                    uiState.supervisores.forEach { sup ->
                        DropdownMenuItem(
                            text = { Text(sup.fullName, color = Color.White) },
                            onClick = { onSeleccionado(sup) },
                            modifier = Modifier.background(Color(0xFF2A2A3E))
                        )
                    }
                }
            }

            GradientButton(
                text = if (uiState.isLoading) "Solicitando..." else "Solicitar autorización",
                onClick = onSolicitar,
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState.seleccionado != null,
                isLoading = uiState.isLoading
            )
        }
    }
}

@Composable
private fun EsperandoSupervisorCard() {
    Card(
        modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(
            modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            CircularProgressIndicator(color = Color(0xFF26C6DA))
            Text("Esperando autorización", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "Tu solicitud ya llegó a StaffAdmin. Esta pantalla va a avanzar sola apenas te autoricen.",
                color = Color(0xFFB0B0B0), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun RechazadoSupervisorCard(onVolver: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(
            modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("✕", fontSize = 40.sp, color = Color(0xFFFF5252))
            Text("Solicitud rechazada", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "Te rechazaron el acceso como supervisor. Si es un error, pedí que revisen la solicitud.",
                color = Color(0xFFB0B0B0), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(4.dp))
            GradientButton(text = "Volver a intentar", onClick = onVolver, isLoading = false, modifier = Modifier.fillMaxWidth())
        }
    }
}
