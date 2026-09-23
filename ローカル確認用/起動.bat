@echo off
chcp 65001 >nul
powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
