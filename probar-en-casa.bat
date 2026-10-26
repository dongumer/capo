@echo off
rem Arranca el Capo en este PC para probarlo (sin publicar nada).
rem Doble clic y se abre el juego. Para pararlo, cierra las dos ventanas negras.
cd /d "%~dp0"
start "Capo - servidor (no cerrar)" cmd /k "cd server && npm run dev"
start "Capo - web (no cerrar)" cmd /k "python -m http.server 5173 --bind 0.0.0.0"
timeout /t 5 /nobreak >nul
start "" http://localhost:5173
echo.
echo  Capo arrancado.
echo  En este PC:  http://localhost:5173
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue).IPAddress"`) do echo  En el movil (misma wifi):  http://%%i:5173
echo.
pause
