import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import '../../../styles/components/modal.css'

/**
 * Modal/Dialog Component using Radix UI
 * 
 * Provides accessible modal dialogs with proper focus management and keyboard support
 * 
 * Usage:
 *   <Modal open={isOpen} onOpenChange={setIsOpen}>
 *     <Modal.Content>
 *       <Modal.Header>
 *         <Modal.Title>Edit Item</Modal.Title>
 *       </Modal.Header>
 *       <Modal.Body>
 *         Content here
 *       </Modal.Body>
 *       <Modal.Footer>
 *         <button onClick={() => setIsOpen(false)}>Cancel</button>
 *         <button>Save</button>
 *       </Modal.Footer>
 *     </Modal.Content>
 *   </Modal>
 */

const Modal = ({
  open,
  onOpenChange,
  children,
  className = ''
}) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`modal-overlay ${className}`} />
        {children}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

Modal.Content = React.forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Content
    ref={ref}
    className={`modal-content ${className}`}
    {...props}
  />
))

Modal.Header = ({ className = '', ...props }) => (
  <div className={`modal-header ${className}`} {...props} />
)

Modal.Title = React.forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`modal-title ${className}`}
    {...props}
  />
))

Modal.Body = ({ className = '', ...props }) => (
  <div className={`modal-body ${className}`} {...props} />
)

Modal.Footer = ({ className = '', ...props }) => (
  <div className={`modal-footer ${className}`} {...props} />
)

Modal.Close = React.forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={`modal-close ${className}`}
    {...props}
  />
))

export { Modal }
