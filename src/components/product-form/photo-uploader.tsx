'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react'

import { Alert, Button } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { PhotoDraft } from './product-wizard'

/**
 * Photo upload and ordering.
 *
 * Files go to the server the moment they are chosen, so the seller sees a real
 * thumbnail and a real progress bar instead of a form that appears to hang on submit,
 * and the listing itself only ever carries storage keys.
 *
 * Order is meaning: the first photo is the cover that shows in the catalogue. It can be
 * changed by dragging, and — because dragging is not available to a keyboard or a
 * screen reader, and is awkward on a phone — by explicit up/down buttons that do
 * exactly the same thing.
 */

interface UploadTask {
  id: number
  name: string
  progress: number
}

interface UploadFailure {
  key: string
  params?: Record<string, string | number>
}

function isUploadedPhoto(value: unknown): value is { key: string; url: string } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { key?: unknown; url?: unknown }
  return typeof record.key === 'string' && typeof record.url === 'string'
}

function toFailure(value: unknown): UploadFailure {
  if (typeof value === 'object' && value !== null) {
    const record = value as { error?: unknown; params?: unknown }
    if (typeof record.error === 'string') {
      const params =
        typeof record.params === 'object' && record.params !== null
          ? (record.params as Record<string, string | number>)
          : undefined
      return { key: record.error, params }
    }
  }
  return { key: 'generic' }
}

/**
 * XMLHttpRequest rather than fetch: fetch still cannot report upload progress, and a
 * 5 MB photo over a Moldovan mobile connection is exactly the case where a progress bar
 * is the difference between waiting and pressing the button again.
 */
function uploadPhoto(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ key: string; url: string }> {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.append('file', file)

    const request = new XMLHttpRequest()
    request.open('POST', '/api/uploads/product-photo')
    request.responseType = 'text'

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    })

    request.addEventListener('load', () => {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(request.responseText) as unknown
      } catch {
        parsed = null
      }

      if (request.status >= 200 && request.status < 300 && isUploadedPhoto(parsed)) {
        onProgress(100)
        resolve(parsed)
        return
      }
      reject(toFailure(parsed))
    })

    request.addEventListener('error', () => reject({ key: 'network' } satisfies UploadFailure))
    request.addEventListener('abort', () => reject({ key: 'generic' } satisfies UploadFailure))

    request.send(body)
  })
}

export function PhotoUploader({
  photos,
  onChange,
  max,
}: {
  photos: PhotoDraft[]
  onChange: (photos: PhotoDraft[]) => void
  max: number
}) {
  const { t, fmt } = useI18n()

  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const taskId = useRef(0)
  const dragIndex = useRef<number | null>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos

  const showFailure = useCallback(
    (failure: UploadFailure) => {
      const messages = t.errors as Record<string, string | undefined>
      setError(fmt(messages[failure.key] ?? t.errors.generic, failure.params))
    },
    [fmt, t],
  )

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setError(null)

      const allowed: readonly string[] = IMAGE_MIME_TYPES
      const maxMb = Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))

      for (const file of Array.from(files)) {
        if (photosRef.current.length >= max) {
          setError(fmt(t.productForm.photoLimitReached, { max }))
          break
        }

        if (!allowed.includes(file.type)) {
          showFailure({ key: 'fileTypeNotAllowed' })
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          showFailure({ key: 'fileTooLarge', params: { size: maxMb } })
          continue
        }

        taskId.current += 1
        const id = taskId.current
        setTasks((current) => [...current, { id, name: file.name, progress: 0 }])

        try {
          const uploaded = await uploadPhoto(file, (progress) => {
            setTasks((current) =>
              current.map((task) => (task.id === id ? { ...task, progress } : task)),
            )
          })
          const next = [...photosRef.current, uploaded]
          photosRef.current = next
          onChange(next)
        } catch (failure) {
          showFailure(toFailure(failure))
        } finally {
          setTasks((current) => current.filter((task) => task.id !== id))
        }
      }

      if (inputRef.current) inputRef.current.value = ''
    },
    [fmt, max, onChange, showFailure, t],
  )

  function move(from: number, to: number): void {
    if (to < 0 || to >= photos.length || from === to) return
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    onChange(next)
  }

  function remove(index: number): void {
    onChange(photos.filter((_, position) => position !== index))
  }

  const full = photos.length >= max

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium text-foreground">
        {t.productForm.photos}
      </legend>
      <p className="mb-3 text-caption text-muted-foreground">
        {fmt(t.productForm.photosHint, {
          max,
          size: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
        })}
      </p>

      {error ? (
        <Alert variant="destructive" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <div
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) {
            event.preventDefault()
            setDragOver(false)
            void addFiles(event.dataTransfer.files)
          }
        }}
        className={cn(
          'rounded-md border border-dashed border-border p-3 transition-colors',
          dragOver && 'border-primary bg-primary-soft/40',
        )}
      >
        {photos.length === 0 && tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t.productForm.noPhotos}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <li
                key={photo.key}
                draggable
                onDragStart={() => {
                  dragIndex.current = index
                }}
                onDragOver={(event) => {
                  if (dragIndex.current !== null) event.preventDefault()
                }}
                onDrop={(event) => {
                  if (dragIndex.current === null) return
                  event.preventDefault()
                  event.stopPropagation()
                  move(dragIndex.current, index)
                  dragIndex.current = null
                }}
                onDragEnd={() => {
                  dragIndex.current = null
                }}
                className="group relative overflow-hidden rounded-md border border-border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full cursor-grab object-cover"
                />

                {index === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-caption font-semibold text-primary-foreground">
                    {t.productForm.photoCover}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={t.productForm.photoRemove}
                  className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-md bg-card/90 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>

                <div className="flex items-center justify-between gap-1 border-t border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={t.productForm.photoMoveUp}
                    className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowUp aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <span className="tnum text-caption text-muted-foreground">{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === photos.length - 1}
                    aria-label={t.productForm.photoMoveDown}
                    className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowDown aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}

            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-border bg-card p-3"
              >
                <p className="w-full truncate text-center text-caption text-muted-foreground">
                  {task.name}
                </p>
                <div
                  role="progressbar"
                  aria-label={t.productForm.photoUploading}
                  aria-valuenow={task.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <p className="tnum text-caption text-muted-foreground">{`${task.progress}%`}</p>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-center text-caption text-muted-foreground">
          {t.productForm.photoDropHint}
        </p>
      </div>

      <input
        ref={inputRef}
        id="product-photos"
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        multiple
        className="sr-only"
        onChange={(event) => void addFiles(event.target.files)}
      />

      <Button
        type="button"
        variant="outline"
        className="mt-3"
        disabled={full}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden="true" className="h-4 w-4" />
        {t.productForm.addPhoto}
      </Button>

      {full ? (
        <p className="mt-2 text-caption text-muted-foreground">
          {fmt(t.productForm.photoLimitReached, { max })}
        </p>
      ) : null}
    </fieldset>
  )
}
