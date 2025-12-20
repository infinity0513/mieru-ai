import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  isLoading = false, 
  icon,
  className = '',
  disabled,
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900";
  
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600",
    outline: "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-indigo-500 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:bg-red-600 dark:hover:bg-red-500"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  const iconSizes = {
    sm: "w-3 h-3 mr-1.5",
    md: "w-4 h-4 mr-2",
    lg: "w-5 h-5 mr-2.5"
  };

  const spacerSizes = {
    sm: "mr-1.5",
    md: "mr-2",
    lg: "mr-2.5"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className={`animate-spin ${iconSizes[size]}`} />}
      {!isLoading && icon && <span className={spacerSizes[size]}>{icon}</span>}
      {children}
    </button>
  );
};