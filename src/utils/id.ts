/** Generate a unique ID using crypto.randomUUID() */
export function generateId(): string {
  return crypto.randomUUID();
}
