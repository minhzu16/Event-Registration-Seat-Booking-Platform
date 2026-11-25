'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { fetchApi } from '@/lib/api';

interface CreateEventModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEventModal({ onClose, onCreated }: CreateEventModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Technology');
  const [venueName, setVenueName] = useState('Grand Hall');
  const [seatingMode, setSeatingMode] = useState<'GA' | 'RESERVED'>('RESERVED');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const defaultStarts = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const defaultEnds = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 3600 * 1000).toISOString();

      await fetchApi('/organiser/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: '',
          category,
          venueName,
          seatingMode,
          cancelDeadlineHours: 24,
          refundPercent: 100,
          maxTicketsPerUser: 4,
          sessions: [
            {
              startsAt: defaultStarts,
              endsAt: defaultEnds,
              ticketTypes: [
                {
                  name: seatingMode === 'RESERVED' ? 'Premium Tier' : 'General Admission',
                  price: 500000,
                  capacity: 100,
                  color: '#6366f1',
                },
              ],
            },
          ],
        }),
      });

      onClose();
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl glass-strong border border-white/70 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
          <h3 className="text-lg font-bold text-slate-900">Create New Event</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Event Title</label>
            <input
              type="text"
              required
              placeholder="e.g. AI Concurrency Conference 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="text-slate-700 font-semibold block mb-1">Venue Location</label>
            <input
              type="text"
              required
              placeholder="e.g. Grand Auditorium Hall A"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
              >
                <option value="Technology">Technology</option>
                <option value="Music">Music</option>
                <option value="Business">Business</option>
                <option value="Art">Art</option>
              </select>
            </div>
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Seating Mode</label>
              <select
                value={seatingMode}
                onChange={(e) => setSeatingMode(e.target.value as 'GA' | 'RESERVED')}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
              >
                <option value="RESERVED">Reserved Seating (Grid)</option>
                <option value="GA">General Admission</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50 mt-4"
          >
            {isSubmitting ? 'Publishing Event...' : 'Create & Publish Event'}
          </button>
        </form>
      </div>
    </div>
  );
}
