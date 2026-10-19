#!/usr/bin/env bash
# Stop-хук: быстрые проверки перед завершением хода (typecheck + lint).
# При ошибке — код 2: вывод уходит Claude, и он правит. Повторный вызов (stop_hook_active) пропускаем, чтобы не зациклиться.
cd "$CLAUDE_PROJECT_DIR" || exit 0

input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

# нет правок кода/стилей/дел — проверять нечего
git status --porcelain | grep -qE '\.(ts|tsx|css|json)$' || exit 0

out=$( { pnpm typecheck && pnpm lint; } 2>&1) || {
  printf 'Проверки Stop-хука не прошли (pnpm typecheck && pnpm lint):\n%s\n' "$out" >&2
  exit 2
}
exit 0
