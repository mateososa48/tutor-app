// Where the board's camera should go to show a rectangle (Sept 16 2026).
//
// focusOn used to call zoomToBounds (animated) and then, if the zoom it read
// back was below the readable 0.8, setCamera again. The read happened before
// the animation moved, and the second setCamera stopped the first one, so the
// camera zoomed in place instead of travelling to the item. One planned
// camera, set once, avoids that. Pure and unit-tested.

export type Rect = { x: number; y: number; w: number; h: number };
export type Camera = { x: number; y: number; z: number };

/**
 * The camera that shows `rect` in a viewport of `view` screen pixels: as close
 * to `maxZoom` as fits, never below `minZoom`. What fits is centred; a rect too
 * big for the view keeps its left and top edges on screen (a row never loses
 * its start). tldraw draws a page point at (point + camera) × zoom.
 */
export function planCamera(
  rect: Rect,
  view: { w: number; h: number },
  opts: { inset?: number; minZoom?: number; maxZoom?: number } = {},
): Camera {
  const inset = opts.inset ?? 0;
  const maxZoom = opts.maxZoom ?? 1;
  const minZoom = Math.min(opts.minZoom ?? 0.1, maxZoom);
  const fit = Math.min((view.w - 2 * inset) / Math.max(1, rect.w), (view.h - 2 * inset) / Math.max(1, rect.h));
  const z = Math.max(minZoom, Math.min(maxZoom, fit));
  const seenW = view.w / z;
  const seenH = view.h / z;
  const pad = inset / z;
  const left = rect.w + 2 * pad <= seenW ? rect.x + rect.w / 2 - seenW / 2 : rect.x - pad;
  const top = rect.h + 2 * pad <= seenH ? rect.y + rect.h / 2 - seenH / 2 : rect.y - pad;
  return { x: -left, y: -top, z };
}

/** The page rectangle a camera shows in a viewport. */
export function cameraView(camera: Camera, view: { w: number; h: number }): Rect {
  return { x: -camera.x, y: -camera.y, w: view.w / camera.z, h: view.h / camera.z };
}
