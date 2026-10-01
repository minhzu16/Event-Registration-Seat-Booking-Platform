# run-k6.ps1 - Automate ticket drop load test & verify database integrity
param(
    [string]$ApiBase = "http://localhost:4000",
    [int]$VUs = 100,
    [int]$Iterations = 1000
)

$ErrorActionPreference = "Stop"
Write-Host "=== SeatLock High-Concurrency Ticket Drop Test ===" -ForegroundColor Cyan

# 1. Fetch first available session and hot seats
Write-Host "Fetching live session & seats from $ApiBase..." -ForegroundColor Yellow
$eventsRes = Invoke-RestMethod -Uri "$ApiBase/events" -Method Get
$session = $eventsRes.events[0].sessions[0]
$sessionId = $session.id

$seatsRes = Invoke-RestMethod -Uri "$ApiBase/sessions/$sessionId/seats" -Method Get
$hotSeats = $seatsRes.seats | Select-Object -First 10 | ForEach-Object { $_.id }

$hotSeatsJsonPath = Join-Path $PSScriptRoot "hot-seats.json"
$hotSeats | ConvertTo-Json | Set-Content $hotSeatsJsonPath -Encoding UTF8
Write-Host "Targeted Session: $sessionId" -ForegroundColor Green
Write-Host "Loaded 10 contested hot seats into hot-seats.json" -ForegroundColor Green

# 2. Check if k6 is available
$k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue

if ($k6Cmd) {
    Write-Host "Running k6 load test..." -ForegroundColor Yellow
    $env:API_BASE = $ApiBase
    $env:SESSION_ID = $sessionId
    & k6 run --vus $VUs --iterations $Iterations (Join-Path $PSScriptRoot "ticket-drop.js")
} else {
    Write-Host "k6 binary not found on PATH. Running Node concurrent test runner..." -ForegroundColor Yellow
    $simRes = Invoke-RestMethod -Uri "$ApiBase/admin/simulate/ticket-drop" -Method Post -ContentType "application/json" -Body (@{
        sessionId = $sessionId
        targetSeatIds = $hotSeats
        concurrentRequests = $Iterations
        strategy = "pessimistic"
    } | ConvertTo-Json)

    $errColor = "Green"
    if ($simRes.benchmark.errors500 -gt 0) {
        $errColor = "Red"
    }

    Write-Host "`n--- Benchmark Results ---" -ForegroundColor Cyan
    Write-Host "Total Requests: $($simRes.benchmark.totalRequests)"
    Write-Host "Successful Holds (201): $($simRes.benchmark.successfulHolds)" -ForegroundColor Green
    Write-Host "Safely Rejected Conflicts (409): $($simRes.benchmark.conflicts409)" -ForegroundColor Yellow
    Write-Host "Server Errors (500): $($simRes.benchmark.errors500)" -ForegroundColor $errColor
    Write-Host "Throughput: $($simRes.benchmark.throughputRps) RPS" -ForegroundColor Cyan
    Write-Host "P95 Latency: $($simRes.benchmark.latencyMs.p95) ms" -ForegroundColor Cyan
}

# 3. Automatic SQL Integrity Verification
Write-Host "`nVerifying Database SQL Integrity..." -ForegroundColor Yellow
$integrity = Invoke-RestMethod -Uri "$ApiBase/admin/integrity/$sessionId" -Method Get

if ($integrity.status -eq "PASSED" -and $integrity.totalViolations -eq 0) {
    Write-Host "INTEGRITY CHECK PASSED: 0 Double Bookings, 0 Seat Inconsistencies, 0 Capacity Violations!" -ForegroundColor Green
} else {
    Write-Host "INTEGRITY VIOLATION DETECTED: $($integrity.totalViolations) errors found!" -ForegroundColor Red
    $integrity | ConvertTo-Json -Depth 5 | Write-Host
}
