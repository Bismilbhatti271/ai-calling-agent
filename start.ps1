param(
    [switch]$NoTTS,
    [switch]$NoFrontend,
    [switch]$NoBackend,
    [switch]$NoAGI,
    [switch]$VICIdialAGI
)

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Empire-X Platform Launcher" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot
$pids = @()

function Start-ProcessAndTrack {
    param($Name, $Command, $WorkDir)
    Write-Host "[Starting] $Name..." -ForegroundColor Yellow
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell"
    $psi.Arguments = "-NoExit -Command `"$Command`""
    $psi.WorkingDirectory = $WorkDir
    $psi.UseShellExecute = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
    $proc = [System.Diagnostics.Process]::Start($psi)
    $pids += @{ Name = $Name; PID = $proc.Id }
    Write-Host "  [OK] $Name started (PID: $($proc.Id))" -ForegroundColor Green
    return $proc
}

function Start-ProcessBackground {
    param($Name, $Command, $WorkDir)
    Write-Host "[Starting] $Name..." -ForegroundColor Yellow
    $job = Start-Job -ScriptBlock {
        param($cmd, $dir)
        Set-Location $dir
        Invoke-Expression $cmd
    } -ArgumentList $Command, $WorkDir
    Write-Host "  [OK] $Name started (Job: $($job.Id))" -ForegroundColor Green
    return $job
}

# ============================================
# 1. TTS Server (port 8000)
# ============================================
if (-not $NoTTS) {
    Write-Host ">> TTS Server (edge-tts on port 8000)" -ForegroundColor Cyan
    $ttsJob = Start-ProcessBackground -Name "TTS Server" -Command "python backend/tts_server.py" -WorkDir $rootDir
    Start-Sleep -Seconds 2
}

# ============================================
# 2. Backend API (port 8002)
# ============================================
if (-not $NoBackend) {
    Write-Host ">> Backend API (FastAPI on port 8002)" -ForegroundColor Cyan
    Start-ProcessAndTrack -Name "Backend API" -Command "uvicorn main:app --reload --port 8002" -WorkDir (Join-Path $rootDir "backend")
    Start-Sleep -Seconds 3
}

# ============================================
# 3. FastAGI Server (port 4573 — VICIdial integration)
# ============================================
if ($VICIdialAGI -or (-not $NoAGI)) {
    $agiEnabled = $VICIdialAGI -or (Test-Path (Join-Path $rootDir "backend\agi_handler.py"))
    if ($agiEnabled) {
        Write-Host ">> FastAGI Server (VICIdial bridge on port 4573)" -ForegroundColor Cyan
        Start-ProcessBackground -Name "FastAGI Server" -Command "python backend/agi_handler.py --mode fastagi" -WorkDir $rootDir
        Start-Sleep -Seconds 1
    }
}

# ============================================
# 4. Frontend (port 3000)
# ============================================
if (-not $NoFrontend) {
    Write-Host ">> Frontend (Next.js on port 3000)" -ForegroundColor Cyan
    Start-ProcessAndTrack -Name "Frontend" -Command "npm run dev" -WorkDir $rootDir
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  All services launched!" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend : http://localhost:3000" -ForegroundColor Green
Write-Host "  Backend  : http://localhost:8002/api/health" -ForegroundColor Green
Write-Host "  TTS API  : http://localhost:8000/tts" -ForegroundColor Green
Write-Host "  AGI      : port 4573 (VICIdial)" -ForegroundColor Green
Write-Host ""
Write-Host "  VICIdial Integration: http://localhost:3000/vicidial" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Close the terminal windows to stop services." -ForegroundColor Gray
Write-Host "  Or press Ctrl+C in each window." -ForegroundColor Gray
Write-Host ""

# Keep the launcher alive
Write-Host "Press any key to stop all services..." -ForegroundColor Magenta
$null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Write-Host "Shutting down..." -ForegroundColor Yellow

# Kill all tracked processes
Get-Job | Stop-Job | Remove-Job
