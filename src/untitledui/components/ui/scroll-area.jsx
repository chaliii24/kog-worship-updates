import * as React from "react";
import { cx } from "@/utils/cx";

// shadcn-style ScrollArea, implemented without Radix (this project has no
// Radix dependency). Native scrolling with the system scrollbar hidden and
// a custom rounded thumb overlaid on the track — visually the same as the
// shadcn component. Also sets `data-has-overflow-x` / `data-has-overflow-y`
// on the root so Tailwind's `data-has-overflow-*:` variants can adjust
// padding when a bar is showing.
//
// ScrollBar is rendered automatically for whichever axis overflows, so the
// usual `<ScrollArea>…</ScrollArea>` usage needs no children. Standalone
// `<ScrollBar />` outside a ScrollArea renders nothing (no context).

const ScrollAreaContext = React.createContext(null);

function ScrollArea({ className, style, children, overflowX = true, ...props }) {
  const viewportRef = React.useRef(null);
  const [overflow, setOverflow] = React.useState({ x: false, y: false });

  const measure = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const y = el.scrollHeight - el.clientHeight > 1;
    const x = el.scrollWidth - el.clientWidth > 1;
    // Equality bail-out: returning the same object skips the re-render,
    // so this is safe to call after every commit and on every scroll tick.
    setOverflow((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
  }, []);

  // Re-check after every commit (content added/removed by the parent),
  // plus live tracking for scroll and size changes.
  React.useEffect(() => { measure(); });
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [measure]);

  return (
    <ScrollAreaContext.Provider value={viewportRef}>
      <div
        {...props}
        data-has-overflow-x={overflow.x ? "" : undefined}
        data-has-overflow-y={overflow.y ? "" : undefined}
        className={cx("relative", className)}
        style={style}
      >
        <div
          className={cx(
            "h-full w-full scrollbar-hide",
            overflowX ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
          )}
          ref={viewportRef}
        >
          {children}
        </div>
        {overflow.y && <ScrollBar orientation="vertical" />}
        {overflow.x && <ScrollBar orientation="horizontal" />}
      </div>
    </ScrollAreaContext.Provider>
  );
}

function ScrollBar({ orientation = "vertical", className, ...props }) {
  const viewportRef = React.useContext(ScrollAreaContext);
  const trackRef = React.useRef(null);
  const thumbRef = React.useRef(null);
  const vertical = orientation !== "horizontal";

  React.useLayoutEffect(() => {
    const el = viewportRef?.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!el || !track || !thumb) return undefined;

    // Geometry is written straight to the thumb's style — never through
    // state — so scrolling doesn't re-render the tree.
    const sync = () => {
      const content = vertical ? el.scrollHeight : el.scrollWidth;
      const view = vertical ? el.clientHeight : el.clientWidth;
      const trackSize = vertical ? track.clientHeight : track.clientWidth;
      if (content <= view + 1 || trackSize <= 0) return;
      const size = Math.max(24, Math.round((view / content) * trackSize));
      const maxScroll = content - view;
      const scrolled = vertical ? el.scrollTop : el.scrollLeft;
      const pos = maxScroll > 0 ? Math.round((scrolled / maxScroll) * (trackSize - size)) : 0;
      if (vertical) {
        thumb.style.height = `${size}px`;
        thumb.style.transform = `translateY(${pos}px)`;
      } else {
        thumb.style.width = `${size}px`;
        thumb.style.transform = `translateX(${pos}px)`;
      }
    };

    const onPointerDown = (e) => {
      e.preventDefault();
      const start = vertical ? e.clientY : e.clientX;
      const startScroll = vertical ? el.scrollTop : el.scrollLeft;
      thumb.setAttribute("data-dragging", "1");
      const onMove = (ev) => {
        const delta = (vertical ? ev.clientY : ev.clientX) - start;
        const content = vertical ? el.scrollHeight : el.scrollWidth;
        const view = vertical ? el.clientHeight : el.clientWidth;
        const trackSize = vertical ? track.clientHeight : track.clientWidth;
        const size = Math.max(24, (view / content) * trackSize);
        const travel = trackSize - size;
        if (travel <= 0) return;
        const next = startScroll + (delta / travel) * (content - view);
        if (vertical) el.scrollTop = next;
        else el.scrollLeft = next;
      };
      const onUp = () => {
        thumb.removeAttribute("data-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    sync();
    el.addEventListener("scroll", sync, { passive: true });
    thumb.addEventListener("pointerdown", onPointerDown);
    const ro = new ResizeObserver(sync);
    ro.observe(track);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", sync);
      thumb.removeEventListener("pointerdown", onPointerDown);
      ro.disconnect();
    };
  }, [viewportRef, vertical]);

  return (
    <div
      {...props}
      ref={trackRef}
      className={cx(
        "pointer-events-none absolute",
        vertical ? "right-1 top-0 bottom-0 w-2" : "left-0 right-0 bottom-1 h-2",
        className
      )}
    >
      <div ref={thumbRef} className="kog-sa-thumb" />
    </div>
  );
}

export { ScrollArea, ScrollBar };
