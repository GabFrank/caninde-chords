import React, { useState, useEffect, useRef } from 'react';
import { Song, UserSongSettings } from '../types';
import { transposeContent } from '../lib/chordUtils';
import { getLogoUrl } from '../lib/utils';
import { Maximize, Columns, Hash, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';

interface SongViewerProps {
  song: Song;
  fontSize: number;
  columns: number;
  transpose?: number;
  notation?: 'scientific' | 'solfege';
  chordFontSize?: number;
  showCapo?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
  autoResize?: boolean;
  songSettings?: UserSongSettings;
  /**
   * `origin` distingue el ajuste pedido por el usuario del que induce un cambio
   * de tamaño del contenedor: sin eso, redimensionar la ventana marcaba la
   * canción como modificada y encendía el botón Guardar sin que nadie tocara nada.
   */
  onFontSizeChange?: (size: number, origin: 'user' | 'layout') => void;
  onColumnsChange?: (cols: number) => void;
  onSettingsChange?: (settings: Partial<UserSongSettings>) => void;
  t: any;
}

export const SongViewer: React.FC<SongViewerProps> = ({ 
  song, 
  fontSize, 
  columns, 
  transpose = 0, 
  notation = 'scientific',
  chordFontSize = 90,
  showCapo = true,
  minFontSize = 12,
  maxFontSize = 48,
  autoResize = true,
  songSettings,
  onFontSizeChange,
  onColumnsChange,
  onSettingsChange,
  t
}) => {
  const [formattedContent, setFormattedContent] = useState<React.ReactNode[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Use song-specific settings if available, otherwise use props
  const currentAutoResize = autoResize;
  const headerRef = useRef<HTMLDivElement>(null);
  const currentFontSize = fontSize;
  const currentColumns = columns;
  const currentTranspose = transpose;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleFit = (origin: 'user' | 'layout') => {
      if (!containerRef.current || !contentRef.current || !onFontSizeChange || !currentAutoResize) return;

      const container = containerRef.current;
      const content = contentRef.current;
      
      const headerHeight = headerRef.current?.clientHeight || 0;
      const availableHeight = container.clientHeight - headerHeight - 64;
      
      if (availableHeight <= 0) return;
 
      let low = minFontSize;
      let high = maxFontSize;
      let bestFontSize = currentFontSize;

      // Temporarily apply columns for measurement
      const originalCols = content.style.columnCount;
      content.style.columnCount = currentColumns.toString();

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        content.style.fontSize = `${mid}px`;
        
        const isOverflowing = content.scrollHeight > availableHeight + 5;
        
        if (isOverflowing) {
          high = mid - 1;
        } else {
          bestFontSize = mid;
          low = mid + 1;
        }
      }

      content.style.columnCount = originalCols;
      content.style.fontSize = `${currentFontSize}px`;

      if (bestFontSize !== currentFontSize && Math.abs(bestFontSize - currentFontSize) >= 1) {
        onFontSizeChange(Math.round(bestFontSize), origin);
      }
    };

    const fitHandler = () => handleFit('user');
    window.addEventListener('fit-to-screen', fitHandler);
    
    let frameId: number | null = null;
    if (containerRef.current && currentAutoResize) {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(() => {
          handleFit('layout');
        });
      });
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('fit-to-screen', fitHandler);
      if (frameId) window.cancelAnimationFrame(frameId);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [currentFontSize, currentColumns, onFontSizeChange, onColumnsChange, song.content, currentAutoResize, minFontSize, maxFontSize]);

  useEffect(() => {
    const contentToDisplay = transposeContent(song.content, currentTranspose, notation as 'scientific' | 'solfege', showCapo);
    const lines = contentToDisplay.split('\n');
    const nodes: React.ReactNode[] = lines.map((line, idx) => {
      const parts = line.split(/(\[.*?\])/);
      const isColumnBreak = line.trim() === '[Break]' || line.trim() === '[Col]';
      
      return (
        <div 
          key={idx} 
          className="min-h-[1.2em] whitespace-pre-wrap"
          style={isColumnBreak ? { breakBefore: 'column' } : { breakInside: 'avoid-column' }}
        >
          {!isColumnBreak && parts.map((part, pIdx) => {
            if (part.startsWith('[') && part.endsWith(']')) {
              return (
                <span 
                  key={pIdx} 
                  className="text-blue-600 dark:text-blue-400 font-bold"
                  style={{ fontSize: `${chordFontSize}%` }}
                >
                  {part.slice(1, -1)}
                </span>
              );
            }
            return <span key={pIdx}>{part}</span>;
          })}
        </div>
      );
    });
    setFormattedContent(nodes);
  }, [song.content, transpose, notation, chordFontSize, showCapo]);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col">
      <div 
        ref={containerRef}
        className={`selectable-text flex-1 touch-scrolling p-1 md:p-2 ${isFullscreen ? 'p-0.5 md:p-1' : ''} overflow-y-auto overflow-x-hidden`}
        style={{ fontSize: `${currentFontSize}px` }}
      >
        <div ref={headerRef} className="mb-1 flex justify-between items-start shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {(song.key || song.tempo) && (
                <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">
                  {song.key && <span>{song.key}</span>}
                  {song.key && song.tempo && <span className="opacity-30">|</span>}
                  {song.tempo && <span>{song.tempo} BPM</span>}
                </div>
              )}
            </div>
          </div>

        </div>
        
        <div 
          ref={contentRef}
          className="gap-4"
          style={{ 
            columnCount: currentColumns,
            columnGap: '1rem',
            columnRule: '1px solid rgba(0,0,0,0.05)',
            fontSize: `${currentFontSize}px`,
            height: 'auto',
            columnFill: 'balance',
            width: '100%',
            minWidth: '100%'
          }}
        >
          {formattedContent}
        </div>
      </div>

    </div>
  );
};
