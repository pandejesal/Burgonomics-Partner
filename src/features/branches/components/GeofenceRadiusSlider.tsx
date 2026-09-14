import React from 'react';
import { Bike, Navigation, MapPin } from 'lucide-react';

interface GeofenceRadiusSliderProps {
  radiusKm: number;
  onChange: (radiusKm: number) => void;
  coordinates?: { lat: number; lng: number };
  disabled?: boolean;
}

export function GeofenceRadiusSlider({
  radiusKm,
  onChange,
  coordinates = { lat: 21.1959, lng: 72.7933 },
  disabled = false,
}: GeofenceRadiusSliderProps) {
  // Estimated area and delivery time
  const areaSqKm = (Math.PI * Math.pow(radiusKm, 2)).toFixed(1);
  const estimatedMaxTimeMins = Math.round(15 + radiusKm * 2.5);

  return (
    <div className="space-y-3 p-4 bg-[#0A0A0A] border border-[#1E3A24] rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
            <Bike className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Delivery Geofence Catchment</h4>
            <p className="text-[10px] text-zinc-400">
              Defines maximum direct customer checkout radius
            </p>
          </div>
        </div>

        <div className="text-right font-mono">
          <span className="text-base font-black text-[#4ADE80]">{radiusKm.toFixed(1)}</span>
          <span className="text-xs text-zinc-400 ml-1">km</span>
        </div>
      </div>

      {/* Slider Input */}
      <div className="space-y-1.5 pt-1">
        <input
          type="range"
          min="1"
          max="20"
          step="0.5"
          value={radiusKm}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-[#112415] rounded-lg appearance-none cursor-pointer accent-[#FF6600] disabled:opacity-50"
        />
        <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
          <span>1.0 km (Hyperlocal)</span>
          <span>10.0 km (Standard)</span>
          <span>20.0 km (Metro Wide)</span>
        </div>
      </div>

      {/* Geofence Metrics Banner */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1E3A24]/60 text-[10px]">
        <div className="flex items-center gap-1.5 text-zinc-300">
          <Navigation className="w-3.5 h-3.5 text-[#4ADE80]" />
          <span>Catchment Area: <strong className="text-white font-mono">{areaSqKm} km²</strong></span>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-300">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span className="truncate">Store Lat: {coordinates.lat.toFixed(4)}, Lng: {coordinates.lng.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

export default GeofenceRadiusSlider;
