@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install-windows.ps1"
echo.
echo La consola de instalacion queda abierta. La captura usa una tarea sin ventana.
pause
