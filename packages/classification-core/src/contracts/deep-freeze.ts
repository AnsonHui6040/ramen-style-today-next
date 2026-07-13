export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  const seen = new WeakSet<object>()
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    if (!Object.isFrozen(current)) Object.freeze(current)
    for (const child of Object.values(current)) freeze(child)
  }
  freeze(value)
  return value as DeepReadonly<T>
}
