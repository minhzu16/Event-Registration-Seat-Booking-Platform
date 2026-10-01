# stop-db.ps1 - Stop isolated PostgreSQL 18
$ErrorActionPreference = "Stop"
$pgData = Join-Path $PSScriptRoot "..\.pgdata"
$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"

Write-Host "Stopping PostgreSQL on port 5433..." -ForegroundColor Yellow
Start-Process -FilePath $pgCtl -ArgumentList "-D `"$pgData`" -m fast stop" -NoNewWindow -Wait
Write-Host "PostgreSQL stopped." -ForegroundColor Green
