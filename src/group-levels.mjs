export const GROUP_LEVELS = ['A1','A2','A2+','B1','B1+','B2','B2+','C1','C2'];

export function groupLevel(title) {
  const name = String(title || '').trim();
  return GROUP_LEVELS.find(level => name === level || name.startsWith(level + ' ') || name.endsWith(' ' + level)) || null;
}

export function normalizedGroupTitle(title) {
  const name = String(title || '').trim(), level = groupLevel(name);
  if (!level) return name;
  if (name === level) return level + ' Group';
  return name.startsWith(level + ' ') ? name : level + ' ' + name.slice(0, -(level.length + 1)).trim();
}

export function prefixedExamTitle(title, groupTitle) {
  const level = groupLevel(groupTitle), name = String(title || '').trim();
  if (!level) return name;
  const previous = groupLevel(name);
  const suffix = previous ? (name === previous ? 'Exam' : name.startsWith(previous + ' ') ? name.slice(previous.length + 1) : name.slice(0, -(previous.length + 1))) : name;
  return (level + ' ' + (suffix || 'Exam')).slice(0,120);
}
