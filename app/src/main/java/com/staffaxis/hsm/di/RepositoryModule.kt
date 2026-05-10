package com.staffaxis.hsm.di

import com.staffaxis.hsm.data.repository.*
import com.staffaxis.hsm.domain.repository.*
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton abstract fun bindAuthRepo(impl: AuthRepositoryImpl): AuthRepository
    @Binds @Singleton abstract fun bindEmployeeRepo(impl: EmployeeRepositoryImpl): EmployeeRepository
    @Binds @Singleton abstract fun bindSubmissionRepo(impl: SubmissionRepositoryImpl): SubmissionRepository
    @Binds @Singleton abstract fun bindAbsenceRepo(impl: AbsenceRepositoryImpl): AbsenceRepository
    @Binds @Singleton abstract fun bindTarjaRepo(impl: TarjaRepositoryImpl): TarjaRepository
}
