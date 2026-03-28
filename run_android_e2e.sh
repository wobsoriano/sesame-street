#!/bin/bash
set -e

APP_ID="${1:?Usage: run_android_e2e.sh <app_id>}"
MAX_RETRIES=3
DELAYS=(0 20 60)

for i in $(seq 1 $MAX_RETRIES); do
  echo "=== Attempt $i of $MAX_RETRIES ==="

  if [ "${DELAYS[$i-1]}" -gt 0 ]; then
    echo "Waiting ${DELAYS[$i-1]}s before retry..."
    sleep "${DELAYS[$i-1]}"
  fi

  set +e
  $HOME/.maestro/bin/maestro test .maestro/ \
    --env=APP_ID="$APP_ID" \
    --format=junit \
    --output "report_attempt_${i}.xml"
  EXIT_CODE=$?
  set -e

  adb shell screencap -p "/sdcard/screenshot_attempt_${i}.png"
  adb pull "/sdcard/screenshot_attempt_${i}.png" "screenshot_attempt_${i}.png" 2>/dev/null || true

  if [ $EXIT_CODE -eq 0 ]; then
    echo "=== Tests passed on attempt $i ==="
    exit 0
  fi

  echo "=== Attempt $i failed (exit code $EXIT_CODE) ==="
done

echo "=== All $MAX_RETRIES attempts failed ==="
exit 1
