package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tarja_status")
data class TarjaStatusEntity(
    @PrimaryKey val date: String,
    val sectorId: String,
    val enviada: Boolean = false,
    val horaEnvio: Long? = null,
    val empleadosTarjados: Int = 0,
    val horasTarjadas: Float = 0f,
    val jornalesTotales: Int = 0
)
