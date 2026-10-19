export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/** "order-items" / "order_items" / "OrderItems" → "orderItems" */
export function toCamelCase(str: string): string {
  const kebab = toKebabCase(str)
  return kebab.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/** "order-items" → "OrderItems" */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}
