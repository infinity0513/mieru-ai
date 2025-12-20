import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react';
import { Button } from './ui/Button';

export interface TourStep {
  targetId?: string; // If undefined, modal centers on screen
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface TourGuideProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const TourGuide: React.FC<TourGuideProps> = ({ steps, isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  
  const step = steps[currentStep];

  const updateTargetPosition = useCallback(() => {
    if (step.targetId) {
      const element = document.getElementById(step.targetId);
      if (element) {
        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTargetRect(element.getBoundingClientRect());
      } else {
        // Fallback if element not found (e.g. mobile menu closed)
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (isOpen) {
      // Add resize listener
      window.addEventListener('resize', updateTargetPosition);
      window.addEventListener('scroll', updateTargetPosition);
      
      // Initial update
      setTimeout(updateTargetPosition, 100); // Slight delay for rendering
      
      return () => {
        window.removeEventListener('resize', updateTargetPosition);
        window.removeEventListener('scroll', updateTargetPosition);
      };
    }
  }, [isOpen, currentStep, updateTargetPosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  // Calculate Popover Position
  let popoverStyle: React.CSSProperties = {};
  const margin = 16;
  const popoverWidth = 384; // w-96 = 384px
  const popoverHeight = 200; // Estimated height

  if (targetRect) {
    let top = 0;
    let left = 0;

    if (step.position === 'right') {
      top = targetRect.top + (targetRect.height / 2) - (popoverHeight / 2);
      left = targetRect.right + margin;
    } else if (step.position === 'bottom') {
      top = targetRect.bottom + margin;
      left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2);
    } else if (step.position === 'top') {
      top = targetRect.top - popoverHeight - margin;
      left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2);
    } else if (step.position === 'left') {
      top = targetRect.top + (targetRect.height / 2) - (popoverHeight / 2);
      left = targetRect.left - popoverWidth - margin;
    } else {
      // Default: center
      top = targetRect.top + (targetRect.height / 2) - (popoverHeight / 2);
      left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2);
    }
    
    // Boundary checks - ensure popover stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Horizontal boundary check
    if (left < margin) {
      left = margin;
    } else if (left + popoverWidth > viewportWidth - margin) {
      left = viewportWidth - popoverWidth - margin;
    }
    
    // Vertical boundary check
    if (top < margin) {
      top = margin;
    } else if (top + popoverHeight > viewportHeight - margin) {
      top = viewportHeight - popoverHeight - margin;
    }
    
    popoverStyle = {
      top: `${top}px`,
      left: `${left}px`,
    };
  } else {
    // Center if no target
    popoverStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: '90vw',
      maxHeight: '90vh',
    };
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Backdrop with "Spotlight" effect */}
      {targetRect ? (
        <div 
            className="absolute inset-0 transition-all duration-300 ease-out"
            style={{
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                borderRadius: '8px',
                pointerEvents: 'none' // Let clicks pass through if needed, though usually we block interaction during tour
            }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" />
      )}

      {/* Popover Card */}
      <div 
        className="absolute bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-80 md:w-96 border border-gray-100 dark:border-gray-700 transition-all duration-300 max-w-[90vw] max-h-[90vh] overflow-y-auto"
        style={popoverStyle}
      >
        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold mr-2">
                    {currentStep + 1}
                </span>
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{step.title}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
            </button>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-6">
            {step.content}
        </p>

        <div className="flex justify-between items-center">
            <div className="flex space-x-1">
                {steps.map((_, idx) => (
                    <div 
                        key={idx} 
                        className={`w-2 h-2 rounded-full transition-colors ${idx === currentStep ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    />
                ))}
            </div>
            <div className="flex space-x-2">
                {currentStep > 0 && (
                    <Button variant="secondary" size="sm" onClick={handlePrev} icon={<ChevronLeft size={14}/>}>
                        戻る
                    </Button>
                )}
                <Button size="sm" onClick={handleNext}>
                    {currentStep === steps.length - 1 ? '完了' : '次へ'}
                    {currentStep !== steps.length - 1 && <ChevronRight size={14} className="ml-1"/>}
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
};