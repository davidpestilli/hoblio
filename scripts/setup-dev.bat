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
call :EnsureWingetOrExit
if errorlevel 1 exit /b 1
call :EnsureRust
if errorlevel 1 exit /b 1
call :EnsureNode
if errorlevel 1 exit /b 1
call :EnsureMsvcOrExit
if errorlevel 1 exit /b 1

echo.
echo --- Compilando workspace Rust ---
cargo build
set "BUILD_RC=!ERRORLEVEL!"
if !BUILD_RC! neq 0 (
  call :MaybeMsvcHelpAfterFailedBuild
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

echo.
echo --- cargo test ---
call :RunCritical cargo test
if errorlevel 1 exit /b 1

echo.
echo --- Validando exemplos ---
call :ValidateExample demo-flow
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
echo   Build Tools: winget install -e --id Microsoft.VisualStudio.2022.BuildTools
echo     ^(marque a carga "Desenvolvimento para desktop com C++"^)
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

:TryVcVars64
where link.exe >nul 2>&1
if not errorlevel 1 goto :eof
where cl >nul 2>&1
if not errorlevel 1 goto :eof
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :eof
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
  if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" (
    echo [setup-dev] Configurando ambiente MSVC ^(vcvars64^)...
    call "%%i\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
  )
)
goto :eof

:EnsureMsvcOrExit
call :TryVcVars64
call :DetectMsvcPresent
if not errorlevel 1 goto :eof
echo.
echo [setup-dev] ERRO: linker MSVC ^(link.exe / cl^) nao encontrado.
echo Rust no Windows precisa das Visual Studio Build Tools 2022 com a carga
echo   "Desenvolvimento para desktop com C++" ^(Desktop development with C++^).
echo.
echo Instalacao manual:
echo   winget install -e --id Microsoft.VisualStudio.2022.BuildTools
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
echo [setup-dev] Iniciando winget ^(pode demorar; marque a carga C++ no instalador^)...
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements
call :DetectMsvcPresent
if not errorlevel 1 (
  echo [setup-dev] Build Tools detectadas. Se cargo build ainda falhar, reabra o terminal e rode o script de novo.
  goto :eof
)
echo [setup-dev] Build Tools ainda nao detectadas. Conclua o instalador, reabra o terminal e execute este script novamente.
:msvc_exit_fail
pause
exit /b 1

:DetectMsvcPresent
where link.exe >nul 2>&1
if not errorlevel 1 exit /b 0
where cl >nul 2>&1
if not errorlevel 1 exit /b 0
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "!VSWHERE!" (
  for /f "usebackq tokens=* delims=" %%I in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
    if exist "%%I\VC\Auxiliary\Build\vcvars64.bat" exit /b 0
  )
)
exit /b 1

:MaybeMsvcHelpAfterFailedBuild
if not exist "%REPO_ROOT%\Cargo.toml" goto :eof
where link.exe >nul 2>&1
if not errorlevel 1 goto :eof
where cl >nul 2>&1
if not errorlevel 1 goto :eof
echo.
echo [setup-dev] cargo build falhou e linker MSVC ^(link.exe / cl^) nao esta no PATH.
echo Rust no Windows precisa das Visual Studio Build Tools 2022.
echo.
echo Sugestao:
echo   winget install -e --id Microsoft.VisualStudio.2022.BuildTools
echo Na instalacao, marque: "Desenvolvimento para desktop com C++"
echo ^(Desktop development with C++^).
echo.
echo Apos instalar, abra um novo prompt e execute este script novamente.
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

:RunOptionalBrowserRun
set "CHROME="
if defined HOBLIO_CHROME_PATH (
  if exist "!HOBLIO_CHROME_PATH!" set "CHROME=!HOBLIO_CHROME_PATH!"
)
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)
if not defined CHROME (
  echo [setup-dev] Pulando run de browser-demo-flow ^(Chrome/Edge nao encontrado; defina HOBLIO_CHROME_PATH^).
  goto :eof
)
if not defined HOBLIO_CHROME_PATH set "HOBLIO_CHROME_PATH=!CHROME!"
echo ^> cargo run -p hoblio-cli -- run examples\browser-demo-flow
cargo run -p hoblio-cli -- run examples\browser-demo-flow
if errorlevel 1 exit /b 1
goto :eof
