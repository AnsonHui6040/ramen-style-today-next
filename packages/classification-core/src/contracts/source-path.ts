export function isRepositorySource(value: string) {
  if (!value || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value)) {
    return false
  }
  return value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

export function isStableSource(value: string) {
  if (value.startsWith('runtime://')) {
    const identifier = value.slice('runtime://'.length)
    return identifier.length > 0 && !identifier.includes('\\')
  }
  return isRepositorySource(value)
}
