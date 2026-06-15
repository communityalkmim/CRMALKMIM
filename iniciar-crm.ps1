$ErrorActionPreference = "Stop"
$node = "C:\Users\maiko\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path $node)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
}

if (-not $node) {
  Write-Host "Node.js não foi encontrado. Instale o Node.js 22 ou superior." -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}

Set-Location $PSScriptRoot
Write-Host "Iniciando Maikon CRM..." -ForegroundColor Cyan
Write-Host "Abra no navegador: http://127.0.0.1:4173" -ForegroundColor Green
& $node "--no-warnings" "server.js"
