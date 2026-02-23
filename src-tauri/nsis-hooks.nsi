; NSIS Hooks for Screen Annotator
; This file contains custom NSIS hooks for the installer

!macro NSIS_HOOK_POSTINSTALL
  ; Run the application after installation completes
  Exec '"$INSTDIR\Screen Annotator.exe"'
!macroend
