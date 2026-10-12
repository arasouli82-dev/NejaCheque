@echo off
rem Neja Cheque on Windows: creates a virtual environment on first run, then starts the server.
cd /d "%~dp0"
if not exist .venv (
  echo Creating virtual environment...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)
if "%PORT%"=="" set PORT=8080
echo Neja Cheque: http://localhost:%PORT%
.venv\Scripts\python.exe -m uvicorn nejacheque.app:app --host 0.0.0.0 --port %PORT%
