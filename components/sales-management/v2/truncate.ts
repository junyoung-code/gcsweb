// Only shorten the display value; editing and accessible labels retain the original.
export function truncate(value: string, limit: number) {
  const characters = Array.from(value);
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : value;
}
