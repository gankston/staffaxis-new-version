package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "employees")
data class EmployeeEntity(
    @PrimaryKey val id: String,
    val nombre: String,
    val apellido: String = "",
    val dni: String?,
    val sectorId: String,
    val sectorName: String,
    val activo: Boolean = true,
    val observacion: String? = null,
    val fechaIngreso: String = "",
    val tieneFotoFrente: Boolean = false,
    val tieneFotoDorso: Boolean = false,
)
