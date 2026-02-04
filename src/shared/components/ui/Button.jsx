import React from 'react'
import '../../../styles/components/button.css'

/**
 * Button Component
 * 
 * Accessible button with multiple variants and sizes
 * 
 * Variants: primary (default), secondary, danger, outline
 * Sizes: sm, md (default), lg
 * 
 * Usage:
 *   <Button onClick={handleClick}>Click me</Button>
 *   <Button variant="danger" size="lg">Delete</Button>
 *   <Button disabled>Disabled</Button>
 */

const Button = React.forwardRef((
  {
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    isLoading = false,
    ...props
  },
  ref
) => {
  const buttonClass = `
    button
    button--${variant}
    button--${size}
    ${isLoading ? 'button--loading' : ''}
    ${disabled ? 'button--disabled' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ')

  return (
    <button
      ref={ref}
      className={buttonClass}
      disabled={disabled || isLoading}
      type={props.type || 'button'}
      {...props}
    >
      {isLoading && (
        <span className="button__spinner" aria-hidden="true"></span>
      )}
      <span className="button__content">{children}</span>
    </button>
  )
})

Button.displayName = 'Button'

export { Button }
