"use client";

import { useEffect, useState } from "react";

interface SprintCountdownProps {
  firstCompletionAt: string | null;
  submissionWindowOpen?: boolean;
}

const SprintCountdown: React.FC<SprintCountdownProps> = ({ 
  firstCompletionAt, 
  submissionWindowOpen = false 
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!firstCompletionAt || !submissionWindowOpen) {
      setTimeRemaining(0);
      setIsExpired(false);
      return;
    }

    const updateTimer = () => {
      const completionTime = new Date(firstCompletionAt).getTime();
      const windowEnd = completionTime + (48 * 60 * 60 * 1000); // 48 hours in milliseconds
      const now = Date.now();
      const remaining = windowEnd - now;

      if (remaining <= 0) {
        setTimeRemaining(0);
        setIsExpired(true);
      } else {
        setTimeRemaining(remaining);
        setIsExpired(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [firstCompletionAt, submissionWindowOpen]);

  // Format time remaining as "Xh Ym Zs"
  const formatTimeRemaining = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // Get color class based on time remaining
  const getColorClass = (ms: number): string => {
    const hours = ms / (1000 * 60 * 60);
    
    if (hours > 24) {
      return "text-green-600"; // Green: > 24 hours
    } else if (hours >= 12) {
      return "text-yellow-600"; // Yellow/Orange: 12-24 hours
    } else {
      return "text-red-600"; // Red: < 12 hours
    }
  };

  // Get background color class
  const getBackgroundClass = (ms: number): string => {
    const hours = ms / (1000 * 60 * 60);
    
    if (hours > 24) {
      return "bg-green-50 border-green-200"; // Green: > 24 hours
    } else if (hours >= 12) {
      return "bg-yellow-50 border-yellow-200"; // Yellow/Orange: 12-24 hours
    } else {
      return "bg-red-50 border-red-200"; // Red: < 12 hours
    }
  };

  // Check if less than 6 hours remaining
  const isUrgent = timeRemaining > 0 && timeRemaining < (6 * 60 * 60 * 1000);

  // Don't render if conditions aren't met
  if (!firstCompletionAt || !submissionWindowOpen) {
    return null;
  }

  // Render expired state
  if (isExpired) {
    return (
      <div className="mb-4 p-4 bg-gray-100 border-2 border-gray-300 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
          <div>
            <div className="text-sm font-semibold text-gray-700">Window Closed</div>
            <div className="text-xs text-gray-500 mt-0.5">The submission window has expired</div>
          </div>
        </div>
      </div>
    );
  }

  const hoursRemaining = timeRemaining / (1000 * 60 * 60);

  return (
    <div className={`mb-4 p-4 rounded-lg border-2 ${getBackgroundClass(timeRemaining)}`}>
      <div className="flex items-center gap-3">
        {/* Urgency Indicator */}
        <div className={`w-3 h-3 rounded-full ${
          hoursRemaining > 24 
            ? 'bg-green-500' 
            : hoursRemaining >= 12 
            ? 'bg-yellow-500 animate-pulse' 
            : 'bg-red-500 animate-pulse'
        }`}></div>
        
        <div className="flex-1">
          {isUrgent && (
            <div className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">
              ⚠️ SUBMISSION WINDOW CLOSING
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Time Remaining:</span>
            <span className={`text-lg font-bold ${getColorClass(timeRemaining)}`}>
              {formatTimeRemaining(timeRemaining)}
            </span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Submission window closes {hoursRemaining < 1 ? 'soon' : hoursRemaining < 12 ? 'in less than 12 hours' : 'in 48 hours'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SprintCountdown;
