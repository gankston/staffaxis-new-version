package com.staffaxis.hsm.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

object EmulatorDetector {

    fun isEmulator(context: Context): Boolean {
        return checkBuildProps() ||
               checkSystemProperties() ||
               checkEmulatorFiles() ||
               checkCpuInfo() ||
               checkProcVersion() ||
               checkKnownPackages(context)
    }

    // ── 1. Build properties ───────────────────────────────────────────────────
    private fun checkBuildProps(): Boolean {
        var score = 0

        val fp = Build.FINGERPRINT.lowercase()
        if (fp.startsWith("generic")) score += 3
        if (fp.startsWith("unknown")) score += 3
        if (fp.contains("emulator")) score += 3
        if (fp.contains("sdk_gphone")) score += 3
        if (fp.contains("vbox")) score += 3
        if (fp.contains("test-keys") && fp.contains("generic")) score += 2

        val model = Build.MODEL.lowercase()
        if (model.contains("emulator")) score += 3
        if (model.contains("android sdk")) score += 3
        if (model.contains("sdk_gphone")) score += 3
        if (model.contains("droid4x")) score += 3
        if (model.contains("tiantianvm")) score += 3
        if (model.contains("subsystem for android")) score += 3  // WSA

        val hw = Build.HARDWARE.lowercase()
        if (hw == "goldfish") score += 3
        if (hw == "ranchu") score += 3
        if (hw.startsWith("vbox")) score += 3
        if (hw == "nox") score += 3
        if (hw == "android_x86") score += 3

        val manufacturer = Build.MANUFACTURER.lowercase()
        if (manufacturer == "unknown") score += 3
        if (manufacturer == "genymotion") score += 3
        if (manufacturer == "andy") score += 3
        if (manufacturer == "tiantian") score += 3
        if (manufacturer == "nox") score += 3
        if (manufacturer.contains("microsoft")) score += 3       // WSA

        val brand = Build.BRAND.lowercase()
        if (brand.startsWith("generic")) score += 2
        if (brand == "andy") score += 3
        if (brand == "nox") score += 3

        val product = Build.PRODUCT.lowercase()
        if (product.startsWith("sdk")) score += 2
        if (product.startsWith("google_sdk")) score += 3
        if (product.startsWith("sdk_gphone")) score += 3
        if (product.contains("emulator")) score += 3
        if (product.contains("droid4x")) score += 3
        if (product == "full_x86" || product == "full_x86_64") score += 3
        if (product.startsWith("vbox")) score += 3

        val device = Build.DEVICE.lowercase()
        if (device.startsWith("generic")) score += 2
        if (device.startsWith("emulator")) score += 3
        if (device == "vbox86p") score += 3

        val board = Build.BOARD.lowercase()
        if (board == "unknown") score += 2
        if (board.contains("nox")) score += 3
        if (board == "goldfish") score += 3

        if (Build.RADIO == null || Build.RADIO == "unknown") score++

        return score >= 4
    }

    // ── 2. SystemProperties vía reflection (ro.kernel.qemu, ro.bluestacks.*) ──
    private fun checkSystemProperties(): Boolean {
        val props = listOf(
            "ro.kernel.qemu"          to "1",       // QEMU / AVD
            "ro.kernel.qemu.gles"     to "1",
            "ro.bluestacks.version"   to null,      // BlueStacks 5+ (cualquier valor)
            "ro.bluestacks.bp.version" to null,
            "ro.ndk.version"          to null,      // NoxPlayer
        )
        return try {
            val sp = Class.forName("android.os.SystemProperties")
            val get = sp.getMethod("get", String::class.java, String::class.java)
            props.any { (key, expected) ->
                val value = get.invoke(null, key, "") as? String ?: ""
                if (expected != null) value == expected else value.isNotEmpty()
            }
        } catch (_: Exception) { false }
    }

    // ── 3. Archivos específicos de cada emulador ──────────────────────────────
    private fun checkEmulatorFiles(): Boolean {
        val paths = listOf(
            // QEMU / Android Studio AVD
            "/dev/socket/qemud",
            "/dev/qemu_pipe",
            "/system/lib/libc_malloc_debug_qemu.so",
            "/sys/qemu_trace",
            "/system/bin/qemu-props",
            // Genymotion
            "/dev/socket/genyd",
            "/dev/socket/baseband_genyd",
            // LDPlayer 4/9
            "/system/lib/libldutils.so",
            "/system/lib64/libldutils.so",
            "/system/bin/ldinit",
            "/system/app/LDAppStore",
            "/system/priv-app/LDMultiPlayer",
            // NoxPlayer
            "/system/lib/libnoxspeedup.so",
            "/system/bin/nox",
            "/system/app/nox",
            "/system/priv-app/NoxCorePatch",
            // MEmu
            "/system/bin/MEMUsvc",
            "/system/lib/libmemuvideo.so",
            // BlueStacks 4 (VirtualBox)
            "/system/lib/libbstfolder.so",
            "/system/xbin/bstshutdown.sh",
            "/data/bluestacks.prop",
            // BlueStacks 5+ (Hyper-V)
            "/system/priv-app/BlueStacksGoogleSignInService",
            "/system/app/BSStub",
            "/data/data/com.bluestacks.settings",
            // MuMu Player (versiones antiguas)
            "/system/bin/momoshell",
            "/system/lib/libmumu.so",
            // MuMu Player 12 (NetEase nuevo)
            "/system/bin/mumushell",
            "/system/app/MuMuEmulatorUI",
            // GameLoop (Tencent)
            "/system/lib/libgameloop.so",
            "/system/bin/gameloop",
            // Andy
            "/system/lib/libdvm.x86.so",
            // Droid4X
            "/system/lib/xposed_art.so"
        )
        return paths.any { File(it).exists() }
    }

    // ── 4. /proc/cpuinfo ──────────────────────────────────────────────────────
    private fun checkCpuInfo(): Boolean {
        return try {
            val cpuInfo = File("/proc/cpuinfo").readText().lowercase()
            cpuInfo.contains("qemu virtual cpu") ||
            cpuInfo.contains("hypervisor") ||
            cpuInfo.contains("android_x86")
        } catch (_: Exception) { false }
    }

    // ── 5. /proc/version — detecta WSA (Microsoft) y kernels de emuladores ────
    private fun checkProcVersion(): Boolean {
        return try {
            val version = File("/proc/version").readText().lowercase()
            version.contains("microsoft") ||       // WSA
            version.contains("bluestacks") ||
            version.contains("qemu")
        } catch (_: Exception) { false }
    }

    // ── 6. Paquetes instalados de emuladores conocidos ────────────────────────
    private fun checkKnownPackages(context: Context): Boolean {
        val emulatorPackages = listOf(
            "com.lemon.lv",                           // LDPlayer
            "com.bignox.app.store.hd",                // NoxPlayer
            "com.microvirt.launcher",                  // MEmu
            "com.bluestacks.home",                     // BlueStacks 4
            "com.bluestacks.BstCommandProcessor",      // BlueStacks 4
            "com.bluestacks.settings",                 // BlueStacks 5+
            "com.bluestacks.appguidance",              // BlueStacks 5+
            "com.andy.launcher",                       // Andy
            "com.kaopu001.tiantianvm",                 // TianTian
            "com.vphone.launcher",                     // MuMu viejo
            "com.netease.mumu.installer",              // MuMu 12
            "com.netease.mumuvm",                      // MuMu 12
            "com.tencent.gameloop",                    // GameLoop
            "com.microsoft.winos"                      // WSA
        )
        val pm = context.packageManager
        return emulatorPackages.any { pkg ->
            try {
                pm.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES)
                true
            } catch (_: PackageManager.NameNotFoundException) { false }
        }
    }
}
