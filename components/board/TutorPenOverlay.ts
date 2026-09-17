import { EASINGS, OverlayUtil, getSvgPathFromPoints, type TLOverlay, type TLScribble } from "@tldraw/editor";
import { getStroke } from "tldraw";

// The tutor's cursor is a pen, not an arrow. Replaces tldraw's collaborator
// cursor overlay (same `type`, so the default is swapped out) and draws the
// pen tip at the presence cursor with a small name tag.

export interface TLTutorPenOverlay extends TLOverlay {
  props: { x: number; y: number; color: string; name: string | null };
}

export class TutorPenOverlayUtil extends OverlayUtil<TLTutorPenOverlay> {
  static override type = "collaborator_cursor";
  override options = { zIndex: 1100, fontSize: 12 };

  override isActive(): boolean {
    return this.editor.getVisibleCollaboratorsOnCurrentPage().some((p) => !!p.cursor);
  }

  override getOverlays(): TLTutorPenOverlay[] {
    const out: TLTutorPenOverlay[] = [];
    for (const presence of this.editor.getVisibleCollaboratorsOnCurrentPage()) {
      const { cursor, color, userName, userId } = presence;
      if (!cursor) continue;
      out.push({
        id: `collaborator_cursor:${userId}`,
        type: "collaborator_cursor",
        props: { x: cursor.x, y: cursor.y, color, name: userName && userName !== "New User" ? userName : null },
      });
    }
    return out;
  }

  override render(ctx: CanvasRenderingContext2D, overlays: TLTutorPenOverlay[]): void {
    const zoom = this.editor.getZoomLevel();
    const scale = 1 / zoom;
    const viewport = this.editor.getViewportPageBounds();
    const margin = 24 / zoom;
    for (const overlay of overlays) {
      const { x, y, color, name } = overlay.props;
      if (x < viewport.minX - margin || y < viewport.minY - margin || x > viewport.maxX + margin || y > viewport.maxY + margin) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // A pen held at a writing angle: tip at the origin, body up and to the right.
      const bx = 15;
      const by = -19;
      ctx.strokeStyle = "rgba(20, 24, 40, 0.16)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(1.5, 1.5);
      ctx.lineTo(bx + 1.5, by + 1.5);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, -5);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // The tip: a dark cone from the body down to the point.
      ctx.fillStyle = "#1c1f2a";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(5.6, -1.2);
      ctx.lineTo(1.2, -5.6);
      ctx.closePath();
      ctx.fill();

      // A little dot where the pen touches the board.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();

      if (name) this.drawNameTag(ctx, name);
      ctx.restore();
    }
  }

  // The tag is a deeper blue than the sky pen: white text on #3d9cff is only 2.9:1.
  private drawNameTag(ctx: CanvasRenderingContext2D, name: string) {
    const { fontSize } = this.options;
    ctx.font = `600 ${fontSize}px ${labelFont(this.editor.getContainer())}`;
    const w = Math.min(ctx.measureText(name).width, 120) + 12;
    const h = fontSize + 6;
    const x = 12;
    const y = 8;
    ctx.fillStyle = NAME_TAG_BLUE;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(name, x + 6, y + 3);
  }
}

const NAME_TAG_BLUE = "#1d72dc";

export interface TLTutorScribbleOverlay extends TLOverlay {
  props: { scribble: TLScribble; color: string };
}

/**
 * The tutor's laser ring. Replaces tldraw's collaborator scribble overlay
 * (same `type`), which paints every collaborator scribble other than `laser`
 * at 10% alpha and ignores the scribble's own opacity: the ring was barely
 * visible and its fade did nothing. This one paints in the presence colour
 * (the sky pen) at the scribble's opacity.
 */
export class TutorScribbleOverlayUtil extends OverlayUtil<TLTutorScribbleOverlay> {
  static override type = "collaborator_scribble";
  override options = { zIndex: 800, streamline: 0.32 };

  override isActive(): boolean {
    return this.editor.getVisibleCollaboratorsOnCurrentPage().some((c) => c.scribbles.length > 0);
  }

  override getOverlays(): TLTutorScribbleOverlay[] {
    const out: TLTutorScribbleOverlay[] = [];
    for (const presence of this.editor.getVisibleCollaboratorsOnCurrentPage()) {
      for (const scribble of presence.scribbles) {
        out.push({ id: `collaborator_scribble:${presence.userId}:${scribble.id}`, type: "collaborator_scribble", props: { scribble, color: presence.color } });
      }
    }
    return out;
  }

  override render(ctx: CanvasRenderingContext2D, overlays: TLTutorScribbleOverlay[]): void {
    const zoom = this.editor.getZoomLevel();
    for (const overlay of overlays) {
      const { scribble, color } = overlay.props;
      const count = scribble.points.length;
      if (count === 0) continue;
      const stroke = getStroke(scribble.points, {
        size: scribble.size / zoom,
        start: { taper: scribble.taper, easing: EASINGS.linear },
        last: scribble.state === "complete" || scribble.state === "stopping",
        simulatePressure: false,
        streamline: this.options.streamline,
      });
      let d: string;
      if (stroke.length < 4) {
        const r = scribble.size / zoom / 2;
        const { x, y } = scribble.points[count - 1];
        d = `M ${x - r},${y} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0`;
      } else {
        d = getSvgPathFromPoints(stroke);
      }
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.max(0, Math.min(1, scribble.opacity ?? 1)) * 0.7;
      ctx.fill(new Path2D(d));
      ctx.globalAlpha = 1;
    }
  }
}

function labelFont(container: HTMLElement): string {
  const ff = getComputedStyle(container).getPropertyValue("--tl-font-sans").trim();
  return ff && !ff.includes("var(") ? ff : "'tldraw_sans', sans-serif";
}
