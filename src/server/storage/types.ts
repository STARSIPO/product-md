import 'server-only'

/**
 * The storage contract.
 *
 * Two visibilities rather than one bucket with ACLs: product photos must be cacheable
 * by a CDN forever, while company documents (registration certificates, bank details)
 * must never be reachable without a fresh signature. Keeping them physically apart
 * means a misconfigured ACL cannot expose a document.
 */

export interface PutObjectInput {
  key: string
  body: Buffer
  contentType: string
  /** private objects are never publicly reachable and require a signed URL */
  visibility: 'public' | 'private'
}

export interface StorageAdapter {
  readonly name: string
  put(input: PutObjectInput): Promise<{ key: string }>
  get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null>
  delete(key: string, visibility: 'public' | 'private'): Promise<void>
  /** Stable public URL. Only valid for visibility: 'public'. */
  publicUrl(key: string): string
  /** Short-lived signed URL for a private object. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>
}
