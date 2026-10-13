#!/bin/zsh
EATAPP_ROOT="${0:A:h}"
EATAPP_NODE="$(command -v node)"
if [[ -z "$EATAPP_NODE" ]] || [[ "$("$EATAPP_NODE" -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
 EATAPP_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$EATAPP_NODE" ]]; then
 print "Для запуска нужен Node.js 24 или новее."
 read "EATAPP_REPLY?Нажмите Enter, чтобы закрыть окно: "
 exit 1
fi
cd "$EATAPP_ROOT/server" || exit 1
"$EATAPP_NODE" --env-file-if-exists=.env src/index.js --open
read "EATAPP_REPLY?Нажмите Enter, чтобы закрыть это окно: "
