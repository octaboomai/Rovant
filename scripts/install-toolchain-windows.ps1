# Rovant — Windows Toolchain Setup
# Runs on first install and from Tools > Setup Toolchain
param([switch]$Silent)

function Log  { Write-Host "[Rovant] $args" -ForegroundColor Cyan }
function Ok   { Write-Host " [OK] $args" -ForegroundColor Green }
function Warn { Write-Host " [!]  $args" -ForegroundColor Yellow }
function Err  { Write-Host " [X]  $args" -ForegroundColor Red }

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Err "winget (App Installer) is not available on this machine."
    Warn "Install 'App Installer' from the Microsoft Store, then re-run: ROS 2 > Toolchain Setup."
    Warn "Manual: Git from git-scm.com, Python 3.11 from python.org, WSL2 from the Microsoft docs."
    exit 1
}
$wingetVersion = (winget --version) 2>$null
Log "winget found: $wingetVersion"

Log "Rovant Toolchain Setup for Windows"
Log "This sets up all tools needed for ROS 2 development."

# ── Git ──────────────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Log "Installing Git..."
    winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
    Ok "Git installed"
} else { Ok "Git: $(git --version)" }

# ── Python 3.11 ──────────────────────────────────────────────────────────────
$pyCmd = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $pyCmd) { $pyCmd = Get-Command python -ErrorAction SilentlyContinue }
if (-not $pyCmd) {
    Log "Installing Python 3.11..."
    winget install --id Python.Python.3.11 -e --silent --accept-source-agreements --accept-package-agreements
    $env:PATH += ";$env:LOCALAPPDATA\Programs\Python\Python311;$env:LOCALAPPDATA\Programs\Python\Python311\Scripts"
    Ok "Python 3.11 installed"
} else { Ok "Python: $($pyCmd.Source)" }

# ── FIX #6: Python packages with --break-system-packages ─────────────────────
Log "Installing Python packages (pymavlink, pyulog, numpy, debugpy)..."
$pipArgs = @("install", "pymavlink", "pyulog", "numpy", "debugpy", "-q")
$result = & python -m pip $pipArgs "--break-system-packages" 2>&1
if ($LASTEXITCODE -ne 0) {
    # Retry without the flag (older Python)
    $result = & python -m pip $pipArgs 2>&1
}
if ($LASTEXITCODE -eq 0) { Ok "Python packages installed" }
else { Warn "pip install failed — manual install needed: pip install pymavlink pyulog numpy debugpy" }

# ── CMake ────────────────────────────────────────────────────────────────────
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    Log "Installing CMake..."
    winget install --id Kitware.CMake -e --silent --accept-source-agreements --accept-package-agreements
    Ok "CMake installed"
} else { Ok "CMake found" }

# ── WSL2 + ROS 2 Humble ──────────────────────────────────────────────────────
Log "Checking WSL2 for ROS 2..."
$wslStatus = wsl --status 2>&1
$wslOk = $wslStatus -match "Default Distribution"

if ($wslOk) {
    # FIX: Proper WSL2 ROS detection
    $rosFound = wsl -- bash -c "test -f /opt/ros/humble/setup.bash && echo yes || echo no" 2>&1
    if ($rosFound -eq "yes") {
        $rosVer = wsl -- bash -c "source /opt/ros/humble/setup.bash && ros2 --version 2>&1" 2>&1
        Ok "ROS 2 Humble found in WSL2: $rosVer"
    } else {
        Warn "WSL2 found but ROS 2 Humble not installed."
        Log "Installing ROS 2 Humble in WSL2..."
        wsl -- bash -c @"
sudo apt-get update && sudo apt-get install -y curl gnupg2 lsb-release
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu jammy main' | sudo tee /etc/apt/sources.list.d/ros2.list
sudo apt-get update && sudo apt-get install -y ros-humble-ros-base python3-colcon-common-extensions
echo 'source /opt/ros/humble/setup.bash' >> ~/.bashrc
"@
        if ($LASTEXITCODE -eq 0) { Ok "ROS 2 Humble installed in WSL2" }
        else { Warn "ROS 2 install failed — try: wsl and follow https://docs.ros.org/en/humble/Installation.html" }
    }
} else {
    Warn "WSL2 not found. ROS 2 on Windows requires WSL2."
    Log "Installing WSL2..."
    try {
        wsl --install --no-launch
        Ok "WSL2 installed — restart your PC, then rerun this setup"
    } catch {
        Warn "Run in PowerShell as Admin: wsl --install"
    }
}

Log "Setup complete. Launch Rovant from the Start Menu."
if (-not $Silent) { Read-Host "Press Enter to close" }
