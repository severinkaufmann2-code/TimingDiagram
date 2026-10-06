/** Turning pixel positions on the timeline into times and moments, with snapping. */

import { anchorAt } from '../model/moments';
import { clamp, niceStep, snapTo } from '../model/numbers';
import type { Anchor, Doc } from '../model/types';
import type { Layout } from '../render/layout';

/** How close, in pixels, the pointer has to be to a transition point to mean that point. */
export const SNAP_DISTANCE = 7;

/** The time a pixel position stands for, on the snap grid unless `free`. */
export function timeAtPixel(doc: Doc, layout: Layout, x: number, free: boolean): number {
  const grid = doc.time.snap > 0 && !free ? doc.time.snap : niceStep(1 / layout.scale) / 10;
  return clamp(snapTo(layout.time(x), grid), doc.time.start, doc.time.end);
}

/**
 * The moment a pixel position stands for: the transition point when one is
 * near, otherwise the time on the snap grid. With `free`, nothing snaps.
 */
export function momentAtPixel(doc: Doc, layout: Layout, x: number, free: boolean): Anchor {
  if (!free) {
    let nearest: { pointId: string; distance: number } | null = null;
    for (const marker of layout.markers) {
      const distance = Math.abs(marker.x - x);
      if (distance <= SNAP_DISTANCE && (!nearest || distance < nearest.distance)) nearest = { pointId: marker.pointId, distance };
    }
    if (nearest) return { point: nearest.pointId };
  }
  return anchorAt(doc, timeAtPixel(doc, layout, x, free));
}
