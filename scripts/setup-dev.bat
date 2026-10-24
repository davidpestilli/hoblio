@echo off
setlocal EnableDelayedExpansion

rem Hoblio — bootstrap de desenvolvimento (Windows)
rem Uso: scripts\setup-dev.bat [--full]
rem   --full  executa "run" em demo-flow, web-demo-flow e browser (se Chrome/Edge)

set "FULL=0"
:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--full" (
  set "FULL=1"
  shift
  goto parse_args
)
echo [setup-dev] Argumento desconhecido: %~1
echo Uso: %~nx0 [--full]
exit /b 2

:args_done

rem Raiz do repo = pasta pai de scripts\ (contem Cargo.toml do workspace)
pushd "%~dp0.." || (
  echo [setup-dev] ERRO: nao foi possivel entrar na raiz do repo.
  exit /b 1
)
set "REPO_ROOT=%CD%"
if not exist "%REPO_ROOT%\Cargo.toml" (
  echo [setup-dev] ERRO: Execute na pasta do clone hoblio ou use setup-dev.bat dentro do repositorio
  popd
  exit /b 1
)

echo.
echo === Hoblio setup-dev ===
echo Repo: %REPO_ROOT%
echo.

call :EnsureCargoPath
call :EnsureCDriveSpaceOrAbort
if errorlevel 1 (
  popd
  exit /b 1
)
call :EnsureWingetOrExit
if errorlevel 1 exit /b 1
call :EnsureRust
if errorlevel 1 exit /b 1
call :EnsureNode
if errorlevel 1 exit /b 1
call :EnsureMsvcOrExit
if errorlevel 1 exit /b 1
call :EnsureCargoTargetDir
call :ApplyVcVars64

echo.
echo --- Compilando workspace Rust ---
cargo build
set "BUILD_RC=!ERRORLEVEL!"
if !BUILD_RC! neq 0 (
  call :MaybeHelpAfterFailedBuild
  exit /b !BUILD_RC!
)

echo.
echo --- Frontend hoblio-studio ---
pushd "%REPO_ROOT%\crates\hoblio-studio"
call :RunCritical npm install
if errorlevel 1 (
  popd
  exit /b 1
)
call :RunCritical npm run build
set "NPM_BUILD_ERR=!ERRORLEVEL!"
popd
if !NPM_BUILD_ERR! neq 0 exit /b 1

echo.
echo --- Verificando versoes ---
call :RequireCmd rustc --version
call :RequireCmd cargo --version
call :RequireCmd node --version
call :RequireCmd npm --version
call :ReportChromiumForDemos

echo.
echo --- cargo test ---
call :RunCritical cargo test
if errorlevel 1 exit /b 1

echo.
echo --- Validando exemplos ---
call :ValidateExample demo-flow
if errorlevel 1 exit /b 1
call :ValidateExample flow-control-demo
if errorlevel 1 exit /b 1
call :ValidateExample web-demo-flow
if errorlevel 1 exit /b 1
call :ValidateExample message-timer-demo
if errorlevel 1 exit /b 1
call :ValidateExample browser-demo-flow
if errorlevel 1 exit /b 1

if "!FULL!"=="1" (
  echo.
  echo --- Modo --full: executando fluxos de demo ---
  call :RunCritical cargo run -p hoblio-cli -- run examples\demo-flow
  if errorlevel 1 exit /b 1
  call :RunCritical cargo run -p hoblio-cli -- run examples\web-demo-flow
  if errorlevel 1 exit /b 1
  call :RunOptionalBrowserRun
)

echo.
echo [setup-dev] OK — ambiente pronto.
echo Browser p/ fluxos browser_*: deteccao automatica de Chrome/Edge ^(HOBLIO_CHROME_PATH opcional^).
echo Variaveis de execucao: browser_get_text + `{nome}` em file_write/log — ver docs\guia-construcao.md
echo Proximo passo:
echo   cd crates\hoblio-studio
echo   npm run tauri dev
echo.
exit /b 0

rem ---------- subrotinas ----------

:EnsureCargoPath
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
goto :eof

:EnsureWingetOrExit
where winget >nul 2>&1
if not errorlevel 1 goto :eof
echo [setup-dev] ERRO: winget nao encontrado.
echo Instale Rust, Node.js LTS e Visual Studio Build Tools manualmente.
echo   Rust: https://rustup.rs/
echo   Node: https://nodejs.org/
echo   Build Tools: winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
exit /b 1

:EnsureRust
where rustc >nul 2>&1
if not errorlevel 1 goto rust_default
echo [setup-dev] Instalando Rust ^(Rustlang.Rustup^) via winget...
winget install -e --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements
call :EnsureCargoPath
where rustc >nul 2>&1
if errorlevel 1 (
  echo [setup-dev] ERRO: rustc ainda nao esta no PATH. Feche e reabra o terminal ou reinicie a sessao.
  exit /b 1
)
:rust_default
where rustup >nul 2>&1
if not errorlevel 1 (
  rustup default stable >nul 2>&1
)
goto :eof

:EnsureNode
where node >nul 2>&1
if not errorlevel 1 goto :eof
echo [setup-dev] Instalando Node.js LTS ^(OpenJS.NodeJS.LTS^) via winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where node >nul 2>&1
if errorlevel 1 (
  echo [setup-dev] ERRO: node nao encontrado apos instalacao. Reabra o terminal e execute o script novamente.
  exit /b 1
)
goto :eof

:ApplyVcVars64
where link.exe >nul 2>&1
if not errorlevel 1 goto :eof
where cl >nul 2>&1
if not errorlevel 1 goto :eof
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :eof
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
  if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" (
    echo [setup-dev] Configurando ambiente MSVC ^(vcvars64 em %%i^)...
    call "%%i\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
  )
)
goto :eof

:DetectVcToolsInstalled
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "!VSWHERE!" exit /b 1
for /f "usebackq tokens=* delims=" %%I in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
  if exist "%%I\VC\Auxiliary\Build\vcvars64.bat" exit /b 0
)
exit /b 1

:DetectMsvcInPath
where link.exe >nul 2>&1
if not errorlevel 1 exit /b 0
where cl >nul 2>&1
if not errorlevel 1 exit /b 0
exit /b 1

:WarnIfBuildToolsWithoutVc
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :eof
set "HAS_BT_SHELL=0"
set "HAS_VC=0"
for /f "usebackq tokens=* delims=" %%I in (`"%VSWHERE%" -products Microsoft.VisualStudio.Product.BuildTools -property installationPath 2^>nul`) do set "HAS_BT_SHELL=1"
call :DetectVcToolsInstalled
if not errorlevel 1 set "HAS_VC=1"
if "!HAS_BT_SHELL!"=="1" if "!HAS_VC!"=="0" (
  echo [setup-dev] AVISO: ha Build Tools instaladas SEM a carga C++ ^(sem link.exe^).
  echo   Abra o Visual Studio Installer e marque "Desenvolvimento para desktop com C++"
  echo   ou deixe este script reinstalar/adicionar a carga via winget.
  echo   VS Code / Cursor NAO substituem as Build Tools MSVC.
)
goto :eof

:GetCFreeGb
set "C_FREE_GB=-1"
for /f "usebackq delims=" %%G in (`powershell -NoProfile -Command "[int][math]::Floor((Get-PSDrive -Name C).Free/1GB)" 2^>nul`) do set "C_FREE_GB=%%G"
goto :eof

:EnsureCDriveSpaceOrAbort
rem Minimo no C: — SDK MSVC, cache do instalador e %TEMP% durante cargo/npm
set "MIN_C_GB=4"
set "MIN_C_REASON=compilar o workspace e rodar npm/cargo com margem de cache"
call :DetectVcToolsInstalled
if errorlevel 1 (
  set "MIN_C_GB=7"
  set "MIN_C_REASON=instalar Visual Studio Build Tools com carga C++ ^(SDK e cache no C:^)"
)
call :GetCFreeGb
echo.
echo [setup-dev] Pre-requisito: espaco livre no disco C:
echo   Necessario agora: ~!MIN_C_GB! GB ^(!MIN_C_REASON!^)
if !C_FREE_GB! LSS 0 (
  echo   Disponivel: ^(nao foi possivel medir o C:^)
  echo.
  echo [setup-dev] ERRO: nao foi possivel verificar espaco no C:. Libere espaco e tente de novo.
  echo Detalhes: docs\troubleshooting-windows.md
  pause
  exit /b 1
)
echo   Disponivel: ~!C_FREE_GB! GB
if !C_FREE_GB! GEQ !MIN_C_GB! goto c_disk_ok
echo.
echo [setup-dev] ERRO: espaco insuficiente no C: para continuar.
echo.
echo O instalador MSVC e o Windows SDK usam o C: mesmo que as Build Tools
echo fiquem em outro disco ^(ex.: E:\VS\BuildTools^). Libere espaco no C:
echo ^(Downloads, Lixeira, caches^) e execute este script novamente.
echo.
echo Depois de liberar ~!MIN_C_GB! GB ou mais:
echo   %~nx0
echo.
echo Dicas ^(nao substituem espaco minimo no C:^):
echo   HOBLIO_VS_INSTALL_PATH=E:\VS\BuildTools
echo   HOBLIO_CARGO_TARGET_DIR=E:\cargo-target\hoblio
echo.
echo Detalhes: docs\troubleshooting-windows.md
pause
exit /b 1
:c_disk_ok
goto :eof

:EnsureCargoTargetDir
if defined CARGO_TARGET_DIR goto :eof
if defined HOBLIO_CARGO_TARGET_DIR (
  set "CARGO_TARGET_DIR=!HOBLIO_CARGO_TARGET_DIR!"
  echo [setup-dev] CARGO_TARGET_DIR=!CARGO_TARGET_DIR! ^(HOBLIO_CARGO_TARGET_DIR^)
  goto :eof
)
call :GetCFreeGb
if !C_FREE_GB! GEQ 5 goto :eof
set "CARGO_TARGET_DIR=%REPO_ROOT%\target"
echo [setup-dev] C: com ~!C_FREE_GB! GB livres — compilacao em !CARGO_TARGET_DIR!
echo [setup-dev] ^(Windows SDK/cache ainda usam C:; libere espaco se falhar com "no space"^)
if /i "%REPO_ROOT:~0,2%"=="C:" (
  echo [setup-dev] Dica: defina HOBLIO_CARGO_TARGET_DIR=E:\cargo-target\hoblio se o repo estiver no C:
)
goto :eof

:BuildVsWingetOverride
set "VS_WINGET_OVERRIDE=--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
if defined HOBLIO_VS_INSTALL_PATH (
  set "VS_WINGET_OVERRIDE=!VS_WINGET_OVERRIDE! --installPath !HOBLIO_VS_INSTALL_PATH!"
  goto :eof
)
call :GetCFreeGb
if !C_FREE_GB! GEQ 4 goto :eof
for %%I in ("%REPO_ROOT%") do set "AUTO_VS_PATH=%%~dI\VS\BuildTools"
if /i not "!AUTO_VS_PATH:~0,2!"=="C:" (
  echo [setup-dev] C: com ~!C_FREE_GB! GB — destino sugerido das Build Tools: !AUTO_VS_PATH!
  set "VS_WINGET_OVERRIDE=!VS_WINGET_OVERRIDE! --installPath !AUTO_VS_PATH!"
)
goto :eof

:EnsureMsvcOrExit
call :WarnIfBuildToolsWithoutVc
call :ApplyVcVars64
call :DetectMsvcInPath
if not errorlevel 1 goto :eof
call :DetectVcToolsInstalled
if not errorlevel 1 (
  call :ApplyVcVars64
  call :DetectMsvcInPath
  if not errorlevel 1 goto :eof
)
echo.
echo [setup-dev] ERRO: linker MSVC ^(link.exe / cl^) nao encontrado.
echo Rust no Windows precisa das Visual Studio Build Tools 2022 com a carga
echo   "Desenvolvimento para desktop com C++" ^(Desktop development with C++^).
echo.
call :GetCFreeGb
echo C: ~!C_FREE_GB! GB livres — o instalador precisa de ~4-7 GB no C: ^(SDK/cache^).
echo.
echo Instalacao manual ^(carga C++ obrigatoria^):
echo   winget install -e --id Microsoft.VisualStudio.2022.BuildTools --disable-interactivity --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
echo Opcional outro disco: defina HOBLIO_VS_INSTALL_PATH=E:\VS\BuildTools antes de rodar o script.
echo.
echo Apos instalar, abra um NOVO prompt e execute este script novamente.
echo Detalhes: docs\troubleshooting-windows.md
echo.
set /p "INSTALL_BT=Instalar Build Tools agora via winget? [S/N]: "
if /i not "!INSTALL_BT!"=="S" goto msvc_exit_fail
where winget >nul 2>&1
if errorlevel 1 (
  echo [setup-dev] winget indisponivel — instale as Build Tools manualmente.
  goto msvc_exit_fail
)
call :BuildVsWingetOverride
echo [setup-dev] Iniciando winget com carga C++ ^(pode demorar varios minutos^)...
echo [setup-dev] Se falhar com codigo 1 / 0x80070070, libere espaco no C:.
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --disable-interactivity --override "!VS_WINGET_OVERRIDE!"
call :ApplyVcVars64
call :DetectMsvcInPath
if not errorlevel 1 (
  echo [setup-dev] Build Tools C++ detectadas.
  goto :eof
)
echo [setup-dev] Build Tools ainda nao prontas. Conclua o instalador, reabra o terminal e execute este script novamente.
:msvc_exit_fail
pause
exit /b 1

:MaybeHelpAfterFailedBuild
if not exist "%REPO_ROOT%\Cargo.toml" goto :eof
call :GetCFreeGb
if !C_FREE_GB! LSS 5 (
  echo.
  echo [setup-dev] cargo build falhou com C: ~!C_FREE_GB! GB livres.
  echo Erro comum: "no space on device" / os error 112 — libere C: ou use:
  echo   set HOBLIO_CARGO_TARGET_DIR=E:\cargo-target\hoblio
  echo e execute o script de novo ^(target fora do C:^).
)
call :ApplyVcVars64
call :DetectMsvcInPath
if not errorlevel 1 goto :eof
echo.
echo [setup-dev] cargo build falhou e linker MSVC ^(link.exe / cl^) nao esta no PATH.
echo Rust no Windows precisa das Visual Studio Build Tools 2022 com carga C++.
echo Sugestao: docs\troubleshooting-windows.md
pause
goto :eof

:RunCritical
echo ^> %*
call %*
set "RC=!ERRORLEVEL!"
if !RC! neq 0 (
  echo [setup-dev] ERRO: comando falhou com codigo !RC!: %*
  exit /b !RC!
)
goto :eof

:RequireCmd
call %*
if errorlevel 1 (
  echo [setup-dev] ERRO: falha ao executar: %*
  exit /b 1
)
goto :eof

:ValidateExample
set "EX_NAME=%~1"
echo ^> cargo run -p hoblio-cli -- validate examples\!EX_NAME!
cargo run -p hoblio-cli -- validate "examples\!EX_NAME!"
if errorlevel 1 (
  echo [setup-dev] ERRO: validate falhou para examples\!EX_NAME!
  exit /b 1
)
goto :eof

:FindChromiumExe
set "CHROMIUM_EXE="
if defined HOBLIO_CHROME_PATH if exist "!HOBLIO_CHROME_PATH!" (
  set "CHROMIUM_EXE=!HOBLIO_CHROME_PATH!"
  goto :eof
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROMIUM_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "CHROMIUM_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  goto :eof
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROMIUM_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  set "CHROMIUM_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  goto :eof
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set "CHROMIUM_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  set "CHROMIUM_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
  goto :eof
)
goto :eof

:ReportChromiumForDemos
call :FindChromiumExe
if defined CHROMIUM_EXE (
  echo [setup-dev] Browser p/ demos: !CHROMIUM_EXE!
  echo   ^(runtime detecta automaticamente; HOBLIO_CHROME_PATH so se precisar override^)
) else (
  echo [setup-dev] AVISO: Chrome/Edge nao detectado — fluxos browser_* falham ate instalar ou HOBLIO_CHROME_PATH.
)
goto :eof

:RunOptionalBrowserRun
call :FindChromiumExe
if not defined CHROMIUM_EXE (
  echo [setup-dev] Pulando run de browser-demo-flow ^(Chrome/Edge nao encontrado^).
  goto :eof
)
echo [setup-dev] browser-demo-flow ^(Chromium: !CHROMIUM_EXE!^)
echo ^> cargo run -p hoblio-cli -- run examples\browser-demo-flow
cargo run -p hoblio-cli -- run examples\browser-demo-flow
if errorlevel 1 exit /b 1
goto :eof
