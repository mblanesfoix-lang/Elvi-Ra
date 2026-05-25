@echo off
cd /d "%~dp0"
echo Iniciando S-NFI CRM en modo desarrollo...
echo.
echo Servidor: http://localhost:3001
echo Cliente:  http://localhost:5173
echo.
npm run dev
