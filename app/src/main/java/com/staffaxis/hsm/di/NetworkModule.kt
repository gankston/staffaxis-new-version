package com.staffaxis.hsm.di

import com.staffaxis.hsm.BuildConfig
import com.staffaxis.hsm.data.local.preferences.AppPreferences
import com.staffaxis.hsm.data.remote.api.AbsenceApiService
import com.staffaxis.hsm.data.remote.api.AdminApiService
import com.staffaxis.hsm.data.remote.api.AuthApiService
import com.staffaxis.hsm.data.remote.api.EmployeeApiService
import com.staffaxis.hsm.data.remote.api.SectorsApiService
import com.staffaxis.hsm.data.remote.api.SubmissionApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(prefs: AppPreferences): OkHttpClient {
        val authInterceptor = Interceptor { chain ->
            val token = runBlocking { prefs.deviceToken.first() }
            val request = chain.request().newBuilder().apply {
                if (token != null) {
                    addHeader("Authorization", "Bearer $token")
                    addHeader("X-Device-Token", token)
                }
                addHeader("User-Agent", "StaffAxisHSM-Android/1.0")
            }.build()
            chain.proceed(request)
        }

        val noCacheInterceptor = Interceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("Cache-Control", "no-cache, no-store, must-revalidate")
                    .header("Pragma", "no-cache")
                    .header("Expires", "0")
                    .build()
            )
        }

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(noCacheInterceptor)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
                        else HttpLoggingInterceptor.Level.NONE
            })
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    @Provides @Singleton fun provideAuthApi(r: Retrofit): AuthApiService = r.create(AuthApiService::class.java)
    @Provides @Singleton fun provideSectorsApi(r: Retrofit): SectorsApiService = r.create(SectorsApiService::class.java)
    @Provides @Singleton fun provideEmployeeApi(r: Retrofit): EmployeeApiService = r.create(EmployeeApiService::class.java)
    @Provides @Singleton fun provideSubmissionApi(r: Retrofit): SubmissionApiService = r.create(SubmissionApiService::class.java)
    @Provides @Singleton fun provideAbsenceApi(r: Retrofit): AbsenceApiService = r.create(AbsenceApiService::class.java)
    @Provides @Singleton fun provideAdminApi(r: Retrofit): AdminApiService = r.create(AdminApiService::class.java)
}
