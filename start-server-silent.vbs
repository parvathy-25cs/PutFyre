' HRM Portal Server - Silent Background Launcher
' This script starts the Node.js backend without any visible window.
' It is placed in the Windows Startup folder to auto-run at login.

Dim objShell, objFSO, strDir, strCmd

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script lives
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Build the command to run
strCmd = "node """ & strDir & "\server.js"""

' Run silently (0 = hidden window, False = don't wait)
objShell.Run strCmd, 0, False

Set objShell = Nothing
Set objFSO = Nothing
