package com.staffaxis.hsm.di

import android.content.Context
import androidx.room.Room
import com.staffaxis.hsm.data.local.dao.*
import com.staffaxis.hsm.data.local.database.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "staffaxis_hsm.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides fun provideSectorDao(db: AppDatabase): SectorDao = db.sectorDao()
    @Provides fun provideEmployeeDao(db: AppDatabase): EmployeeDao = db.employeeDao()
    @Provides fun provideOutboxDao(db: AppDatabase): OutboxSubmissionDao = db.outboxSubmissionDao()
    @Provides fun provideAbsenceDao(db: AppDatabase): AbsenceDao = db.absenceDao()
    @Provides fun provideTarjaStatusDao(db: AppDatabase): TarjaStatusDao = db.tarjaStatusDao()
    @Provides fun provideTransferDao(db: AppDatabase): TransferDao = db.transferDao()
}
