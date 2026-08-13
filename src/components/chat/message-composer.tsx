'use client'

import { useRef, useState, useTransition, type ChangeEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { MAX_DOCUMENT_BYTES } from '@/lib/constants'
import { sendMessageAction } from '@/server/actions/messages'
import { Alert, Button, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * The composer.
 *
 * Enter sends and Shift+Enter breaks the line, which is what everyone's fingers
 * already expect — but the send button stays a real submit button so the flow is
 * identical for keyboard and screen-reader users who never press Enter in a textarea.
 *
 * The textarea grows with its content up to a ceiling instead of scrolling from the
 * third word: a wholesale enquiry is three sentences, not a tweet.
 */

const MAX_ATTACHMENTS = 3
const MAX_TEXTAREA_PX = 160
const MAX_MB = Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))

interface PendingAttachment {
  key: string
  fileName: string
  mimeType: string
  sizeByte: number
}

export function MessageComposer({
  conversationId,
  disabled = false,
  disabledReason,
}: {
  conversationId: string
  disabled?: boolean
  disabledReason?: string
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  const busy = pending || uploading
  const canSend = body.trim().length > 0 && !busy && !disabled

  /** Dictionary key -> sentence. Anything unrecognised degrades to the generic line. */
  function messageFor(key: string, params?: Record<string, string | number>): string {
    if (key === 'rateLimited') return t.chat.rateLimited
    const errors = t.errors as Record<string, string | undefined>
    return fmt(errors[key] ?? t.errors.generic, params)
  }

  function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_PX)}px`
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setBody(event.target.value)
    autoGrow(event.target)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // IME composition also fires Enter; `isComposing` keeps Japanese/Chinese input sane.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  function submit() {
    if (!canSend) return
    const text = body.trim()
    const files = attachments
    setError(null)

    startTransition(async () => {
      const result = await sendMessageAction({ conversationId, body: text }, files)

      if (!result.ok) {
        setError(messageFor(result.error, result.params))
        return
      }

      setBody('')
      setAttachments([])
      const element = textareaRef.current
      if (element) {
        element.style.height = 'auto'
        element.focus()
      }
      router.refresh()
    })
  }

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (attachments.length >= MAX_ATTACHMENTS) return
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(messageFor('fileTooLarge', { size: MAX_MB }))
      return
    }

    setError(null)
    setUploading(true)

    try {
      const payload = new FormData()
      payload.append('file', file)

      const response = await fetch('/api/uploads/message-attachment', {
        method: 'POST',
        body: payload,
      })
      const data: unknown = await response.json()

      if (!response.ok) {
        const failure = data as { error?: string; params?: Record<string, string | number> }
        setError(messageFor(failure.error ?? 'generic', failure.params))
        return
      }

      setAttachments((current) => [...current, data as PendingAttachment])
    } catch {
      setError(t.errors.network)
    } finally {
      setUploading(false)
    }
  }

  if (disabled) {
    return (
      <div className="border-t border-border bg-card px-3 py-3">
        <Alert variant="warning">{disabledReason ?? t.chat.blocked}</Alert>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="border-t border-border bg-card px-3 py-3"
    >
      {error ? (
        <div className="mb-2">
          <Alert variant="destructive">{error}</Alert>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <ul aria-label={t.chat.attachments} className="mb-2 flex flex-wrap gap-2">
          {attachments.map((file) => (
            <li
              key={file.key}
              className="surface-muted flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption"
            >
              {file.mimeType === 'application/pdf' ? (
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="max-w-[12rem] truncate">{file.fileName}</span>
              <button
                type="button"
                aria-label={`${t.chat.attachmentRemove}: ${file.fileName}`}
                onClick={() =>
                  setAttachments((current) => current.filter((item) => item.key !== file.key))
                }
                className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={onPickFile}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          aria-label={t.chat.attach}
          title={fmt(t.chat.attachHint, { size: MAX_MB })}
          className={buttonVariants({
            variant: 'outline',
            size: 'icon',
            className: 'text-muted-foreground hover:text-foreground',
          })}
        >
          {uploading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
          ) : (
            <Paperclip className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>

        <label htmlFor="message-body" className="sr-only">
          {t.chat.placeholder}
        </label>
        <textarea
          id="message-body"
          ref={textareaRef}
          rows={1}
          value={body}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder={t.chat.placeholder}
          aria-describedby="message-send-hint"
          maxLength={4000}
          className={cn(
            'min-h-[44px] w-full resize-none rounded-md border border-input bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:opacity-55',
          )}
        />

        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          loading={pending}
          aria-label={t.chat.send}
          className="shrink-0"
        >
          <Send className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </div>

      <p id="message-send-hint" className="mt-1.5 text-caption text-muted-foreground">
        {t.chat.sendHint} · {fmt(t.chat.attachHint, { size: MAX_MB })}
      </p>
    </form>
  )
}
