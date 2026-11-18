# Подсказка поля Manual Script

> <span style="color: red; font-weight: bold;">WARNING</span>: Не трогать команды, шаблоны, одобрение списка и генерацию урока. Меняется только подсказка поля `#lmScriptInput`.

Утвержденный текст:

```
Paste a lesson script, notes, a dialogue, or a command.
Add words, phrases, and grammar rules, or describe a topic.
The draft includes meanings, example sentences, and practice tasks.
An open lesson keeps its material and skips duplicates.
You review and edit the list before it is added, then you can undo.
```

🟩 Подсказка записана в `site/preview.html`
🟩 Проверка, что пять строк видны в поле

Проверка:

```
node --test test/test-manual-script-placeholder.mjs
```

Arguments: нет

Environment: нет

Commit: Updated the Manual Script field hint to describe the draft actions.
