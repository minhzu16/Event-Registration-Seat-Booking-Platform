# start-db.ps1 - Start isolated PostgreSQL 18 on port 5433
$ErrorActionPreference = "Stop"
$pgData = Join-Path $PSScriptRoot "..\.pgdata"
$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$logFile = Join-Path $pgData "server.log"

Write-Host "Checking PostgreSQL on port 5433..." -ForegroundColor Cyan
try {
    $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "PostgreSQL is already running on port 5433." -ForegroundColor Green
        exit 0
    }
} catch {
    # continue
}

Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Yellow
Start-Process -FilePath $pgCtl -ArgumentList "-D `"$pgData`" -o `"-p 5433`" -l `"$logFile`" start" -NoNewWindow -Wait
Start-Sleep -Seconds 1
Write-Host "PostgreSQL started successfully on port 5433." -ForegroundColor Green
