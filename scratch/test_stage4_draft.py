import re

text = """
Этап 3 успешно завершен и полностью верифицирован (172 теста npm run check пройдены без ошибок, скриншот lumiscia-dashboard-stage3.png зафиксирован в артефактах).

Commit message:
Implemented Lumiscia SaaS dashboard hero ring and warmup widgets

Команда для фиксации изменений Этапа 3:
git add docs/zero-compression-codebase-audit.md site/preview.html && git commit -m "Implemented Lumiscia SaaS dashboard hero ring and warmup widgets"

---

### Текущий статус дорожной карты миграции (7 этапов):
- 🟩 Этап 1: Архитектурный каркас Lumiscia SaaS (Сайдбар + Топбар) — завершен
- 🟩 Этап 2: Студия музыки и караоке (#music, #song) — завершен
- 🟩 Этап 3: Сводный дашборд студента и преподавателя (#home) — завершен
- 🟨 Этап 4: Разделы CRM и управления группами (#admin, #groups) — выбран к исполнению
- ⬜ Этап 5: Учебные материалы и центр экзаменационного контроля (#days, #exams) — ожидает
- ⬜ Этап 6: Студия словаря и грамматика (#allwords, #tenses) — ожидает
- ⬜ Этап 7: Чат, воркбенч, настройки и логи (#messages, #workbench, #settings, #bugs) — ожидает

---

### Понимание задач Этапа 4 (CRM и управление группами):
1. Оформить раздел `#admin` (Accounts CRM) в соответствии с макетом site/saas-showcase.html: строки 3416-3520: карточный контейнер saas-card, современное отображение вкладок accounts-tabs с сохранением всех пяти дата-атрибутов (accounts, requests, invite, groups, history), стилизация инпутов поиска и формы генерации разовых инвайтов с QR-кодом.
2. Оформить раздел `#groups` (Classes & Groups Directory) в соответствии с макетом site/saas-showcase.html: строки 3886-3980: фильтрационные плашки уровней CEFR (A1, A2, B1, B2, unassigned), трехколоночная сетка #groupList > .decks со стилизацией карточек учебных групп.
3. Стилизовать дочерние экраны управления составом групп (#groupdetail, #groupteachers, #groupstudents, #admingroup, #adminuser): двухколоночные досье участников, бейджи ролей (Student, Teacher, Admin), диагностическую панель тепловой карты #groupDetailDiagnostic.
4. Сохранить в неизменном виде все программные селекторы, атрибуты данных и логику изолированного доступа преподавателей и кураторов для полного прохождения тестовых наборов test-accounts-invite-ui.mjs, test-multi-teacher-topology-ui.mjs, test-role-navigation-ui.mjs, test-teacher-group-isolation-ui.mjs.

Затронутые экраны и файлы:
- site/preview.html (#admin, #groups, #groupdetail, #groupteachers, #groupstudents, #admingroup, #adminuser)
- site/preview.css (.accounts-tabs, #adminBody, #groupList, .group-detail-destinations)
- docs/zero-compression-codebase-audit.md

Начать реализацию Этапа 4?
"""

banned_ru = [
    'и другие', 'например', 'основные', 'включая', 'и так далее', 'и т.д.',
    'ключевые', 'типичные', 'в основном', 'ряд других'
]
banned_en = [
    'etc.', 'for example', 'such as', 'mainly', 'key features', 'among others', 'and so on'
]

found = []
for word in banned_ru + banned_en:
    if re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE):
        found.append(word)

if found:
    print("FAILED, found:", found)
else:
    print("PASSED, 0 banned tokens found.")
