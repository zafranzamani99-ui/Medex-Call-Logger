'use client'

import { useState } from 'react'
import { format } from 'date-fns'

// WHY: WhatsApp Draft Generator — spec Section 11.
// Builds the formatted WA message from ticket data and provides one-tap copy.
// Available from Log Call form (before/after save) and Ticket Detail page.
// The format is specified exactly in the spec — must match it precisely.

interface WADraftModalProps {
  ticket: {
    clinic_name: string
    clinic_code: string
    clinic_phone?: string | null
    pic?: string | null
    ticket_ref?: string
    issue_type: string
    issue: string
    my_response?: string | null
    next_step?: string | null
    status: string
  }
  agentName: string
  onClose: () => void
  // Schedule template data (optional — used when issue_type is Schedule)
  scheduleData?: {
    schedule_date: string
    schedule_time: string
    duration_estimate: string
  }
}

export default function WADraftModal({ ticket, agentName, onClose, scheduleData }: WADraftModalProps) {
  const [copied, setCopied] = useState(false)

  const now = new Date()
  const dateStr = format(now, 'dd/MM/yyyy')
  const timeStr = format(now, 'hh:mm a')

  // Format schedule date for display (yyyy-MM-dd → dd/MM/yyyy)
  const formatScheduleDate = (d: string) => {
    const parts = d.split('-')
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d
  }

  // Build the WhatsApp message — schedule template or standard support update
  const message = scheduleData
    ? `*MEDEX SCHEDULE NOTIFICATION*

👤 MEDEX PIC  : ${agentName}
🏥 Clinic     : ${ticket.clinic_name} (${ticket.clinic_code})
👤 Clinic PIC : ${ticket.pic || '-'}
📅 Date       : ${formatScheduleDate(scheduleData.schedule_date)}
🕐 Time       : ${scheduleData.schedule_time}

⏱️ Estimated Duration : ${scheduleData.duration_estimate}

— Medex Support`
    : `*MEDEX SUPPORT UPDATE*

📅 ${dateStr}  ${timeStr}
🏥 Clinic : ${ticket.clinic_name} (${ticket.clinic_code})
📞 Tel    : ${ticket.clinic_phone || '-'}
👤 PIC    : ${ticket.pic || '-'}
🔖 Ref    : ${ticket.ticket_ref || 'Pending'}

⚠️  Issue   : ${ticket.issue} (${ticket.issue_type})

✅  Action  :
${ticket.my_response || '-'}

➡️  Next    : ${ticket.next_step || '-'}
📋  Status  : ${ticket.status}

— ${agentName} · Medex Support`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      // Auto-dismiss after copy (spec: "modal dismisses after copy")
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch {
      // Fallback for mobile browsers that don't support clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = message
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => {
        onClose()
      }, 1000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-white">WhatsApp Draft</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-2 -mr-2"
            aria-label="Close"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed">
            {message}
          </pre>
        </div>

        {/* Copy button */}
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={handleCopy}
            className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
