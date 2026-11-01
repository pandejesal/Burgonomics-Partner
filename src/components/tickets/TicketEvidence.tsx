import React, { useState } from 'react';
import { AlertCircle, ImageOff } from 'lucide-react';

/**
 * Customer photo evidence on a support ticket.
 *
 * `ticket.attachments` reached the page (utils/ticketContract.ts) but nothing
 * rendered it, so staff handling a complaint could not see the photos the
 * customer attached. This is the missing surface.
 *
 * SECURITY: attachment URLs are CUSTOMER-SUPPLIED INPUT. Rendering an arbitrary
 * <img src> would leak the staff member's IP and Referer to a third-party host
 * and lets the customer swap in a tracking pixel; a `javascript:` or `data:`
 * URL in the anchor is worse. Only the Firebase Storage hosts over https are
 * accepted, everything else is dropped and never rendered.
 */

/** Hosts that may legitimately serve ticket evidence. */
const EVIDENCE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  // The GCS JSON/media endpoint; the Storage SDK can hand back a direct link.
  'storage.googleapis.com',
]);

/** Max thumbnails shown; the client caps uploads at 3, this is a display guard. */
const MAX_THUMBS = 5;

/**
 * Returns the URL unchanged when it is a trustworthy https Firebase Storage
 * URL, otherwise null. Exported so the rule is unit-testable on its own.
 */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!EVIDENCE_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface TicketEvidenceProps {
  /** Raw `ticket.attachments` — untrusted, filtered here. */
  attachments?: unknown;
  /** Used in alt text so screen readers can name the ticket. Defaults to the id-less form. */
  ticketLabel?: string;
  /**
   * URLs to render as already-failed. Exists so the fallback is reachable in
   * static-markup tests; production never passes it.
   */
  initialFailedUrls?: string[];
}

export function TicketEvidence({
  attachments,
  ticketLabel,
  initialFailedUrls,
}: TicketEvidenceProps) {
  const [failed, setFailed] = useState<Set<string>>(
    () => new Set(initialFailedUrls ?? []),
  );

  const list = Array.isArray(attachments) ? attachments : [];
  const safe = list
    .map((raw) => safeEvidenceUrl(raw))
    .filter((url): url is string => url !== null);

  // Deduplicate: the same photo twice is noise, not two pieces of evidence.
  const unique = Array.from(new Set(safe));
  if (unique.length === 0) return null;

  const shown = unique.slice(0, MAX_THUMBS);
  const withheld = unique.length - shown.length;
  const label = ticketLabel ? ` for ticket ${ticketLabel}` : '';

  return (
    <div className="space-y-2" data-evidence-section>
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-accent-light" aria-hidden />
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
          Customer photo evidence ({unique.length})
        </h3>
      </div>

      <ul className="flex flex-wrap gap-3">
        {shown.map((url, index) => {
          const isFailed = failed.has(url);
          const alt = `Customer evidence photo ${index + 1} of ${unique.length}${label}`;
          return (
            <li key={url}>
              {/*
                The anchor — not the img — carries the >=44px hit area so the
                tap target stays reachable on a phone even for small images.
              */}
              <a
                href={isFailed ? undefined : url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={isFailed ? alt : `${alt} (opens in a new tab)`}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className="rounded-xl border border-border bg-bg overflow-hidden cursor-pointer"
                onClick={isFailed ? (e) => e.preventDefault() : undefined}
              >
                {isFailed ? (
                  <PhotoFallback index={index} alt={alt} />
                ) : (
                  <img
                    src={url}
                    alt={alt}
                    loading="lazy"
                    className="w-20 h-20 object-cover"
                    onError={() =>
                      setFailed((prev) => {
                        const next = new Set(prev);
                        next.add(url);
                        return next;
                      })
                    }
                  />
                )}
              </a>
            </li>
          );
        })}
      </ul>

      {withheld > 0 && (
        <p className="text-[11px] text-zinc-500">
          {withheld} more photo{withheld === 1 ? '' : 's'} not shown.
        </p>
      )}
    </div>
  );
}

/** Visible replacement for a broken thumbnail — never a silent broken icon. */
function PhotoFallback({ index, alt }: { index: number; alt: string }) {
  return (
    <span
      data-evidence-fallback
      role="img"
      aria-label={alt}
      className="w-20 h-20 flex flex-col items-center justify-center gap-1 bg-surface-hover text-zinc-500"
    >
      <ImageOff className="w-5 h-5" aria-hidden />
      <span className="text-[9px] font-bold leading-tight text-center px-1">
        Image unavailable (#{index + 1})
      </span>
    </span>
  );
}

export default TicketEvidence;
