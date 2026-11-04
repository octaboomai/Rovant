#!/usr/bin/env bash
# Rovant — ROS 2 Humble toolchain installer (Ubuntu 22.04)
#
# Invoked by the IDE's "Install / repair" button (GET /rovant/install-stream).
# Non-interactive, idempotent, and safe to re-run.
set -euo pipefail

log()  { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Run privileged commands via sudo only when not already root.
SUDO=()
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO=(sudo)
    else
        die "This installer needs root, or a working sudo."
    fi
fi

# ── 1. Distro check ──────────────────────────────────────────────────────────
if [ -r /etc/os-release ]; then
    # shellcheck source=/dev/null
    . /etc/os-release
else
    die "/etc/os-release not found — unsupported system."
fi

CODENAME="${VERSION_CODENAME:-unknown}"
if [ "$CODENAME" = "jammy" ]; then
    log "Ubuntu 22.04 (jammy) detected."
else
    warn "Expected Ubuntu 22.04 (jammy); found '${CODENAME}'. Continuing anyway."
fi

# ── 2. Base packages ─────────────────────────────────────────────────────────
log "Installing base prerequisites…"
"${SUDO[@]}" apt-get update -y
"${SUDO[@]}" apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg lsb-release software-properties-common

# ── 3. ROS 2 apt repository ──────────────────────────────────────────────────
KEYRING=/usr/share/keyrings/ros-archive-keyring.gpg
if [ ! -f "$KEYRING" ]; then
    log "Adding the ROS 2 apt signing key…"
    TMPKEY="$(mktemp)"
    curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o "$TMPKEY"
    "${SUDO[@]}" gpg --batch --yes --dearmor -o "$KEYRING" "$TMPKEY"
    rm -f "$TMPKEY"
else
    log "ROS 2 apt key already present."
fi

ARCH="$(dpkg --print-architecture)"
REPO_CODENAME="${UBUNTU_CODENAME:-$CODENAME}"
log "Configuring the ROS 2 repository (${REPO_CODENAME}/${ARCH})…"
printf 'deb [arch=%s signed-by=%s] http://packages.ros.org/ros2/ubuntu %s main\n' \
    "$ARCH" "$KEYRING" "$REPO_CODENAME" \
    | "${SUDO[@]}" tee /etc/apt/sources.list.d/ros2.list >/dev/null

# ── 4. ROS 2 Humble ──────────────────────────────────────────────────────────
log "Installing ROS 2 Humble (this is the slow step)…"
"${SUDO[@]}" apt-get update -y
"${SUDO[@]}" apt-get install -y ros-humble-desktop ros-dev-tools

# ── 5. rosdep ────────────────────────────────────────────────────────────────
log "Initialising rosdep…"
"${SUDO[@]}" rosdep init 2>/dev/null || log "rosdep already initialised."
rosdep update || warn "rosdep update failed — 'rosdep install' may not work until it succeeds."

# ── 6. Python packages (incl. debugpy for the Python debugger) ───────────────
log "Installing Python packages (pymavlink, pyulog, numpy, debugpy)…"
if ! pip3 install --user --quiet pymavlink pyulog numpy debugpy; then
    warn "pip install failed — run manually: pip3 install --user pymavlink pyulog numpy debugpy"
fi

# ── 7. Shell integration ─────────────────────────────────────────────────────
BASHRC="$HOME/.bashrc"
if [ -f "$BASHRC" ] && ! grep -q 'ros/humble/setup.bash' "$BASHRC"; then
    log "Adding the ROS 2 setup line to ~/.bashrc…"
    printf '\n# Added by the Rovant toolchain installer\nsource /opt/ros/humble/setup.bash\n' >> "$BASHRC"
fi

log "Done. Open a new terminal, or run: source /opt/ros/humble/setup.bash"
