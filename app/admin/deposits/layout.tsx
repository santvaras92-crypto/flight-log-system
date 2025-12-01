import React from 'react';

export default function DepositsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8">
        {children}
      </div>
    </div>
  );
}
