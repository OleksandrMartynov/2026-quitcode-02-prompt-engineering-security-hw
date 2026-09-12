#!/usr/bin/env bash
# Відтворює ізольоване середовище для прогону 0 (слабкий baseline).
#
# Навіщо: теза завдання «слабкий промпт ваду не знайде» вимірна лише там,
# де середовище не видає відповідь. У самому репозиторії вона просочується
# щонайменше в чотирьох місцях — див. docs/prompt-runs.md, «Проблема baseline».
#
# Використання:  bash scripts/rebuild-baseline.sh [цільовий-каталог]
# Далі:          у свіжій сесії агента з робочим каталогом <ціль>
#                дати рівно один запит: «допоможи з тестами для app»

set -euo pipefail

BASE_COMMIT="da25af6"          # upstream main, до будь-яких наших змін
DEST="${1:-/tmp/ws2-baseline}"
REPO="$(git rev-parse --show-toplevel)"

rm -rf "$DEST"; mkdir -p "$DEST/app/src"

for f in package.json tsconfig.json package-lock.json; do
  git -C "$REPO" show "$BASE_COMMIT:app/$f" > "$DEST/app/$f"
done
for f in quote.ts quote.test.ts; do
  git -C "$REPO" show "$BASE_COMMIT:app/src/$f" > "$DEST/app/src/$f"
done
cp -R "$REPO/app/node_modules" "$DEST/app/node_modules"

# Прибираємо три підказки, які видають відповідь ще до першого запиту
python3 - "$DEST" <<'PY'
import json, pathlib, sys
d = pathlib.Path(sys.argv[1])

q = d / "app/src/quote.ts"
t = q.read_text(encoding="utf-8")
hint = """ *
 * Це навчальний модуль-ціль для промптів з `prompts/`.
 * Він НАВМИСНЕ недосконалий — саме це ви і знайдете добре сформульованим
 * промптом з acceptance criteria (Task A).
"""
if hint in t:
    q.write_text(t.replace(hint, ""), encoding="utf-8")

tst = d / "app/src/quote.test.ts"
t = tst.read_text(encoding="utf-8")
hint2 = """// Базові (happy path) тести. Навмисно неповні — розширення покриття
// це і є ваш перший промпт з cookbook (Task A).

"""
if hint2 in t:
    tst.write_text(t.replace(hint2, ""), encoding="utf-8")

pkg = d / "app/package.json"
j = json.loads(pkg.read_text(encoding="utf-8"))
j["description"] = "Quote calculator"
pkg.write_text(json.dumps(j, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY

echo "Середовище зібрано: $DEST"
echo
echo "Перевірка чистоти (має бути порожньо):"
grep -rniE "навмисно|task a|вада|defect|cookbook|prompts/|ws2" \
  "$DEST/app/src" "$DEST/app/package.json" || echo "  ✅ жодної підказки"
echo
echo "Стартовий стан тестів:"
(cd "$DEST/app" && npx vitest run 2>&1 | grep -E "Tests |Test Files")
