"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Default center — Far East Russia (Vladivostok / Ussuri river area).
const DEFAULT_CENTER: [number, number] = [47.0, 134.0];
const DEFAULT_ZOOM = 8;

interface MapModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLat?: number;
  initialLon?: number;
  editable: boolean;
  onPick?: (lat: number, lon: number) => void;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function MapModal({
  open,
  onOpenChange,
  initialLat,
  initialLon,
  editable,
  onPick,
}: MapModalProps) {
  // Lat/lon are picked here, committed to parent on "Готово".
  const [lat, setLat] = useState<number>(initialLat ?? DEFAULT_CENTER[0]);
  const [lon, setLon] = useState<number>(initialLon ?? DEFAULT_CENTER[1]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<{
    setView: (lat: number, lon: number, zoom?: number) => void;
    remove: () => void;
  } | null>(null);
  const markerRef = useRef<{
    setLatLng: (lat: number, lon: number) => void;
  } | null>(null);

  // Reset coords when dialog opens with a new initial position.
  useEffect(() => {
    if (open) {
      setLat(initialLat ?? DEFAULT_CENTER[0]);
      setLon(initialLon ?? DEFAULT_CENTER[1]);
    }
  }, [open, initialLat, initialLon]);

  // Lazily import Leaflet only on client to avoid SSR `window` access.
  // Initialize map when dialog opens AND the container ref is ready.
  // Using a callback ref + state so the effect re-runs when the Portal
  // (used by Radix Dialog) actually mounts the container — `useRef` alone
  // would be null at the moment the [open] effect runs.
  useEffect(() => {
    if (!open || !container) return;
    let cancelled = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default as typeof import("leaflet");
        // CSS is needed; import on the client only.
        const cssId = "leaflet-css-link";
        if (!document.getElementById(cssId)) {
          const link = document.createElement("link");
          link.id = cssId;
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        // Give the browser one frame to apply CSS so tiles render correctly.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;

        // Clear any existing instance
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        container.innerHTML = "";

        const map = L.map(container, {
          center: [lat, lon] as [number, number],
          zoom: DEFAULT_ZOOM,
          zoomControl: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        // Custom marker (divIcon with pin SVG to avoid missing default marker images).
        const makeIcon = () =>
          L.divIcon({
            className: "fish-map-pin",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50% 50% 50% 0;background:#2d5a3d;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:translate(-4px,-8px)"><span style="color:#fff;font-size:18px;line-height:1">📍</span></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          });

        const marker = L.marker([lat, lon] as [number, number], {
          icon: makeIcon(),
          draggable: editable,
        }).addTo(map);

        // Click on map → move marker
        if (editable) {
          map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
            const newLat = e.latlng.lat;
            const newLon = e.latlng.lng;
            marker.setLatLng([newLat, newLon]);
            setLat(newLat);
            setLon(newLon);
          });
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            setLat(pos.lat);
            setLon(pos.lng);
          });
        }

        // Fix: invalidateSize after a frame so map tiles fill the container
        // (Radix Dialog animates open, dimensions may be 0 at first paint).
        setTimeout(() => map.invalidateSize(), 100);

        // Expose minimal API for setting view externally (search results).
        mapRef.current = {
          setView: (newLat, newLon, zoom = 13) => {
            map.setView([newLat, newLon], zoom);
            marker.setLatLng([newLat, newLon]);
            setLat(newLat);
            setLon(newLon);
          },
          remove: () => map.remove(),
        };
        markerRef.current = {
          setLatLng: (newLat, newLon) => {
            marker.setLatLng([newLat, newLon]);
            setLat(newLat);
            setLon(newLon);
          },
        };
      } catch (e) {
        // Failed to load leaflet — not fatal.
        console.error("Leaflet init failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, container]);

  // Nominatim search.
  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        { headers: { "Accept-Language": "ru" } },
      );
      if (!r.ok) throw new Error("Nominatim " + r.status);
      const data = (await r.json()) as NominatimResult[];
      setSearchResults(data);
    } catch {
      // Probably DNS failure in sandbox — show empty list.
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r: NominatimResult) {
    const la = parseFloat(r.lat);
    const lo = parseFloat(r.lon);
    if (Number.isNaN(la) || Number.isNaN(lo)) return;
    // Update React state directly (independent of mapRef closure staleness).
    setLat(la);
    setLon(lo);
    // Also pan the map + move the marker if mapRef is initialised.
    mapRef.current?.setView(la, lo, 13);
    setSearchResults([]);
    setSearchQ(r.display_name.split(",")[0]);
  }

  const { toast } = useToast();

  function confirm() {
    if (onPick) onPick(lat, lon);
    toast({ title: "Координаты выбраны", description: `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            {editable ? "Выбор места на карте" : "Место на карте"}
          </DialogTitle>
          <DialogDescription>
            {editable
              ? "Найдите место по названию или нажмите на карту, чтобы поставить маркер."
              : "Просмотр места на карте."}
          </DialogDescription>
        </DialogHeader>

        {/* Search box */}
        {editable && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                placeholder="Например: Уссури"
                className="h-10"
              />
              <Button onClick={runSearch} disabled={searching} size="sm" className="h-10 px-3">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchResults.length > 0 && (
              <ul className="rounded-lg border border-border bg-card overflow-hidden text-sm max-h-40 overflow-y-auto nice-scroll">
                {searchResults.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border last:border-b-0 truncate"
                      onClick={() => selectResult(r)}
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searching && <div className="text-xs text-muted-foreground">Поиск…</div>}
          </div>
        )}

        {/* Map container */}
        <div
          ref={setContainer}
          className="w-full h-72 rounded-lg border border-border overflow-hidden bg-muted"
          aria-label="Карта"
        />

        {/* Coords display */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 text-xs">
          <span className="text-muted-foreground">Широта:</span>
          <span className="font-medium tabular-nums">{lat.toFixed(5)}</span>
          <span className="text-muted-foreground ml-3">Долгота:</span>
          <span className="font-medium tabular-nums">{lon.toFixed(5)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Закрыть
          </Button>
          {editable && (
            <Button onClick={confirm}>
              Готово
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
