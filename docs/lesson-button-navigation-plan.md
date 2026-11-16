# План перехода на страницу урока при нажатии на кнопку в каталоге Speakout

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче перехода на страницу урока. Задача строго и изолированно затрагивает обработку клика по кнопке урока [client/03-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03-core.js#L83-L87), разметку карточки урока [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L503) и отображение интерактивной страницы урока Speakout Studio на экране `#speakouteditor` [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L141-L151). Весь остальной функционал платформы остается неизменным.

---

## 1. Точная причина поведения на скриншоте пользователя

1. На присланном скриншоте отображен список уроков юнита 1 (**Шаблон 3**): `1 Welcome!`, `A1 · 4 lessons`, `Search Speakout` и кнопка `1A Hello`.
2. Пользователь нажимает на кнопку `1A Hello`, ожидая попасть на утвержденную страницу интерактивного урока (**Шаблон 4**: рабочая область с оригинальным учебником Pearson Student's Book, навигацией страниц, аудиодорожками, ключами и плеером).
3. На удаленном сервере `https://lumiscia.org` изменения еще не были задеплоены через CI (так как коммит и пуш выполняет исключительно пользователь согласно регламенту безопасности). Поэтому на сервере открывался старый экран блочного редактора со свернутыми полосами CMS.
4. В локальной кодовой базе в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L145-L151) уже реализовано монтирование интерактивной студии Speakout Studio (**Шаблон 4** для 1A и **Шаблон 7** для 1D) прямо в экран `#speakouteditor` при клике на кнопку урока.
5. Для обеспечения надежного перехода на страницу урока:
   - При клике на `[data-speak-lesson]` для уроков 1A и 1D уровня A1 экран `#speakouteditor` гарантированно открывает утвержденную страницу урока Speakout Studio (Шаблон 4 / 7) на всю высоту экрана.
   - В карточке урока в каталоге ([client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L503)) также добавляется прямая ссылка-бейдж на полноэкранную страницу студии `/speakout/index.html?lesson=1A` (и `1D`).

---

## 2. Чек-лист реализации

- 🟩 **Этап 1**: Проверка интеграции монтирования страницы урока (Шаблон 4) в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js)
- 🟩 **Этап 2**: Обновление версии модуля редактора `v=20261116-v1` в [client/main/main-hooks.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js) и [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js) для исключения кэширования старого скрипта
- 🟩 **Этап 3**: Локальная компиляция продакшен-ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`
- 🟩 **Этап 4**: Верификация всех 113 проверок [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs) и 70 целевых проверок `speakout/tests/`
