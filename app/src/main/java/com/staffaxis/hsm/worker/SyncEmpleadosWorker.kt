package com.staffaxis.hsm.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.domain.repository.EmployeeRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

@HiltWorker
class SyncEmpleadosWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val employeeRepository: EmployeeRepository,
    private val prefs: AppPreferences
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val sectorId = prefs.activeSectorId.first() ?: return Result.success()
        return try {
            employeeRepository.syncEmployeesFromApi(sectorId)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val WORK_NAME = "sync_empleados_worker"

        fun enqueueOneTime(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<SyncEmpleadosWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }
}
