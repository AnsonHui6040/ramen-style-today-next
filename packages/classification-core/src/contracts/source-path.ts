export function isRepositorySource(value: string) {
  if (!value
    || value.startsWith('/')
    || value.includes('\\')
    || /^[A-Za-z]:/.test(value)
    || hasControlCharacter(value)) {
    return false
  }
  return value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 31 || codePoint === 127
  })
}

export function isStableSource(value: string) {
  if (value.startsWith('runtime://')) {
    const identifier = value.slice('runtime://'.length)
    return identifier.length > 0
      && !identifier.includes('\\')
      && !hasControlCharacter(identifier)
      && identifier.split('/').every((segment) => (
        /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(segment)
      ))
  }
  return isRepositorySource(value)
}
