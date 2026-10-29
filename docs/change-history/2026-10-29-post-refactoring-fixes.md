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
