interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' | 'outline';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-gray-800 text-gray-300 border-gray-700',
    success: 'bg-green-950 text-green-300 border-green-800',
    warning: 'bg-yellow-950 text-yellow-300 border-yellow-800',
    error: 'bg-red-950 text-red-300 border-red-800',
    info: 'bg-blue-950 text-blue-300 border-blue-800',
    secondary: 'bg-gray-700 text-gray-200 border-gray-600',
    outline: 'bg-transparent text-gray-300 border-gray-600',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
