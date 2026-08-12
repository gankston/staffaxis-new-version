# Cómo levantar todo StaffAxis en una máquina nueva

Guía para dejar la notebook lista para trabajar igual que la PC. Seguila en orden.

---

## 1. Qué se instala (una sola vez)

| Programa | Versión que usamos | Dónde |
|---|---|---|
| **Node.js** | 25.x (viene con npm 11) | https://nodejs.org |
| **Git** | 2.54+ | https://git-scm.com |
| **GitHub CLI** (`gh`) | 2.90+ | https://cli.github.com |
| **JDK 17** | OpenJDK 17.0.18 | https://adoptium.net (elegí Temurin 17) |
| **Android SDK** | Platform 35 + Build-Tools 35 | Ver punto 1.1 |
| **VS Code / Android Studio** | el que prefieras | opcional |

> **Ojo con el JDK**: tiene que ser **17**. Con 21 o superior el build de Android falla.

### 1.1 Android SDK sin instalar Android Studio

Si no querés los 8 GB de Android Studio, alcanza con las command-line tools:

1. Bajá "Command line tools only" de https://developer.android.com/studio
2. Descomprimí en `C:\Android\Sdk\cmdline-tools\latest`
3. Desde `C:\Android\Sdk\cmdline-tools\latest\bin`:

```bash
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
```

Te tiene que quedar la carpeta así: `C:\Android\Sdk\` con `platforms`, `build-tools` y `platform-tools` adentro.

> Usá **la misma ruta** `C:\Android\Sdk`. Si la cambiás, ajustá `local.properties` (punto 3).

### 1.2 Loguear el gh

```bash
gh auth login
```

Elegí GitHub.com → HTTPS → autenticar con el navegador. Con la cuenta **gankston**.

---

## 2. Clonar los repos

Son **tres** repos separados. Poné los dos primeros donde quieras, el tercero da igual.

```bash
git clone https://github.com/gankston/staffaxis-new-version.git
```

```bash
git clone https://github.com/gankston/StaffAdmin.git
```

```bash
git clone https://github.com/gankston/staffaxis-updates.git
```

**Qué es cada uno:**

- **`staffaxis-new-version`** — la app Android (`app/`) y el backend (`server/`). Es el principal.
- **`StaffAdmin`** — la app de escritorio (Electron + React).
- **`staffaxis-updates`** — **no tiene código**. Solo guarda los APK publicados y el `version.json` que dispara la actualización automática de los celulares.

---

## 3. Archivos que NO están en Git (hay que copiarlos a mano)

**Esto es lo más importante de toda la guía.** Estos archivos están excluidos del repo a propósito (tienen claves o rutas). Sin ellos no podés compilar ni publicar. Copialos de la PC vieja por pendrive, Drive o lo que sea.

### 3.1 El keystore de firma — CRÍTICO

**Archivo:** `staffaxis-release.keystore`

**Va sí o sí en esta ruta exacta:**

```
C:\Users\<TU-USUARIO>\Desktop\Versions Staffaxis\staffaxis-release.keystore
```

La ruta está escrita en `app/build.gradle.kts`, por eso no se puede mover.

> **Si perdés este archivo, se acabó.** Sin él no podés volver a firmar la app, y Android **no deja actualizar** una app instalada con una firma distinta. Habría que desinstalar y reinstalar a mano en los 45 teléfonos, perdiendo lo que tengan sin sincronizar. **Hacete una copia en otro lado hoy mismo.**

### 3.2 `local.properties` (Android)

En la raíz de `staffaxis-new-version`, creá el archivo `local.properties` con una línea:

```
sdk.dir=C\:\\Android\\Sdk
```

(Sí, con las barras dobles. Es formato de Java.)

### 3.3 `server/.env` (backend local)

Solo lo necesitás si vas a levantar el backend en tu máquina. Copiá el archivo de la PC vieja, o creá `server/.env` con estas claves:

```
DATABASE_URL=...   (la URL pública de Railway, está en CLAUDE.md)
JWT_SECRET=...     (si es para probar local, cualquier texto largo sirve)
ADMIN_TOKEN=...    (está en CLAUDE.md)
PORT=3001
NODE_ENV=production
```

> **`NODE_ENV=production` aunque sea local.** El pool de Postgres solo activa SSL si está en `production`, y la base de Railway lo exige. Con `development` no conecta.

---

## 4. Instalar dependencias

```bash
cd staffaxis-new-version/server && npm install
```

```bash
cd StaffAdmin && npm install
```

La app Android no necesita `npm install`: Gradle se baja todo solo la primera vez que compilás (tarda unos minutos).

---

## 5. Correr las cosas

### Backend local

```bash
cd staffaxis-new-version/server && npm start
```

Apunta a la base de **producción**. Cuidado con lo que tocás.

### StaffAdmin en modo desarrollo

```bash
cd StaffAdmin && npm run dev
```

Abre la ventana de Electron con recarga automática.

### Compilar la app Android para probar (debug)

```bash
cd staffaxis-new-version && ./gradlew.bat clean :app:assembleDebug
```

Queda en `app/build/outputs/apk/debug/app-debug.apk`.

---

## 6. Publicar (leer antes de hacerlo)

### 6.1 App Android

**Reglas que se aprendieron a los golpes. No las saltees.**

1. **Subí el `versionCode` Y el `versionName`** en `app/build.gradle.kts`. El `versionCode` tiene que ser mayor al de la versión publicada, si no Android rechaza la actualización.

2. **Compilá SIEMPRE con `clean`:**

```bash
./gradlew.bat clean :app:assembleRelease
```

> **Por qué:** Gradle a veces no regenera la constante `BuildConfig.VERSION_CODE` dentro del código compilado si solo cambiaste el `build.gradle.kts`. La app queda comparando contra un número viejo y el cartel de "actualizar" aparece para siempre aunque ya hayan actualizado. Nos pasó: el APK decía 61 en el manifest pero **53** adentro.

3. **Verificá el número que quedó realmente adentro del APK**, no te fíes del manifest:

```bash
"C:/Android/Sdk/build-tools/35.0.0/aapt.exe" dump badging app/build/outputs/apk/release/app-release.apk | head -1
```

Y el que de verdad usa la app para comparar:

```bash
cd /tmp && unzip -o -q <ruta-del-apk> "classes*.dex" && "C:/Android/Sdk/build-tools/35.0.0/dexdump.exe" -d classes.dex | grep -A 4 'const-string v1, "versionCode"' | grep -E "const/16|if-le"
```

Los dos números tienen que coincidir con el que pusiste.

4. **Subí el APK al repo de updates** con el nombre de siempre (`StaffAxis-v3.5.0.apk`) y **recién después** tocá el `version.json`. Así nadie recibe un aviso que apunta a un archivo que todavía no está.

5. **`version.json`** (en `staffaxis-updates`):

```json
{"versionCode":62,"versionName":"3.5.0","apkUrl":"https://raw.githubusercontent.com/gankston/staffaxis-updates/main/StaffAxis-v3.5.0.apk","mandatory":true,"notes":"..."}
```

> **`mandatory: true` saca el botón de "Ahora no".** El que no actualiza no puede usar la app. Usalo solo cuando de verdad quieras forzar a todos.

> **Publicar una versión nueva desloguea a todos.** La app detecta el cambio de `versionCode` y manda a todos a pedir autorización de nuevo (sin perder las tarjas que tengan sin sincronizar). Después hay que aprobarlos uno por uno desde StaffAdmin. **No lo hagas un lunes a la mañana.**

### 6.2 StaffAdmin

```bash
cd StaffAdmin && npx vite build && npx electron-builder --publish never
```

Eso deja el instalador en `dist/`. Para publicarlo y que les llegue por actualización automática, los archivos van a una release de GitHub con **estos nombres exactos** (con guiones, no espacios):

```bash
gh release create v1.7.7 --repo gankston/StaffAdmin --title "StaffAdmin 1.7.7" --notes "..." "staffadmin-Setup-1.7.7.exe" "staffadmin-Setup-1.7.7.exe.blockmap" "latest.yml"
```

> El `latest.yml` referencia el `.exe` por nombre con guiones. Si lo subís con espacios, el actualizador no lo encuentra.

Después verificá que los tres archivos digan `uploaded`:

```bash
gh api repos/gankston/StaffAdmin/releases/tags/v1.7.7 --jq '.assets[] | "\(.name) | \(.state) | \(.size)"'
```

---

## 7. Accesos

Todo lo sensible (URL de la base, token de admin, IDs de Railway) está en **`CLAUDE.md`**, en la raíz del repo principal.

**Base de datos** — usar siempre la URL **pública** (`viaduct.proxy.rlwy.net`), nunca la privada. El backend tiene un Volume montado y con la URL privada da timeout.

**Railway** — proyecto `StaffAxis + StaffAdmin Build`, servicio `staffaxis-new-version`. El deploy es automático: cada push a `main` lo levanta solo. **No montes Volumes nuevos** sin avisar: dispara un redeploy en cadena que puede tumbar Postgres.

---

## 8. Convención de carpetas

En la PC vieja los entregables se guardan todos en:

```
C:\Users\<usuario>\Desktop\Versions Staffaxis\
```

Ahí van los APK compilados, los instaladores de StaffAdmin, los respaldos y el keystore. Conviene mantener lo mismo en la notebook, **sobre todo la ruta del keystore**, que es obligatoria.

---

## 9. Checklist rápido

- [ ] Node, Git, gh, JDK 17 y Android SDK instalados
- [ ] `gh auth login` hecho con la cuenta gankston
- [ ] Los tres repos clonados
- [ ] **Keystore** copiado en `Desktop\Versions Staffaxis\`
- [ ] `local.properties` creado
- [ ] `server/.env` copiado (si vas a correr el backend)
- [ ] `npm install` en `server/` y en `StaffAdmin/`
- [ ] Probaste `./gradlew.bat clean :app:assembleDebug` y compiló
