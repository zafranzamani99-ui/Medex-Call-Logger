import { forwardRef } from 'react'

// WHY: Unified button component replacing 5 scattered patterns across the app.
// All buttons now use consistent sizing, rounding, hover states, and loading behavior.

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variantClasses: Record<string, string> = {
  primary:   'bg-indigo-500 hover:bg-indigo-600 text-white shadow-theme-sm active:translate-y-px active:shadow-none',
  secondary: 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-raised shadow-theme-sm active:translate-y-px',
  success:   'bg-emerald-600 hover:bg-emerald-700 text-white shadow-theme-sm active:translate-y-px active:shadow-none',
  danger:    'bg-red-500/10 text-red-400 hover:bg-red-500/20 active:translate-y-px',
  ghost:     'text-text-tertiary hover:text-text-primary hover:bg-surface-raised active:translate-y-px',
}

const sizeClasses: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium rounded-lg
          transition-all duration-150 cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        {...props}
      >
        {loading && (
          <svg className="animate-spin size-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
