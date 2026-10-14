/** «Иванов Иван Иванович» → «Иванов И. И.» (для шапки). */
export function shortName(full: string): string {
  const [last, first, middle] = full.trim().split(/\s+/);
  return [last, first && `${first[0]}.`, middle && `${middle[0]}.`].filter(Boolean).join(" ");
}

/** «Иванов Иван» → «ИИ» (для аватара). */
export function initials(full: string): string {
  return full
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
