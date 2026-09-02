import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Zap, ZapOff } from 'lucide-react';
import { motion } from 'motion/react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const html5QrCode = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Initializing with low level library for custom UI
    html5QrCode.current = new Html5Qrcode('qr-reader-engine');
    
    const startScanner = async () => {
      try {
        await html5QrCode.current?.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // El recuadro visible es min(70vmin, 280px): si el área real de
            // escaneo queda fija en 250px, el usuario apunta a un marco que no
            // coincide con lo que la cámara mira. Se calcula igual, y se deja
            // que la relación de aspecto la ponga el dispositivo en vez de
            // forzar 1:1 sobre un contenedor apaisado.
            qrbox: () => {
              const side = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.7);
              const clamped = Math.max(160, Math.min(side, 280));
              return { width: clamped, height: clamped };
            },
          },
          (decodedText) => {
            let finalId = decodedText;
            if (decodedText.includes('join=')) {
              finalId = decodedText.split('join=')[1].split('&')[0];
            }
            onScan(finalId);
            stopScanner();
          },
          () => {} // silent failure for frame misses
        );
        setIsCameraReady(true);
      } catch (err: any) {
        console.error("Camera access error:", err);
        setHasError(err.message || "Could not access camera");
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, [onScan]);

  const stopScanner = async () => {
    if (html5QrCode.current && html5QrCode.current.isScanning) {
      try {
        await html5QrCode.current.stop();
        html5QrCode.current.clear();
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  const toggleFlash = async () => {
    if (!html5QrCode.current) return;
    try {
      const state = !isFlashOn;
      await html5QrCode.current.applyVideoConstraints({
        // @ts-ignore - torch is not in standard types but supported by many browsers
        advanced: [{ torch: state }]
      });
      setIsFlashOn(state);
    } catch (err) {
      console.warn("Flash not supported on this device/browser");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden"
    >
      {/* Viewport for camera - Full Screen */}
      <div id="qr-reader-engine" className="absolute inset-0 pointer-events-none" />

      {/* Modern Overlay UI */}
      <div className="relative flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Camera className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold leading-tight">Escáner de Sesión</h3>
              <p className="text-white/50 text-[10px] uppercase tracking-widest font-bold">Modo P2P</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Framing Area */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Scoped Area (Darkness around central square) */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]">
            {/* The transparent "hole" for scanning */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70vmin,280px)] h-[min(70vmin,280px)] bg-transparent border-none shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)] rounded-2xl md:rounded-3xl" />
          </div>

          <div className="relative w-[min(70vmin,280px)] h-[min(70vmin,280px)]">
            {/* Animated Scanning Line */}
            {isCameraReady && (
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute left-2 right-2 h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] z-10 rounded-full"
              />
            )}

            {/* Corner Markers */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
            </div>

            {!isCameraReady && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <p className="text-red-400 font-bold mb-2">Error de Cámara</p>
                <p className="text-white/60 text-xs">{hasError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer info/controls */}
        <div className="p-4 sm:p-10 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-6 z-10">
          <p className="text-white font-medium text-sm text-center">Point your camera at the Director's QR code</p>
          
          <div className="flex items-center gap-4">
            <button
              onClick={toggleFlash}
              className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10"
            >
              {isFlashOn ? <ZapOff size={24} className="text-yellow-400" /> : <Zap size={24} />}
            </button>
            <div className="h-10 w-px bg-white/20 mx-2" />
            <div className="px-6 py-3 bg-blue-600/20 backdrop-blur-md border border-blue-500/30 rounded-2xl">
              <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">Escaneando...</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
