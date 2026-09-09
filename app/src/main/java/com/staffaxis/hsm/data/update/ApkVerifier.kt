package com.staffaxis.hsm.data.update

import java.io.File
import java.security.MessageDigest

/**
 * Compara el APK bajado contra lo que dice version.json (tamaño y sha256). DownloadManager
 * marca la descarga como "exitosa" apenas la conexion HTTP termina sin error — NO garantiza
 * que el archivo haya llegado entero. Con señal debil en el campo eso puede dejar un APK
 * truncado, y ahi Android tira "hay un problema con el archivo de la app" al instalar.
 *
 * Si version.json no trae esos campos (una publicacion vieja, de antes de este chequeo)
 * no hay con que comparar y se deja pasar tal cual se hacia antes.
 */
object ApkVerifier {
    fun verificar(file: File, expectedSize: Long?, expectedSha256: String?): Boolean {
        if (!file.exists() || file.length() == 0L) return false
        if (expectedSize != null && file.length() != expectedSize) return false
        if (expectedSha256 != null) {
            val actual = sha256(file)
            if (!actual.equals(expectedSha256, ignoreCase = true)) return false
        }
        return true
    }

    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1 shl 16)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
