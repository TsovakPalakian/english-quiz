# Список изменений с коммита `f16a023b`

1. **Аудиоплеер и караоке песен**
   - **Место на UI**: [https://lumiscia.org/#music](https://lumiscia.org/#music), [https://lumiscia.org/#song](https://lumiscia.org/#song)
   - **Изменение**: автопрокрутка текста под текущую позицию звука, индикация прогресса караоке.
   - **Скриншот**:
     ![Караоке-плеер](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/song-word-card-musicword-saas.png)

2. **Очистка действий карточек слов**
   - **Место на UI**: [https://lumiscia.org/#made](https://lumiscia.org/#made), [https://lumiscia.org/#quiz](https://lumiscia.org/#quiz)
   - **Изменение**: удаление дублирующих кнопок добавления в словарь для слов урока.

3. **Формы учетных записей и приглашений**
   - **Место на UI**: [https://lumiscia.org/#admin](https://lumiscia.org/#admin), [https://lumiscia.org/#groupteachers](https://lumiscia.org/#groupteachers)
   - **Изменение**: обновление интерфейса создания инвайтов, сброса паролей и диалогов профиля.
   - **Скриншот**:
     ![Форма инвайтов](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/admin-user-profile-saas.png)

4. **Обогащение грамматических правил Oxford и ручное создание правил**
   - **Место на UI**: [https://lumiscia.org/production/grammar-categories.html](https://lumiscia.org/production/grammar-categories.html)
   - **Изменение**: каталог тем грамматики Oxford, генерация примеров и ручное сохранение правил.
   - **Скриншот**:
     ![Карточки правил грамматики Oxford](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/grammar-rule-chips-preview.png)

5. **Интерактивный редактор слов и правил в черновиках PDF-уроков**
   - **Место на UI**: [https://lumiscia.org/#material](https://lumiscia.org/#material)
   - **Изменение**: модальный редактор черновика PDF с правкой слов, добавлением и удалением правил.
   - **Скриншот**:
     ![Интерактивный редактор черновика PDF](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/pdf-draft-editor-preview.png)

6. **Компактная сетка карточек слов в опубликованных уроках**
   - **Место на UI**: [https://lumiscia.org/#lesson](https://lumiscia.org/#lesson), [https://lumiscia.org/#days](https://lumiscia.org/#days)
   - **Изменение**: автогруппировка последовательных карточек слов в компактную двухколоночную сетку.
   - **Скриншот**:
     ![Компактная сетка карточек слов в уроке](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/compact-word-cards-grid-preview.png)

7. **Вставка блоков уроков в произвольное место и быстрое перемещение к краям**
   - **Место на UI**: [https://lumiscia.org/#material](https://lumiscia.org/#material)
   - **Изменение**: зоны вставки между блоками, пункты Insert above/below в меню, кнопки перемещения на самый верх/низ и подсветка добавленного блока.
   - **Скриншот**:
     ![Кнопки перемещения блока к краям](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/lesson-editor-reorder-buttons.png)

8. **Автоматические повторные попытки публикации ассетов в CI/CD**
   - **Место на UI**: [https://github.com/TsovakPalakian/english-quiz/actions](https://github.com/TsovakPalakian/english-quiz/actions)
   - **Изменение**: 3 повторные попытки выгрузки в Cloudflare при возникновении ошибки 10013.

9. **Защита копирайта от выделения и кликов**
   - **Место на UI**: [https://lumiscia.org/#home](https://lumiscia.org/#home), [https://lumiscia.org/#account](https://lumiscia.org/#account) (нижняя строка подвала)
   - **Изменение**: строка копирайта сделана невыделяемой и некликабельной.

10. **Адаптивные цвета светлых тем оформления**
    - **Место на UI**: [https://lumiscia.org/#themes](https://lumiscia.org/#themes)
    - **Изменение**: динамическая читаемость надписей на светлых фонах через функцию смешивания цвета.
    - **Скриншот**:
      ![Палитра тем оформления](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/theme-gallery-palette-saas.png)

11. **Выравнивание панелей инструментов дня уроков**
    - **Место на UI**: [https://lumiscia.org/#days](https://lumiscia.org/#days)
    - **Изменение**: растяжение панелей по высоте строки и одинаковый радиус скругления углов.

12. **Разделение логотипов книги и звезды**
    - **Место на UI**: левая боковая панель на всех внутренних страницах приложения
    - **Изменение**: возврат оригинальной иконки книги в боковом меню без наложения полигона звезды.

13. **Сворачивание блоков карточки слова**
    - **Место на UI**: [https://lumiscia.org/#made](https://lumiscia.org/#made)
    - **Изменение**: разделы Usages, Phrases, Quiz свернуты в интерактивные раскрывающиеся спойлеры.

14. **Анализ множественного числа и плашка словаря в поиске слов**
    - **Место на UI**: всплывающее окно быстрого поиска слова при выделении текста на страницах платформы
    - **Изменение**: показ исходной формы слова в единственном числе и замена кнопки добавления на бейдж словаря, если слово уже добавлено.

15. **Исключение кнопки Feedback из области созвездий**
    - **Место на UI**: [https://lumiscia.org/#account](https://lumiscia.org/#account), [https://lumiscia.org/#home](https://lumiscia.org/#home) (нижний правый угол)
    - **Изменение**: плавающая кнопка Feedback зарегистрирована как запретная область для линий и звезд созвездия.
    - **Скриншот**:
      ![Кнопка Feedback](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/.user_uploaded/media_1793276669754_2a466d91.png)

16. **Устранение эффекта прямоугольной рамки вокруг Lumiscia**
    - **Место на UI**: [https://lumiscia.org/#account](https://lumiscia.org/#account), [https://lumiscia.org/#home](https://lumiscia.org/#home) (центральный блок)
    - **Изменение**: удален прямоугольный вырез холста, линии созвездий плавно проходят без ступенчатой рамки.
    - **Скриншот**:
      ![Центральный блок Lumiscia](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/.user_uploaded/media_1793276859514_8b05d12c.png)

17. **Компактные карточки инспектора созвездий и звезд**
    - **Место на UI**: [https://lumiscia.org/#account](https://lumiscia.org/#account), [https://lumiscia.org/#home](https://lumiscia.org/#home)
    - **Изменение**: карточки открываются свернутыми только с заголовком и кнопкой more... для раскрытия, карточка размещается вплотную рядом с созвездием или звездой без перекрытия.
    - **Скриншот**:
      ![Инспектор созвездия](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/.user_uploaded/media_1793276449807_adcfc260.png)

18. **Масштабирование созвездий с 6 звездами и менее**
    - **Место на UI**: [https://lumiscia.org/#account](https://lumiscia.org/#account), [https://lumiscia.org/#home](https://lumiscia.org/#home)
    - **Изменение**: ограничение максимального размера до 62% свободного пространства для 40 небольших фигур каталога (в том числе созвездия Dorado).
    - **Скриншот**:
      ![Растянутое созвездие Dorado](/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/.user_uploaded/media_1793277140646_78878aff.png)

19. **Редактирование названий уроков, классов и фраз в черновиках PDF-импорта**
    - **Место на UI**: [https://lumiscia.org/#material](https://lumiscia.org/#material) (импорт PDF)
    - **Изменение**: добавлены интерактивные редакторы для фраз (`phrases`) и классной работы (`classwork`), а также возможность изменения названий урока (`pdf-title`) и класса (`className`).
    - **Файлы**: [client/52b-lesson-pdf-import.js:242-356](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L242-L356).

20. **Автопрокрутка вверх при применении выбранных секций черновика PDF**
    - **Место на UI**: [https://lumiscia.org/#material](https://lumiscia.org/#material) (кнопка Apply selected sections to draft)
    - **Изменение**: перемещение экрана в верхнюю часть страницы после применения секций в черновик урока.
    - **Файлы**: [client/52b-lesson-pdf-import.js:446, 563](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L446).

21. **Универсальная загрузка любых файлов при повторном импорте**
    - **Место на UI**: [https://lumiscia.org/#material](https://lumiscia.org/#material) (кнопка Import another PDF)
    - **Изменение**: добавлена возможность перетаскивания (drag-and-drop) и выбора файлов любого расширения без ограничения форматом `.pdf`.
    - **Файлы**: [site/preview.html:645](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L645).

22. **Коррекция навигационных путей и хлебных крошек грамматики**
    - **Место на UI**: [https://lumiscia.org/#grammar](https://lumiscia.org/#grammar), категории грамматики и правила
    - **Изменение**: замена неактуальных путей с префиксом `Library` на разделы `Grammar` в хлебных крошках и резервной навигации.
    - **Файлы**: [client/00-core.js:260-263](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L260-L263), [production/grammar-categories.html:2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/grammar-categories.html#L2), [production/essential.html:2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/essential.html#L2).

23. **Сворачивание упражнений и квизов карточки слова**
    - **Место на UI**: [https://lumiscia.org/#made](https://lumiscia.org/#made)
    - **Изменение**: группировка упражнений и проверочных карточек в раскрывающиеся элементы `<details>` со свернутым состоянием по умолчанию.
    - **Файлы**: [client/03c-cards.js:318-355](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js#L318-L355).

24. **Устранение ошибок 401 на маршруте /api/grammar/custom для гостевых сессий**
    - **Место на UI**: [https://lumiscia.org/#grammar](https://lumiscia.org/#grammar)
    - **Изменение**: предотвращение неавторизованных повторных сетевых вызовов пользовательских правил грамматики без активной авторизации.
    - **Файлы**: [client/main/main-hooks.js:2316-2342](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L2316-L2342).

25. **Пакетная оптимизация загрузки уроков единым запросом**
    - **Место на UI**: списки уроков платформы
    - **Изменение**: поддержка параметра `ids=` на маршруте `GET /api/lessons` для пакетной отдачи данных в 1 сетевом ответе вместо каскада из 22 отдельных запросов.
    - **Файлы**: [src/learning-legacy-read.mjs:140-145](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-legacy-read.mjs#L140-L145), [src/learning-stage-worker.mjs:319-322](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L319-L322), [src/learning-integrated-worker.mjs:969-974](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L969-L974), [client/main/main-hooks.js:2156-2188](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L2156-L2188).

26. **Дедупликация сетевых запросов при создании экзаменов и экзаменационных блоков**
    - **Место на UI**: [https://lumiscia.org/#exams](https://lumiscia.org/#exams), [https://lumiscia.org/#examblocks](https://lumiscia.org/#examblocks)
    - **Изменение**: внедрение карты базовых слепков `examBaselines` для исключения неизмененных объектов из повторного сохранения, сокращение 7 сетевых запросов до 1.
    - **Файлы**: [client/54-exams.js:8-144](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L8-L144).

27. **Своевременное отображение кнопки копирования экзаменов и блоков**
    - **Место на UI**: [https://lumiscia.org/#exams](https://lumiscia.org/#exams), [https://lumiscia.org/#examblocks](https://lumiscia.org/#examblocks)
    - **Изменение**: немедленный вызов отрисовки интерфейса после фиксации постоянного числового идентификатора сервером, отображение кнопки копирования без задержки.
    - **Файлы**: [client/54-exams.js:104-120](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L104-L120).

28. **Устранение ошибки «Material not found» при удалении экзаменационных блоков**
    - **Место на UI**: [https://lumiscia.org/#examblocks](https://lumiscia.org/#examblocks)
    - **Изменение**: определение актуального числового идентификатора; удаление несохраненных на сервере блоков локально без отправки некорректных запросов в `/api/archive`.
    - **Файлы**: [client/54-exams.js:988-1006](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L988-L1006).

29. **Подавление ложных сообщений об ошибках при фоновом обновлении кэша Speakout**
    - **Место на UI**: фоновый опрос кэша
    - **Изменение**: передача параметра `quietBug: true` при опросе версий кэша для исключения ложных записей в `/api/bugs`.
    - **Файлы**: [client/main/main-hooks.js:1581](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L1581).
