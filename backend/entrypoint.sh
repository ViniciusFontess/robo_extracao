#!/bin/bash
set -e

# Start Xvfb virtual display in background
Xvfb :99 -screen 0 1280x960x24 -nolisten tcp &
export DISPLAY=:99

# Give Xvfb 2 seconds to initialize
sleep 2

# Launch uvicorn
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
