@echo off
cd /d "%~dp0app\backend"
echo Arrancando Elvi-Ra...
echo Servidor: http://localhost:5173
echo.
node server.js
pause
