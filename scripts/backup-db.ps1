# backup-db.ps1 - Automated PostgreSQL Database Backup
$ErrorActionPreference = "Stop"

$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$backupDir = Join-Path $PSScriptRoot "backups"
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $backupDir "event_platform-$timestamp.sql"

Write-Host "Creating backup of event_platform database to $backupFile..." -ForegroundColor Cyan
& $pgDump -h 127.0.0.1 -p 5433 -U postgres -d event_platform -f $backupFile --clean --if-exists

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $backupFile).Length
    Write-Host "Backup completed successfully! ($([math]::Round($size / 1KB, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "Backup failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
