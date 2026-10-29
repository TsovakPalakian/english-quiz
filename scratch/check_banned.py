import re
import sys

BANNED_RU = [
    r'и другие',
    r'например',
    r'основные',
    r'включая',
    r'и так далее',
    r'и т\.д\.',
    r'ключевые',
    r'типичные',
    r'в основном',
    r'ряд других',
]

BANNED_EN = [
    r'\betc\b',
    r'\bfor example\b',
    r'\bsuch as\b',
    r'\bmainly\b',
    r'\bkey features\b',
    r'\bamong others\b',
    r'\band so on\b',
]

def check(text):
    errors = []
    for pattern in BANNED_RU:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            errors.append(f"Forbidden RU match: '{pattern}' found {len(matches)} time(s): {matches}")
    for pattern in BANNED_EN:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            errors.append(f"Forbidden EN match: '{pattern}' found {len(matches)} time(s): {matches}")
    return errors

if __name__ == '__main__':
    content = sys.stdin.read()
    errs = check(content)
    if errs:
        for e in errs:
            print("ERROR:", e)
        sys.exit(1)
    print("OK: 0 banned words detected.")
