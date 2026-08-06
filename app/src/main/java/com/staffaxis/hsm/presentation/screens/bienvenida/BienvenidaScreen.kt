package com.staffaxis.hsm.presentation.screens.bienvenida

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.staffaxis.hsm.R
import com.staffaxis.hsm.domain.model.Sector
import com.staffaxis.hsm.presentation.components.GradientButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BienvenidaScreen(
    onNavegar: () -> Unit,
    viewModel: BienvenidaViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var expandido by remember { mutableStateOf(false) }

    // Diálogo nativo de Android — sin texto propio, ya se le explicó para qué es.
    // Se pida o no se pida el permiso, siempre se sigue con la solicitud: el GPS
    // nunca bloquea el flujo (LocationHelper cae a null si no hay permiso/timeout).
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { viewModel.solicitarAutorizacion() }

    fun solicitarConGps() {
        locationPermissionLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        )
    }

    LaunchedEffect(uiState.navegarAMain) {
        if (uiState.navegarAMain) onNavegar()
    }

    if (uiState.isChecking) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color(0xFF1E1E2E))
        )
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFF6A1B9A), Color(0xFF4A148C), Color(0xFF1E1E2E)))
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.logo_staffaxis),
                contentDescription = "Logo",
                modifier = Modifier.size(120.dp)
            )
            Spacer(Modifier.height(24.dp))
            Text(
                "Bienvenido a StaffAxis HSM",
                style = MaterialTheme.typography.headlineLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 26.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(48.dp))

            when {
                uiState.rechazado -> RechazadoCard(onVolver = viewModel::cancelarEspera)

                uiState.esperandoAutorizacion -> EsperandoAutorizacionCard()

                uiState.isLoading -> {
                    CircularProgressIndicator(color = Color(0xFF26C6DA))
                    Spacer(Modifier.height(16.dp))
                    Text("Cargando...", color = Color(0xFF888888), style = MaterialTheme.typography.bodySmall)
                }

                // Tiene token + necesita elegir sector (ya registrado, solo elige sector activo)
                uiState.tieneToken && uiState.mostrarFormulario && uiState.sectores.isNotEmpty() -> {
                    SectorSelectorCard(
                        sectores = uiState.sectores,
                        sectorSeleccionado = uiState.sectorSeleccionado,
                        expandido = expandido,
                        onExpandedChange = { expandido = it },
                        onSectorSelected = { viewModel.onSectorSelected(it); expandido = false },
                        onContinuar = viewModel::confirmarSector
                    )
                }

                // Sin token todavia: elegir sector + nombre completo + pedir autorizacion
                !uiState.tieneToken && uiState.mostrarFormulario && uiState.sectores.isNotEmpty() -> {
                    SolicitarAutorizacionCard(
                        uiState = uiState,
                        expandido = expandido,
                        onExpandedChange = { expandido = it },
                        onSectorSelected = { viewModel.onSectorSelected(it); expandido = false },
                        onNombreChanged = viewModel::onNombreCompletoChanged,
                        onSolicitar = ::solicitarConGps
                    )
                }

                // Sin sectores disponibles
                !uiState.tieneToken && uiState.mostrarFormulario && uiState.sectores.isEmpty() -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("Sin sectores disponibles", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "No hay sectores configurados en el servidor. Contactá al administrador.",
                                color = Color(0xFFB0B0B0),
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                // Pantalla inicial
                else -> {
                    GradientButton(
                        text = "Continuar",
                        onClick = viewModel::mostrarFormularioRegistro,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = true,
                        isLoading = false
                    )
                }
            }

            uiState.error?.let { err ->
                Spacer(Modifier.height(16.dp))
                Text(err, color = Color(0xFFFF5252), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun EsperandoAutorizacionCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            CircularProgressIndicator(color = Color(0xFF26C6DA))
            Text("Esperando autorización", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "Tu solicitud ya llegó al administrador. Esta pantalla va a avanzar sola apenas te autoricen.",
                color = Color(0xFFB0B0B0),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun RechazadoCard(onVolver: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("✕", fontSize = 40.sp, color = Color(0xFFFF5252))
            Text("Solicitud rechazada", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "El administrador rechazó el acceso. Si es un error, pedile que revise la solicitud.",
                color = Color(0xFFB0B0B0),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(4.dp))
            GradientButton(text = "Volver a intentar", onClick = onVolver, isLoading = false, modifier = Modifier.fillMaxWidth())
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SolicitarAutorizacionCard(
    uiState: BienvenidaUiState,
    expandido: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSectorSelected: (Sector) -> Unit,
    onNombreChanged: (String) -> Unit,
    onSolicitar: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Seleccione el Sector", color = Color.White, style = MaterialTheme.typography.labelLarge)

            ExposedDropdownMenuBox(expanded = expandido, onExpandedChange = onExpandedChange) {
                OutlinedTextField(
                    value = uiState.sectorSeleccionado?.let { s ->
                        if (!s.encargado.isNullOrBlank()) "${s.encargado} — ${s.name}" else s.name
                    } ?: "",
                    onValueChange = {},
                    readOnly = true,
                    placeholder = { Text("Seleccione un sector", color = Color(0xFF888888)) },
                    leadingIcon = { Icon(Icons.Default.Business, null, tint = Color(0xFF26C6DA)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandido) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    colors = textFieldColors(),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = expandido,
                    onDismissRequest = { onExpandedChange(false) },
                    modifier = Modifier.background(Color(0xFF2A2A3E))
                ) {
                    uiState.sectores.forEach { sector ->
                        val label = if (!sector.encargado.isNullOrBlank()) "${sector.encargado} — ${sector.name}" else sector.name
                        DropdownMenuItem(
                            text = { Text(label, color = Color.White) },
                            onClick = { onSectorSelected(sector) },
                            modifier = Modifier.background(Color(0xFF2A2A3E))
                        )
                    }
                }
            }

            OutlinedTextField(
                value = uiState.nombreCompleto,
                onValueChange = onNombreChanged,
                label = { Text("Nombre y apellido", color = Color(0xFF888888)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = textFieldColors(),
                shape = RoundedCornerShape(12.dp)
            )

            GradientButton(
                text = if (uiState.isLoading) "Solicitando..." else "Solicitar autorización",
                onClick = onSolicitar,
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState.sectorSeleccionado != null && uiState.nombreCompleto.trim().isNotEmpty(),
                isLoading = uiState.isLoading
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SectorSelectorCard(
    sectores: List<Sector>,
    sectorSeleccionado: Sector?,
    expandido: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSectorSelected: (Sector) -> Unit,
    onContinuar: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A3E))
    ) {
        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Seleccione el Sector", color = Color.White, style = MaterialTheme.typography.labelLarge)

            ExposedDropdownMenuBox(expanded = expandido, onExpandedChange = onExpandedChange) {
                OutlinedTextField(
                    value = sectorSeleccionado?.name ?: "",
                    onValueChange = {},
                    readOnly = true,
                    placeholder = { Text("Seleccione un sector", color = Color(0xFF888888)) },
                    leadingIcon = { Icon(Icons.Default.Business, null, tint = Color(0xFF26C6DA)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandido) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    colors = textFieldColors(),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = expandido,
                    onDismissRequest = { onExpandedChange(false) },
                    modifier = Modifier.background(Color(0xFF2A2A3E))
                ) {
                    sectores.forEach { sector ->
                        DropdownMenuItem(
                            text = { Text(sector.name, color = Color.White) },
                            onClick = { onSectorSelected(sector) },
                            modifier = Modifier.background(Color(0xFF2A2A3E))
                        )
                    }
                }
            }

            GradientButton(
                text = "Continuar",
                onClick = onContinuar,
                enabled = sectorSeleccionado != null,
                isLoading = false,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun textFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedBorderColor = Color(0xFF26C6DA),
    unfocusedBorderColor = Color(0xFF555555),
    focusedContainerColor = Color(0x11FFFFFF),
    unfocusedContainerColor = Color(0x08FFFFFF)
)
