'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface ErrorMessageProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorMessage({ message, onDismiss }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
        <span>{message}</span>
      </div>
      <button onClick={onDismiss} className="text-red-600 hover:text-slate-900">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
