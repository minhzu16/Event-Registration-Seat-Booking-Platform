# restore-db.ps1 - Restore PostgreSQL Database from Backup
param(
    [string]$BackupFilePath
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

if (-not $BackupFilePath) {
    # Default to latest file in backups directory
    $backupDir = Join-Path $PSScriptRoot "backups"
    $latestBackup = Get-ChildItem -Path $backupDir -Filter "*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latestBackup) {
        Write-Error "No backup files found in $backupDir. Please provide a path with -BackupFilePath."
        exit 1
    }
    $BackupFilePath = $latestBackup.FullName
}

Write-Host "Restoring database event_platform from $BackupFilePath..." -ForegroundColor Yellow
& $psql -h 127.0.0.1 -p 5433 -U postgres -d event_platform -f $BackupFilePath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Database restored successfully!" -ForegroundColor Green
} else {
    Write-Host "Database restore failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
