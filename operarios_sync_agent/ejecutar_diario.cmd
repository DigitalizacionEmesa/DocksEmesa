@echo off
setlocal
cd /d "%~dp0"
echo [%date% %time%] Inicio de sincronizacion diaria >> sincronizador.log
SincronizadorOperarios.exe --diario >> sincronizador.log 2>&1
set RESULTADO=%ERRORLEVEL%
echo [%date% %time%] Fin de sincronizacion. Codigo: %RESULTADO% >> sincronizador.log
exit /b %RESULTADO%
