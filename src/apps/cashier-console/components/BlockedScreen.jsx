/**
 * BlockedScreen - Error screen when access is denied
 * Used when POS Opening is required but not found
 */
export function BlockedScreen({ title, message, actions = [], error = null }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4 bg-white rounded-lg shadow-lg border border-gray-200 p-8">
        {/* Error Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="w-8 h-8 text-red-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">
          {title}
        </h2>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6">
          {message}
        </p>

        {/* Error Details (for console debugging) */}
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <div className="font-mono text-red-800 break-words">
              {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {actions.length > 0 && (
          <div className="space-y-3">
            {actions.map((action, index) => {
              const isPrimary = index === 0
              return (
                <a
                  key={index}
                  href={action.href}
                  className={`
                    block w-full py-3 px-4 rounded-md text-center font-medium
                    transition-colors duration-200
                    ${isPrimary 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                  onClick={action.onClick}
                >
                  {action.label}
                </a>
              )
            })}
          </div>
        )}

        {/* Console Hint */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            💡 Tip: Buka browser console (F12) untuk lihat error details
          </p>
        </div>
      </div>
    </div>
  )
}

export default BlockedScreen
