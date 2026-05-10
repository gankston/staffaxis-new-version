package com.staffaxis.hsm.presentation.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.NoMeetingRoom
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.staffaxis.hsm.presentation.screens.ausencias.AusenciasScreen
import com.staffaxis.hsm.presentation.screens.bienvenida.BienvenidaScreen
import com.staffaxis.hsm.presentation.screens.empleados.EmpleadosScreen
import com.staffaxis.hsm.presentation.screens.tarja.TarjaScreen

private sealed class Destination(val route: String) {
    object Bienvenida : Destination("bienvenida")
    object Main : Destination("main")
}

private sealed class Tab(val route: String, val label: String, val icon: ImageVector) {
    object Empleados : Tab("empleados", "Empleados", Icons.Default.Group)
    object Ausencias : Tab("ausencias", "Ausencias", Icons.Default.NoMeetingRoom)
    object Tarja : Tab("tarja", "Tarja", Icons.Default.List)
}

@Composable
fun AppNavigation(sessionViewModel: SessionViewModel = hiltViewModel()) {
    val startDestination by sessionViewModel.startDestination.collectAsState()

    if (startDestination == null) {
        Box(Modifier.fillMaxSize().background(Color(0xFF1E1E2E)))
        return
    }

    val rootNav = rememberNavController()

    NavHost(navController = rootNav, startDestination = startDestination!!) {
        composable(Destination.Bienvenida.route) {
            BienvenidaScreen(onNavegar = {
                rootNav.navigate(Destination.Main.route) {
                    popUpTo(Destination.Bienvenida.route) { inclusive = true }
                }
            })
        }
        composable(Destination.Main.route) {
            MainScreen(
                onCambiarSector = {
                    rootNav.navigate(Destination.Bienvenida.route) {
                        popUpTo(Destination.Main.route) { inclusive = true }
                    }
                },
                onRecargarMain = {
                    rootNav.navigate(Destination.Main.route) {
                        popUpTo(Destination.Main.route) { inclusive = true }
                    }
                }
            )
        }
    }
}

@Composable
private fun MainScreen(onCambiarSector: () -> Unit, onRecargarMain: () -> Unit) {
    val tabNav = rememberNavController()
    val tabs = listOf(Tab.Empleados, Tab.Ausencias, Tab.Tarja)

    Scaffold(
        containerColor = Color(0xFF1E1E2E),
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF12121E),
                contentColor = Color(0xFF26C6DA)
            ) {
                val navBackStackEntry by tabNav.currentBackStackEntryAsState()
                val currentDest = navBackStackEntry?.destination

                tabs.forEach { tab ->
                    val selected = currentDest?.hierarchy?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            tabNav.navigate(tab.route) {
                                popUpTo(tabNav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = {
                            Text(
                                tab.label,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF26C6DA),
                            selectedTextColor = Color(0xFF26C6DA),
                            unselectedIconColor = Color(0xFF666666),
                            unselectedTextColor = Color(0xFF666666),
                            indicatorColor = Color(0xFF9C27B0).copy(alpha = 0.2f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = tabNav,
            startDestination = Tab.Empleados.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Tab.Empleados.route) { EmpleadosScreen(onCambiarSector = onCambiarSector, onRecargarMain = onRecargarMain) }
            composable(Tab.Ausencias.route) { AusenciasScreen() }
            composable(Tab.Tarja.route) { TarjaScreen(onCambiarSector = onCambiarSector, onRecargarMain = onRecargarMain) }
        }
    }
}
