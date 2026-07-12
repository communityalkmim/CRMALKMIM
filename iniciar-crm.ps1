$ErrorActionPreference = "Stop"
$npm = (Get-Command npm -ErrorAction SilentlyContinue).Source

if (-not $npm) {
  Write-Host "Node.js/npm nao foi encontrado. Instale o Node.js 22 ou superior." -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}

Set-Location $PSScriptRoot
Write-Host "Iniciando Maikon CRM pelo fluxo oficial da Netlify..." -ForegroundColor Cyan
Write-Host "Abra no navegador: http://127.0.0.1:4173" -ForegroundColor Green
& $npm "run" "dev"
