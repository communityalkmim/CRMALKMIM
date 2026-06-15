@echo off
title Maikon CRM
cd /d "%~dp0"

set "NODE=C:\Users\maiko\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo  MAIKON CRM
echo  ==========
echo  O sistema sera aberto em instantes.
echo  Nao feche esta janela enquanto estiver usando o CRM.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
"%NODE%" --no-warnings server.js

echo.
echo O CRM foi encerrado.
pause
