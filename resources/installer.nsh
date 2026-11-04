; Rovant — custom NSIS installer pages
; Sets installer colors and adds Python check page

!macro customHeader
  !system "echo 'Building Rovant installer'"
!macroend

!macro customInstall
  ; Desktop shortcut so users can launch Rovant after install
  CreateShortcut "$DESKTOP\Rovant.lnk" "$INSTDIR\Rovant.exe"
  ; Run Python packages setup after install
  ; Invoke PowerShell explicitly: a bare .ps1 runs under the default
  ; execution policy (Restricted on a fresh Windows), which silently blocks it.
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\scripts\install-toolchain-windows.ps1" -Silent'
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$DESKTOP\Rovant.lnk"
  Delete "$DESKTOP\rovant-workspace.lnk"
!macroend
