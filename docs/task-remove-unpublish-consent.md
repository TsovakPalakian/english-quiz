# Снятие согласия перед черновиком

<span style="color: red; font-weight: bold;">WARNING</span> Менять только галочку согласия и остановку перед сохранением опубликованного урока как черновика в просмотре PDF. Остальной импорт, секции, кнопки Apply и Cancel не трогать.

## Шаги

🟩 Убрать с экрана просмотра черновика строку «I agree to unpublish this lesson and save it as a draft until I publish it again.»
🟩 Убрать остановку «Confirm saving the published lesson as a draft.»
🟩 Кнопка «Apply selected sections to draft» на опубликованном уроке идет дальше по прежней цепочке сохранения.

Проверка: `node --test test/test-client-pdf-import.mjs --test-name-pattern "published lesson draft review has no unpublish consent checkbox"`

Arguments: `--test-name-pattern "published lesson draft review has no unpublish consent checkbox"`

Environment: нет.

Строка коммита: Removed the unpublish consent checkbox before saving a published lesson as a draft.
