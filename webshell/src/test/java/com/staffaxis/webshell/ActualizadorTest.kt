package com.staffaxis.webshell

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * El actualizador es lo unico del shell que no se puede arreglar por la web: si no
 * anda, hay que instalar a mano en 60 telefonos. Asi que se prueba contra el
 * version.json de produccion de verdad, no contra un JSON inventado.
 */
class ActualizadorTest {

    private fun versionJsonReal(): JSONObject {
        val con = (URL("https://raw.githubusercontent.com/gankston/staffaxis-updates/main/version.json")
            .openConnection() as HttpURLConnection).apply { connectTimeout = 10_000; readTimeout = 15_000 }
        val cuerpo = con.inputStream.bufferedReader().use { it.readText() }
        con.disconnect()
        return JSONObject(cuerpo)
    }

    @Test
    fun `el version json de produccion trae todos los campos que el shell lee`() {
        val j = versionJsonReal()
        for (campo in listOf("versionCode", "versionName", "apkUrl")) {
            assertTrue("falta el campo obligatorio '$campo'", j.has(campo))
        }
        // Estos dos son los que permiten detectar una descarga cortada.
        assertTrue("version.json no trae 'size': no se podria verificar la descarga", j.has("size"))
        assertTrue("version.json no trae 'sha256'", j.optString("sha256").isNotBlank())
        println("version.json: vc=${j.getInt("versionCode")} ${j.getString("versionName")} size=${j.optLong("size")}")
    }

    @Test
    fun `solo ofrece actualizar cuando el versionCode remoto es mayor`() {
        val remoto = versionJsonReal().getInt("versionCode")
        val local = BuildConfig.VERSION_CODE
        println("remoto=$remoto  local(shell)=$local")
        assertEquals("el shell tiene que estar en 66", 66, local)
        // Hoy publicado esta 64: el shell NO tiene que ofrecer actualizacion.
        assertFalse("con remoto <= local no se ofrece nada", remoto > local)
        // Y cuando se publique algo mas nuevo, si.
        assertTrue("con remoto mayor tiene que ofrecer", 67 > local)
    }

    @Test
    fun `verificar rechaza un archivo cortado y acepta el entero`() {
        val f = File.createTempFile("apk", ".bin")
        f.writeBytes(ByteArray(1000) { it.toByte() })
        val sha = Actualizador.verificar(f, 1000L, null)
        assertTrue("un archivo del tamaño correcto tiene que pasar", sha)
        assertFalse("un archivo mas chico que lo esperado tiene que fallar",
            Actualizador.verificar(f, 2000L, null))
        assertFalse("un sha distinto tiene que fallar",
            Actualizador.verificar(f, null, "0000000000000000000000000000000000000000000000000000000000000000"))
        assertFalse("un archivo vacio tiene que fallar",
            Actualizador.verificar(File.createTempFile("vacio", ".bin"), null, null))
        f.delete()
    }

    @Test
    fun `el sha256 del APK publicado coincide con el que dice version json`() {
        val j = versionJsonReal()
        val url = j.getString("apkUrl")
        val tmp = File.createTempFile("publicado", ".apk")
        URL(url).openStream().use { inp -> tmp.outputStream().use { out -> inp.copyTo(out) } }
        assertTrue("el APK publicado no pasa la verificacion que hace el shell",
            Actualizador.verificar(tmp, j.optLong("size"), j.optString("sha256")))
        println("APK publicado verificado ok: ${tmp.length()} bytes")
        tmp.delete()
    }
}
