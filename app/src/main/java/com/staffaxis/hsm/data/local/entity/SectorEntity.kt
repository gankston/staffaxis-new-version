package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sectors")
data class SectorEntity(
    @PrimaryKey val id: String,
    val name: String,
    val tipoCarga: String = "importe"
)
