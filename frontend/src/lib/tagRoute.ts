// Dot segments can change the path, and routers give encoded slashes special treatment.
export function tagHref(tag: string) {
  const hasDotSegment = tag.split('/').some(part => part === '.' || part === '..')
  if (hasDotSegment || tag.includes('%')) return '/tag?' + new URLSearchParams({ tag })
  return '/tag/' + encodeURIComponent(tag)
}

export function tagFromLocation(pathname: string, search: string) {
  // Read the original segment once, including older links containing a literal "%2F".
  const segment = pathname.split('/')[2]
  if (!segment) return new URLSearchParams(search).get('tag')
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}
