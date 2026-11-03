import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, Quad, RasterImage } from '@/lib/doc-scanner';
import { rasterToCanvas } from '@/lib/doc-scanner-canvas';

const LABELS = ['canto superior esquerdo', 'canto superior direito', 'canto inferior direito', 'canto inferior esquerdo'];

/**
 * Foto com os quatro cantos da folha arrastáveis (dedo, mouse ou setas do
 * teclado). As coordenadas do quadrilátero são as da imagem original; a tela
 * só escala para exibir.
 */
export function CornerEditor({ image, quad, onChange }: { image: RasterImage; quad: Quad; onChange: (quad: Quad) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const src = useMemo(() => rasterToCanvas(image).toDataURL('image/jpeg', 0.8), [image]);

  useEffect(() => {
    if (dragging === null) return;
    const move = (event: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = Math.min(image.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * image.width));
      const y = Math.min(image.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * image.height));
      const next = quad.map((p, i) => (i === dragging ? { x, y } : p)) as Quad;
      onChange(next);
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, image.height, image.width, onChange, quad]);

  function nudge(index: number, dx: number, dy: number) {
    const step = Math.max(image.width, image.height) / 100;
    const next = quad.map((p, i) => (i === index ? { x: Math.min(image.width, Math.max(0, p.x + dx * step)), y: Math.min(image.height, Math.max(0, p.y + dy * step)) } : p)) as Quad;
    onChange(next);
  }

  const handle = Math.max(image.width, image.height) / 40;
  const points = quad.map((p: Point) => `${p.x},${p.y}`).join(' ');
  return (
    <div className="relative mx-auto w-full max-w-xl touch-none select-none">
      <img src={src} alt="Foto da redação" className="block w-full rounded-xl" draggable={false} />
      <svg ref={svgRef} viewBox={`0 0 ${image.width} ${image.height}`} className="absolute inset-0 h-full w-full" role="group" aria-label="Cantos da folha">
        <polygon points={points} fill="rgba(255,193,7,0.18)" stroke="#FFC107" strokeWidth={handle / 4} />
        {quad.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={handle}
            fill="white"
            stroke="#1f2937"
            strokeWidth={handle / 5}
            tabIndex={0}
            role="slider"
            aria-label={`Ajustar ${LABELS[i]} (use as setas)`}
            aria-valuetext={`${Math.round((p.x / image.width) * 100)}% da largura, ${Math.round((p.y / image.height) * 100)}% da altura`}
            className="cursor-grab focus:outline-none"
            style={{ outline: 'none' }}
            onPointerDown={(event) => {
              event.preventDefault();
              setDragging(i);
            }}
            onKeyDown={(event) => {
              const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
              const d = delta[event.key];
              if (d) {
                event.preventDefault();
                nudge(i, d[0], d[1]);
              }
            }}
          />
        ))}
      </svg>
    </div>
  );
}
