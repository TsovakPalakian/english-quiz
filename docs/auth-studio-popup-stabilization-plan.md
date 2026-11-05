# План стабилизации перехвата всплывающего окна в Auth Studio (Auth Studio Popup Stabilization)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать астрономические координаты каталога, расчет проекций, анимацию фаз неба, карточки инспектора звёзд, форму входа, профиль пользователя и несвязанные тесты. Изменения строго ограничены штрафом перекрытия подписи созвездия карточкой инспектора в `client/06-auth-sky.js` и синхронизацией ожидания открытия окна через контекст браузера в `test/test-auth-studio-ui.mjs`.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Файл и строки сбоя**: [`test/test-auth-studio-ui.mjs#L70-L72`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-auth-studio-ui.mjs#L70-L72)
- **Суть сбоя**:
  1. В шаге `06. waitForEvent` выполняется `const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);`.
  2. В окружении CI на GitHub Actions runner под параллельной нагрузкой Chromium запускает целевой URL `https://www.go-astronomy.com/...` в отдельном изолированном процессе (Site Isolation) без передачи дескриптора `opener` (`rel="noopener noreferrer"` в [`client/06-auth-sky.js#L10`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L10)).
  3. При отсутствии связи `opener` событие создания вкладки доставляется на уровне контекста браузера (`browserContext.on('page')`), а событие `page.on('popup')` на изолированной странице не инициируется, что вызывает превышение лимита ожидания 30000 мс (`Timeout 30000ms exceeded while waiting for event "popup"`).
  4. Одновременно в [`client/06-auth-sky.js#L520`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L520) штраф за наложение карточки `conInspector` на прямоугольник подписи `r` составляет `80000`, что меньше штрафа за пересечение линий созвездия (`100000`) и звёзд (`200000`), допуская частичное перекрытие подписи инспектором при наведении курсора.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/06-auth-sky.js#L520`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L520): увеличение веса штрафа наложения карточки инспектора созвездия на активирующий заголовок до `1000000` единиц, исключающее перекрытие ссылки инспектором.
  - [`test/test-auth-studio-ui.mjs#L71`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-auth-studio-ui.mjs#L71): ожидание открытия страницы через параллельный перехват `Promise.race([page.waitForEvent('popup'), page.context().waitForEvent('page')])`.
  - Производные файлы сборки: [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и производные артефакты `rollback/production-assets/`.
- **Инварианты**:
  - Сохранение полной функциональности карточки созвездия при наведении курсора мыши.
  - Сохранение перехода по внешней ссылке на Go-Astronomy в новой вкладке с атрибутами `target="_blank"` и `rel="noopener noreferrer"`.
  - Сохранение проверки загрузки целевого URL `assert.equal(popup.url(), url)`.
  - Сохранение изоляции всех 79 подтестов сценария `auth-studio-ui`.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
3. Запуск целевого теста: `CHECK_MODE=ci node --test test/test-auth-studio-ui.mjs`.
4. Запуск смежного теста инспектора: `CHECK_MODE=ci node --test test/test-star-inspector-ui.mjs`.
5. Проверка отсутствия артефактов в рабочем дереве `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟩` Увеличить вес штрафа наложения карточки созвездия на заголовок до `1000000` в [`client/06-auth-sky.js#L520`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L520).
- `🟩` Обновить перехват создания страницы в [`test/test-auth-studio-ui.mjs#L71`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-auth-studio-ui.mjs#L71) на `Promise.race([page.waitForEvent('popup'), page.context().waitForEvent('page')])`.
- `🟩` Выполнить `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- `🟩` Верифицировать успешное прохождение `test/test-auth-studio-ui.mjs` (79 из 79 подтестов) и `test/test-star-inspector-ui.mjs`.
