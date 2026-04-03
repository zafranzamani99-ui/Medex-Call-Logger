import { forwardRef } from 'react'

// WHY: Unified input styling replacing 20+ inline class strings across the app.
// Consistent focus rings, WCAG-compliant placeholders, and error state support.

// --- Label ---
export function Label({ children, required, htmlFor }: {
  children: React.ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm text-zinc-400 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          w-full px-3 py-2.5 bg-surface border rounded-lg text-white text-sm
          placeholder:text-zinc-500 transition-colors
          focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent
          ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-border'}
          ${className}
        `.trim()}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

// --- Textarea ---
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          w-full px-3 py-2.5 bg-surface border rounded-lg text-white text-sm
          placeholder:text-zinc-500 transition-colors resize-vertical
          focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent
          ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-border'}
          ${className}
        `.trim()}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className = '', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`
          w-full px-3 py-2.5 bg-surface border rounded-lg text-white text-sm
          transition-colors cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent
          ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-border'}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'
