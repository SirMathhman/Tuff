@echo off
REM Pre-commit hook for Windows (batch wrapper)
REM Calls the PowerShell pre-commit script

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pre-commit.ps1"
exit /b %ERRORLEVEL%
