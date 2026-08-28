@echo off
title CampusEye Attendance System
cd /d "%~dp0"
echo ========================================================
echo   Starting CampusEye Face-Recognition Attendance System
echo   Open in Browser: http://127.0.0.1:5000
echo ========================================================
echo.
.venv\Scripts\python.exe main.py
pause
