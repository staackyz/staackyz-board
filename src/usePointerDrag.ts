import { ref, type Ref } from 'vue';

// Pointer events instead of native DnD, whose Windows OLE path crashes a certain Edge build, and they also cover touch

export interface PointerDragHandlers {
    // Pixels before a press becomes a drag, so a click still reads as a click
    threshold?: number;
    // Touch only, with 0 the finger drags at once and swiping to the next column takes the card along
    holdDelay?: number;
    // Must stay under the browser slop for scrolling, otherwise the page scrolls before the hold lands
    holdTolerance?: number;
    onStart?: (el: HTMLElement) => void;
    onMove?: (x: number, y: number) => void;
    onDrop?: () => void;
    onCancel?: () => void;
    onClick?: () => void;
    ghost?: (el: HTMLElement) => HTMLElement | null;
    ghostOffset?: { x: number; y: number };
}

const dragSettings = (event: PointerEvent, handlers: PointerDragHandlers) => ({
    threshold: handlers.threshold ?? 5,
    offset: handlers.ghostOffset ?? { x: 0, y: 0 },
    // On touch, moving the finger is scrolling and dragging is holding still
    holdDelay: event.pointerType === 'mouse' ? 0 : (handlers.holdDelay ?? 0),
    tolerance: handlers.holdTolerance ?? 8,
});

const styleGhost = (el: HTMLElement) => {
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '9999';
    el.style.margin = '0';
};

const moveGhost = (el: HTMLElement | null, left: number, top: number) => {
    if (!el) return;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
};

// The floating copy that follows the pointer, built by the caller and owned from here on
const ghostLayer = (offset: { x: number; y: number }) => {
    let ghostEl: HTMLElement | null = null;

    return {
        place: (x: number, y: number) => moveGhost(ghostEl, x - offset.x, y - offset.y),
        show: (built: HTMLElement | null | undefined) => {
            if (!built) return;

            styleGhost(built);
            document.body.appendChild(built);
            ghostEl = built;
        },
        remove: () => {
            ghostEl?.remove();
            ghostEl = null;
        },
    };
};

interface DragContext {
    el: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    settings: ReturnType<typeof dragSettings>;
    handlers: PointerDragHandlers;
    dragging: Ref<boolean>;
    ghost: ReturnType<typeof ghostLayer>;
    state: { started: boolean; holdTimer: ReturnType<typeof setTimeout> | null; lastX: number; lastY: number };
    // Only touchmove is cancelable, so this is the one place a drag can stop the page from scrolling
    blockScroll: (e: TouchEvent) => void;
}

const dragContext = (event: PointerEvent, handlers: PointerDragHandlers, dragging: Ref<boolean>): DragContext => {
    const settings = dragSettings(event, handlers);

    return {
        el: event.currentTarget as HTMLElement,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        settings,
        handlers,
        dragging,
        ghost: ghostLayer(settings.offset),
        state: { started: false, holdTimer: null, lastX: event.clientX, lastY: event.clientY },
        blockScroll: (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
        },
    };
};

const stopHold = (ctx: DragContext) => {
    if (ctx.state.holdTimer !== null) clearTimeout(ctx.state.holdTimer);

    ctx.state.holdTimer = null;
};

const releaseCapture = (ctx: DragContext) => {
    try {
        ctx.el.releasePointerCapture(ctx.pointerId);
    } catch {
        /* ignore */
    }
};

const beginDrag = (ctx: DragContext, x: number, y: number) => {
    ctx.state.started = true;
    ctx.dragging.value = true;
    ctx.handlers.onStart?.(ctx.el);
    ctx.ghost.show(ctx.handlers.ghost?.(ctx.el));
    document.addEventListener('touchmove', ctx.blockScroll, { passive: false });
    ctx.ghost.place(x, y);
    ctx.handlers.onMove?.(x, y);
};

// Born from holding still: still waiting for the hold, so moving now belongs to the browser scroll and the drag never starts
const holdGesture = (ctx: DragContext, e: PointerEvent, detach: () => void) => {
    const dx = Math.abs(e.clientX - ctx.startX);
    const dy = Math.abs(e.clientY - ctx.startY);

    if (dx > ctx.settings.tolerance || dy > ctx.settings.tolerance) detach();
};

// Born from distance: a mouse (or any pointer with no hold) becomes a drag once it moves past the threshold
const distanceGesture = (ctx: DragContext, e: PointerEvent) => {
    const dx = Math.abs(e.clientX - ctx.startX);
    const dy = Math.abs(e.clientY - ctx.startY);

    if (dx < ctx.settings.threshold && dy < ctx.settings.threshold) return;
    beginDrag(ctx, e.clientX, e.clientY);
};

const dragMover = (ctx: DragContext, detach: () => void) => (e: PointerEvent) => {
    const { state, settings } = ctx;

    state.lastX = e.clientX;
    state.lastY = e.clientY;

    if (state.started) {
        ctx.ghost.place(e.clientX, e.clientY);
        ctx.handlers.onMove?.(e.clientX, e.clientY);
        return;
    }

    if (settings.holdDelay > 0) holdGesture(ctx, e, detach);
    else distanceGesture(ctx, e);
};

const dragFinisher = (ctx: DragContext, detach: () => void) => (dropped: boolean) => {
    detach();
    ctx.ghost.remove();
    ctx.dragging.value = false;

    // A cancel before the drag starts is not a click, it is the browser taking the gesture for scrolling
    if (!ctx.state.started) {
        if (dropped) ctx.handlers.onClick?.();
    } else if (dropped) {
        ctx.handlers.onDrop?.();
    } else {
        ctx.handlers.onCancel?.();
    }
};

interface DragListeners {
    move: (e: PointerEvent) => void;
    up: () => void;
    cancel: () => void;
}

const listenForDrag = (ctx: DragContext, on: DragListeners) => {
    try {
        ctx.el.setPointerCapture(ctx.pointerId);
    } catch {
        // Without capture the drag still works while the cursor stays inside the element
    }

    ctx.el.addEventListener('pointermove', on.move);
    ctx.el.addEventListener('pointerup', on.up);
    ctx.el.addEventListener('pointercancel', on.cancel);

    if (ctx.settings.holdDelay > 0) {
        ctx.state.holdTimer = setTimeout(() => {
            ctx.state.holdTimer = null;
            // The card lifts on the hold itself so the finger sees it was picked up before moving
            navigator.vibrate?.(10);
            beginDrag(ctx, ctx.state.lastX, ctx.state.lastY);
        }, ctx.settings.holdDelay);
    }
};

const startDrag = (event: PointerEvent, handlers: PointerDragHandlers, dragging: Ref<boolean>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const ctx = dragContext(event, handlers, dragging);

    const detach = () => {
        stopHold(ctx);
        ctx.el.removeEventListener('pointermove', move);
        ctx.el.removeEventListener('pointerup', up);
        ctx.el.removeEventListener('pointercancel', cancel);
        document.removeEventListener('touchmove', ctx.blockScroll);
        releaseCapture(ctx);
    };

    const move = dragMover(ctx, detach);
    const finish = dragFinisher(ctx, detach);
    const up = () => finish(true);
    const cancel = () => finish(false);

    listenForDrag(ctx, { move, up, cancel });
};

export function usePointerDrag() {
    const dragging = ref(false);

    return { dragging, start: (event: PointerEvent, handlers: PointerDragHandlers) => startDrag(event, handlers, dragging) };
}
