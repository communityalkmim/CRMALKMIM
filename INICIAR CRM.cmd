@echo off
title Maikon CRM
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm nao foi encontrado. Instale o Node.js 22 ou superior.
  pause
  exit /b 1
)

echo.
echo  MAIKON CRM
echo  ==========
echo  O CRM sera iniciado pelo fluxo oficial da Netlify.
echo  Nao feche esta janela enquanto estiver usando o CRM.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
npm run dev

echo.
echo O CRM foi encerrado.
pause
