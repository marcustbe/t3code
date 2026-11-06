#!/bin/zsh
# Installs the newest release build of Ghost into /Applications and restarts Marcus's copy in the background.
# Agents run inside Ghost, so quitting it kills the agent's shell. The quit, copy and reopen therefore run in a
# detached process (own session, parent = launchd) that survives Ghost quitting. Log: $TMPDIR/ghost-install.log
set -euo pipefail
cd "${0:A:h}"

ZIP=${1:-$(ls -t release/*-arm64.zip | head -1)}
APP=/Applications/Ghost.app
CERT=D3BB67928F8667DBD31F58806C14A22566BF5C6A
STAGE="${TMPDIR:-/tmp}/ghost-install"
LOG="${TMPDIR:-/tmp}/ghost-install.log"

rm -rf "$STAGE"; mkdir -p "$STAGE"
ditto -x -k "$ZIP" "$STAGE"
NEW=$(ls -d "$STAGE"/*.app | head -1)
codesign --force --deep --sign "$CERT" "$NEW"
codesign --verify --deep --strict "$NEW"
echo "Signed $NEW from $ZIP"

cat > "$STAGE/swap.sh" <<EOF
#!/bin/zsh
exec >"$LOG" 2>&1
set -x
if pgrep -f "^$APP/Contents/MacOS/Ghost\$" >/dev/null; then
  osascript -e 'tell application id "com.t3tools.t3code" to quit'
  for i in {1..120}; do pgrep -f "^$APP/Contents/MacOS/" >/dev/null || break; sleep 0.25; done
  pkill -f "^$APP/Contents/MacOS/" || true
  sleep 0.5
fi
rm -rf "${TMPDIR:-/tmp}/Ghost-previous.app"
[[ -d "$APP" ]] && ditto "$APP" "${TMPDIR:-/tmp}/Ghost-previous.app"
ditto "$NEW" "$APP"
env -u ELECTRON_RUN_AS_NODE open -g "$APP"
echo done
EOF

# Double fork + setsid: the swap process leaves Ghost's process tree before Ghost quits.
python3 -c '
import os, sys
if os.fork(): sys.exit(0)
os.setsid()
if os.fork(): os._exit(0)
fd = os.open("/dev/null", os.O_RDWR)
for i in (0, 1, 2): os.dup2(fd, i)
env = {k: v for k, v in os.environ.items() if k != "ELECTRON_RUN_AS_NODE"}
os.execve("/bin/zsh", ["/bin/zsh", sys.argv[1]], env)
' "$STAGE/swap.sh"
echo "Handed off: Ghost quits, updates and reopens in the background (log: $LOG)"
