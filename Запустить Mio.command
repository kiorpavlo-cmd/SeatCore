#!/bin/zsh
MIO_ROOT="${0:A:h}"
MIO_NODE="$(command -v node)"
if [[ -z "$MIO_NODE" ]] || [[ "$("$MIO_NODE" -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
 MIO_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$MIO_NODE" ]]; then
 print "Для запуска нужен Node.js 24 или новее."
 read "MIO_REPLY?Нажмите Enter, чтобы закрыть окно: "
 exit 1
fi
cd "$MIO_ROOT/server" || exit 1
"$MIO_NODE" --env-file-if-exists=.env src/index.js --open
read "MIO_REPLY?Нажмите Enter, чтобы закрыть это окно: "
