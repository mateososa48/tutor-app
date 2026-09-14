import { OverlayUtil, type TLOverlay } from "@tldraw/editor";

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

      if (name) this.drawNameTag(ctx, name, color);
      ctx.restore();
    }
  }

  private drawNameTag(ctx: CanvasRenderingContext2D, name: string, color: string) {
    const { fontSize } = this.options;
    ctx.font = `600 ${fontSize}px ${labelFont(this.editor.getContainer())}`;
    const w = Math.min(ctx.measureText(name).width, 120) + 12;
    const h = fontSize + 6;
    const x = 12;
    const y = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(name, x + 6, y + 3);
  }
}

function labelFont(container: HTMLElement): string {
  const ff = getComputedStyle(container).getPropertyValue("--tl-font-sans").trim();
  return ff && !ff.includes("var(") ? ff : "'tldraw_sans', sans-serif";
}
