export function compareCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

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
