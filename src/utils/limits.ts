export function boundedLimit(
  value: unknown,
  options: {
    defaultValue: number;
    max: number;
  }
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return options.defaultValue;
  }

  return Math.min(
    Math.max(Math.trunc(parsed), 1),
    options.max
  );
}
