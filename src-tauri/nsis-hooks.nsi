; NSIS Hooks for Screen Annotator
; This file contains custom NSIS hooks for the installer

!macro NSIS_HOOK_POSTINSTALL
  ; Add to Windows startup (current user)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Screen Annotator" '"$INSTDIR\Screen Annotator.exe"'

  ; Run the application after installation completes
  Exec '"$INSTDIR\Screen Annotator.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Remove from Windows startup on uninstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Screen Annotator"
!macroend
