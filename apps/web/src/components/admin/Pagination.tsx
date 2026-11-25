'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      aria-label="Pagination Navigation"
    >
      <div className="text-xs text-slate-500">
        Showing{' '}
        <span className="font-semibold text-slate-700">
          {total === 0 ? 0 : (page - 1) * pageSize + 1}
        </span>
        –
        <span className="font-semibold text-slate-700">
          {Math.min(page * pageSize, total)}
        </span>{' '}
        of <span className="font-semibold text-slate-700">{total}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || isFirst}
          aria-label="Previous page"
          className="btn btn-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Prev</span>
        </button>

        <span className="px-2 text-xs font-medium text-slate-600" aria-live="polite">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || isLast}
          aria-label="Next page"
          className="btn btn-secondary px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
