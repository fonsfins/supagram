import React from 'react';
import { X } from 'lucide-react';

interface MediaModalProps {
  url: string | null;
  type: string | null;
  onClose: () => void;
}

export function MediaModal({ url, type, onClose }: MediaModalProps) {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <button 
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full transition-all"
        onClick={onClose}
      >
        <X size={24} />
      </button>
      
      <div 
        className="max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {type?.startsWith('video/') ? (
          <video 
            src={url} 
            controls 
            autoPlay
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        ) : (
          <img 
            src={url} 
            alt="Media viewer" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        )}
      </div>
    </div>
  );
}
