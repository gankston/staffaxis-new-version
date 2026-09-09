package com.staffaxis.hsm.data.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.security.MessageDigest

/**
 * Este es el chequeo que evita el bug real que vimos en video: DownloadManager marca
 * la descarga "exitosa" con solo que la conexion HTTP haya cerrado sin error, aunque el
 * archivo haya quedado truncado a mitad de camino — y ahi Android tira "hay un problema
 * con el archivo de la app" al querer instalar.
 */
class ApkVerifierTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    @Test
    fun `archivo completo con tamano y hash correctos pasa`() {
        val bytes = "contenido de prueba del apk".toByteArray()
        val f = tmp.newFile("ok.apk").apply { writeBytes(bytes) }
        assertTrue(ApkVerifier.verificar(f, bytes.size.toLong(), sha256Hex(bytes)))
    }

    @Test
    fun `archivo truncado con tamano incorrecto no pasa`() {
        // El caso real del video: la descarga se corta a mitad de camino pero
        // DownloadManager la marca como exitosa igual.
        val completo = "contenido completo del apk, mas largo".toByteArray()
        val truncado = completo.copyOfRange(0, completo.size / 2)
        val f = tmp.newFile("truncado.apk").apply { writeBytes(truncado) }
        assertFalse(ApkVerifier.verificar(f, completo.size.toLong(), sha256Hex(completo)))
    }

    @Test
    fun `mismo tamano pero contenido distinto no pasa por el hash`() {
        val original = "contenido original AAAA".toByteArray()
        val corrupto = "contenido original BBBB".toByteArray() // mismo largo, distinto contenido
        assertEquals(original.size, corrupto.size)
        val f = tmp.newFile("corrupto.apk").apply { writeBytes(corrupto) }
        assertFalse(ApkVerifier.verificar(f, original.size.toLong(), sha256Hex(original)))
    }

    @Test
    fun `archivo vacio nunca pasa`() {
        val f = tmp.newFile("vacio.apk")
        assertFalse(ApkVerifier.verificar(f, null, null))
    }

    @Test
    fun `archivo que no existe no pasa`() {
        val f = tmp.root.resolve("no_existe.apk")
        assertFalse(ApkVerifier.verificar(f, null, null))
    }

    @Test
    fun `sin tamano ni hash esperados se deja pasar (version_json vieja)`() {
        val f = tmp.newFile("sin_verificar.apk").apply { writeBytes("cualquier cosa".toByteArray()) }
        assertTrue(ApkVerifier.verificar(f, null, null))
    }

    @Test
    fun `el hash no distingue mayusculas de minusculas`() {
        val bytes = "abc".toByteArray()
        val f = tmp.newFile("caps.apk").apply { writeBytes(bytes) }
        assertTrue(ApkVerifier.verificar(f, null, sha256Hex(bytes).uppercase()))
    }

    @Test
    fun `sha256 calcula el hash correcto de un archivo grande`() {
        // Fuerza mas de una vuelta del buffer de 64KB para probar el streaming, no solo un read().
        val bytes = ByteArray(200_000) { (it % 251).toByte() }
        val f = tmp.newFile("grande.apk").apply { writeBytes(bytes) }
        assertEquals(sha256Hex(bytes), ApkVerifier.sha256(f))
    }
}
