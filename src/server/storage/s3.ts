import 'server-only'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/env'
import type { PutObjectInput, StorageAdapter } from '@/server/storage/types'

/**
 * S3-compatible storage: AWS S3, MinIO, Cloudflare R2, Backblaze B2.
 *
 * Two buckets, not two prefixes. The public bucket can be fronted by a CDN and left
 * world-readable; the private one stays closed and is only ever reached through a
 * presigned GET. A single bucket with per-object ACLs is one wrong default away from
 * publishing somebody's registration certificate.
 */

let client: S3Client | null = null

/**
 * Built on first use, not at module load: importing this file must stay free of side
 * effects so that a deployment running STORAGE_DRIVER="local" never needs S3 credentials
 * (and never opens sockets it will not use).
 */
function s3(): S3Client {
  if (client) return client

  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT && env.S3_ENDPOINT.length > 0 ? env.S3_ENDPOINT : undefined,
    // MinIO and most self-hosted gateways only speak path style.
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: required('S3_ACCESS_KEY_ID', env.S3_ACCESS_KEY_ID),
      secretAccessKey: required('S3_SECRET_ACCESS_KEY', env.S3_SECRET_ACCESS_KEY),
    },
  })

  return client
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required when STORAGE_DRIVER="s3".`)
  return value
}

function bucketFor(visibility: 'public' | 'private'): string {
  return visibility === 'public'
    ? required('S3_BUCKET_PUBLIC', env.S3_BUCKET_PUBLIC)
    : required('S3_BUCKET_PRIVATE', env.S3_BUCKET_PRIVATE)
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function isMissingObject(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'NoSuchKey' || error.name === 'NotFound') return true
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return status === 404
}

export class S3StorageAdapter implements StorageAdapter {
  readonly name = 's3'

  async put(input: PutObjectInput): Promise<{ key: string }> {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucketFor(input.visibility),
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        // Immutable: keys contain a random token, so a given key is never overwritten.
        CacheControl:
          input.visibility === 'public'
            ? 'public, max-age=31536000, immutable'
            : 'private, no-store',
      }),
    )
    return { key: input.key }
  }

  async get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null> {
    try {
      const response = await s3().send(
        new GetObjectCommand({ Bucket: bucketFor(visibility), Key: key }),
      )
      if (!response.Body) return null
      return Buffer.from(await response.Body.transformToByteArray())
    } catch (error) {
      if (isMissingObject(error)) return null
      throw error
    }
  }

  async delete(key: string, visibility: 'public' | 'private'): Promise<void> {
    await s3().send(new DeleteObjectCommand({ Bucket: bucketFor(visibility), Key: key }))
  }

  publicUrl(key: string): string {
    const base = env.S3_PUBLIC_BASE_URL?.trim()
    if (base) return `${trimSlashes(base)}/${key}`

    // No CDN domain configured — address the bucket directly on its endpoint.
    const endpoint = env.S3_ENDPOINT?.trim()
    if (!endpoint) {
      throw new Error(
        'Set S3_PUBLIC_BASE_URL (CDN domain) or S3_ENDPOINT to build public object URLs.',
      )
    }

    const bucket = bucketFor('public')
    const root = trimSlashes(endpoint)
    if (env.S3_FORCE_PATH_STYLE) return `${root}/${bucket}/${key}`
    return `${root.replace('://', `://${bucket}.`)}/${key}`
  }

  signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucketFor('private'), Key: key }), {
      expiresIn: Math.max(1, Math.floor(expiresInSeconds)),
    })
  }
}
