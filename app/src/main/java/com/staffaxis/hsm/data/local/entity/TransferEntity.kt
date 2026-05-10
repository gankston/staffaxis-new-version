package com.staffaxis.hsm.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "employee_transfers")
data class TransferEntity(
    @PrimaryKey val id: String,
    val employeeId: String,
    val employeeName: String,
    val fromSectorId: String,
    val fromSectorName: String,
    val toSectorId: String,
    val toSectorName: String,
    val date: String
)
