package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "absences")
data class AbsenceEntity(
    @PrimaryKey val id: String,
    val employeeId: String,
    val employeeName: String,
    val fechaInicio: String,
    val fechaFin: String,
    val certificadoMedico: Boolean,
    val observaciones: String?,
    val syncStatus: String = "pending",
    val attempts: Int = 0,
    val lastError: String? = null
)
