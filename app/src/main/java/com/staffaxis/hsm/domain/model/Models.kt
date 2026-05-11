package com.staffaxis.hsm.domain.model

import java.time.LocalDate

data class Sector(
    val id: String,
    val name: String,
    val tipoCarga: String = "importe",
    val encargado: String? = null
)

data class Employee(
    val id: String,
    val nombre: String,
    val apellido: String = "",
    val dni: String?,
    val sectorId: String,
    val sectorName: String,
    val activo: Boolean = true,
    val observacion: String? = null,
    val fechaIngreso: String = ""
)

data class OutboxSubmission(
    val id: String,
    val employeeId: String,
    val sectorId: String,
    val date: String,
    val minutesWorked: String?,
    val notes: String?,
    val status: String
)

data class Absence(
    val id: String,
    val employeeId: String,
    val employeeName: String,
    val fechaInicio: LocalDate,
    val fechaFin: LocalDate,
    val certificadoMedico: Boolean,
    val observaciones: String?,
    val syncStatus: String
)

data class TarjaStatus(
    val date: String,
    val sectorId: String,
    val enviada: Boolean,
    val horaEnvio: Long?,
    val empleadosTarjados: Int,
    val horasTarjadas: Float,
    val jornalesTotales: Int
)

data class EmployeeTransfer(
    val employeeName: String,
    val fromSectorName: String,
    val toSectorName: String
)

sealed class AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>()
    data class Error(val message: String, val cause: Exception? = null) : AppResult<Nothing>()
}
