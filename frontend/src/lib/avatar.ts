import defaultAvatar from '../official/default-avatar.svg?no-inline'

export function avatar(image: string | null | undefined): string {
  if (image) {
    try {
      const url = new URL(image)
      if (url.protocol === 'https:' || url.protocol === 'http:') return image
    } catch {
      // A missing or unsupported image uses the bundled RealWorld avatar.
    }
  }
  return defaultAvatar
}
