'use client';

import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Seat } from '@/lib/api';
import { SeatLegend } from './SeatLegend';
import { calculateSeatBounds, getSeatRenderStyle } from './seat-utils';

export interface SeatMapCanvasProps {
  seats: Seat[];
  selectedSeatSet: Set<string>;
  activeHoldId: string | null;
  loading: boolean;
  zoomScale: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  onToggleSeat: (seat: Seat) => void;
}

export function SeatMapCanvas({
  seats,
  selectedSeatSet,
  activeHoldId,
  loading,
  zoomScale,
  onZoomChange,
  onToggleSeat,
}: SeatMapCanvasProps) {
  const { maxX, maxY } = React.useMemo(() => calculateSeatBounds(seats), [seats]);

  return (
    <div className="lg:col-span-3 flex flex-col items-center justify-center rounded-xl glass border border-white/70 p-6 shadow-sm overflow-hidden">
      {/* Stage Focal Point with Acoustic Spotlight */}
      <div className="w-full max-w-lg mb-6 flex flex-col items-center">
        <div className="relative w-full overflow-hidden rounded-t-[100px] border-t-2 border-indigo-400/40 bg-gradient-to-b from-indigo-500/15 via-indigo-500/5 to-transparent h-12 flex items-center justify-center shadow-[0_-10px_30px_rgba(99,102,241,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-400/20 via-transparent to-transparent pointer-events-none" />
          <span className="text-[11px] font-bold tracking-widest uppercase text-indigo-600 drop-shadow-sm flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
            Acoustic Center Stage
          </span>
        </div>
        <div className="w-3/4 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
      </div>

      {/* Zoom and Map View Controls */}
      <div className="w-full flex items-center justify-between px-2 pb-2 mb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-600">Scale: {Math.round(zoomScale * 100)}%</span>
        </div>
        <div className="flex items-center gap-1 bg-white/50 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => onZoomChange((prev) => Math.max(0.7, Number((prev - 0.15).toFixed(2))))}
            className="p-1 rounded text-slate-700 hover:text-slate-900 hover:bg-white/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Zoom Out"
            aria-label="Thu nhỏ bản đồ ghế (Zoom out)"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(1)}
            className="px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-white/50 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Reset Zoom"
            aria-label="Đặt lại kích thước bản đồ 100%"
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => onZoomChange((prev) => Math.min(1.8, Number((prev + 0.15).toFixed(2))))}
            className="p-1 rounded text-slate-700 hover:text-slate-900 hover:bg-white/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Zoom In"
            aria-label="Phóng to bản đồ ghế (Zoom in)"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* SVG Map Container */}
      <div className="w-full overflow-x-auto flex justify-center py-2">
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="mt-2 text-xs text-slate-600">Loading seat layout...</p>
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <svg
              width={maxX}
              height={maxY}
              className="select-none"
              viewBox={`0 0 ${maxX} ${maxY}`}
            >
              {seats.map((seat) => {
                const isSelected = selectedSeatSet.has(seat.id);
                const isHeldByMe = Boolean(seat.isHeldByMe || (isSelected && activeHoldId));
                const isBooked = seat.status === 'BOOKED';
                const { fillColor, strokeColor, opacity, cursor } = getSeatRenderStyle(
                  seat,
                  isSelected,
                  isHeldByMe
                );

                return (
                  <g
                    key={seat.id}
                    role="button"
                    tabIndex={isBooked ? -1 : 0}
                    aria-pressed={isSelected}
                    aria-label={`Ghế ${seat.rowLabel}-${seat.seatNumber}, Hạng ${seat.tierName}, Giá ${seat.price.toLocaleString('vi-VN')} đ, Trạng thái ${seat.status}`}
                    onClick={() => onToggleSeat(seat)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleSeat(seat);
                      }
                    }}
                    className="transition-transform duration-100 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    style={{ cursor }}
                  >
                    {/* 44px Accessible Touch Hitbox (WCAG 2.5.5) */}
                    <circle
                      cx={seat.x}
                      cy={seat.y}
                      r={22}
                      fill="transparent"
                    />
                    <circle
                      cx={seat.x}
                      cy={seat.y}
                      r={13}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2.5 : 1}
                      opacity={opacity}
                    />
                    <text
                      x={seat.x}
                      y={seat.y + 4}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill={isBooked ? '#64748b' : '#ffffff'}
                      className="pointer-events-none"
                    >
                      {seat.seatNumber}
                    </text>
                    {/* Color-blind accessible indicator glyphs */}
                    {isSelected && (
                      <circle cx={seat.x + 8} cy={seat.y - 8} r={3.5} fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                    )}
                    {isBooked && (
                      <line x1={seat.x - 4} y1={seat.y - 4} x2={seat.x + 4} y2={seat.y + 4} stroke="#64748b" strokeWidth="1.5" />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Seat Legend */}
      <SeatLegend />
    </div>
  );
}
