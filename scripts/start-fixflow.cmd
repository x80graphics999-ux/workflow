@echo off
rem Starts FixFlow in production mode and appends its output to logs\fixflow.log.
rem Used by the Windows Task Scheduler entry described in docs\LAN-SETUP.md.
rem Run "npm run build" first whenever the client code changes.

cd /d "%~dp0.."
if not exist logs mkdir logs
echo. >> logs\fixflow.log
echo ===== Starting FixFlow %date% %time% ===== >> logs\fixflow.log
call npm start >> logs\fixflow.log 2>&1
