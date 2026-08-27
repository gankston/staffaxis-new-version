package com.staffaxis.hsm.domain.model

data class SupervisorInfo(val id: String, val fullName: String)

data class SupervisorSector(val id: String, val name: String)

data class SupervisorMe(val id: String, val fullName: String, val sectores: List<SupervisorSector>)

data class SupervisorPendingItem(
    val id: String,
    val employeeId: String,
    val empleado: String,
    val sector: String,
    val date: String,
    val minutesWorked: String?,
    val notes: String?,
    val tiposNuevos: TiposCargaNuevos = TiposCargaNuevos(),
    // La tarja ya estaba cargada y se edito despues: el supervisor tiene que
    // revisar los valores nuevos, no los que habia aprobado antes.
    val fueModificada: Boolean = false
)

data class SupervisorResumenRow(
    val submissionId: String,
    val employeeId: String,
    val nombre: String,
    val sectorName: String,
    val date: String,
    val minutesWorked: String?,
    val status: String,
    val tiposNuevos: TiposCargaNuevos = TiposCargaNuevos()
)

sealed class SupervisorAccessResult {
    data class Authorized(val token: String) : SupervisorAccessResult()
    data class Pending(val requestId: String) : SupervisorAccessResult()
}

sealed class SupervisorAccessStatus {
    object Pending : SupervisorAccessStatus()
    data class Authorized(val token: String) : SupervisorAccessStatus()
    object Rejected : SupervisorAccessStatus()
}
