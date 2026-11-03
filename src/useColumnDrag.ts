import { usePointerDrag, type PointerDragHandlers } from './usePointerDrag';
import { resolveDropIndex, type DropSlot } from './boardDrop';
import { computed, ref, shallowRef, type ComponentPublicInstance, type ComputedRef, type Ref, type ShallowRef } from 'vue';

/** A card the column board can lift, the order board and the sprint board both carry an id */
export interface ColumnCard {
    id: number;
}

export type ColumnEntry<T extends ColumnCard> = { key: string | number; item?: T };

export interface ColumnDrop<T extends ColumnCard> {
    item: T;
    fromKey: string;
    toKey: string;
    index: number;
}

export interface ColumnDragSource<T extends ColumnCard> {
    columns: () => Record<string, T[]>;
    /** Whether the card may land in that column, reordering inside its own column included */
    canDrop: (item: T, toKey: string, fromKey: string | null) => boolean;
    /** Called on release over a column, whoever owns the board decides what the drop means */
    drop: (drop: ColumnDrop<T>) => void;
    open: (item: T) => void;
    dragging?: (on: boolean) => void;
}

/** What a board hands its frame, the lifted card, the slot under the pointer and the handler that starts a lift */
export interface ColumnDrag<T extends ColumnCard> {
    dragging: ShallowRef<T | null>;
    dropTarget: Ref<{ status: string; index: number } | null>;
    dragHeight: Ref<number>;
    boardScroll: Ref<HTMLElement | null>;
    liftedId: ComputedRef<number | null>;
    canDropTo: (item: T, target: string) => boolean;
    columnEntries: (status: string) => ColumnEntry<T>[];
    onCardPointerDown: (item: T, sourceKey: string, event: PointerEvent) => void;
    /** A function ref for the sideways scroller, which the drag scrolls near its edges */
    setScroller: (el: Element | ComponentPublicInstance | null) => void;
}

interface DragState<T extends ColumnCard> {
    dragging: ShallowRef<T | null>;
    dragSourceKey: Ref<string | null>;
    dropTarget: Ref<{ status: string; index: number } | null>;
    dragHeight: Ref<number>;
    boardScroll: Ref<HTMLElement | null>;
    // Outside reactivity because it is only hysteresis memory and changes nothing on screen
    lastSlot: { at: { status: string; index: number } | null };
}

function dragState<T extends ColumnCard>(): DragState<T> {
    return {
        dragging: shallowRef<T | null>(null),
        dragSourceKey: ref<string | null>(null),
        dropTarget: ref<{ status: string; index: number } | null>(null),
        dragHeight: ref(96),
        boardScroll: ref<HTMLElement | null>(null),
        lastSlot: { at: null },
    };
}

interface DragContext<T extends ColumnCard> {
    state: DragState<T>;
    source: ColumnDragSource<T>;
    liftedId: ComputedRef<number | null>;
    canDropTo: (item: T, target: string) => boolean;
}

// Why slots come from offsetTop and not the screen rect: staackyz-cmms .claude/project-docs/context/motion/
function columnSlots<T extends ColumnCard>(cards: T[], liftedId: number | null, scroller: HTMLElement): DropSlot[] {
    const ids = new Set(cards.map((card) => card.id));
    if (liftedId !== null) ids.delete(liftedId);

    return [...scroller.querySelectorAll<HTMLElement>('[data-card-id]')]
        .map((cardEl) => ({
            id: Number(cardEl.dataset.cardId),
            middle: cardEl.offsetTop - scroller.offsetTop + cardEl.offsetHeight / 2,
            height: cardEl.offsetHeight,
        }))
        .filter((slot) => ids.has(slot.id));
}

const edgeScrollX = (box: HTMLElement | null, x: number) => {
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const edge = 60;
    if (x < rect.left + edge) box.scrollLeft -= 14;
    else if (x > rect.right - edge) box.scrollLeft += 14;
};

const edgeScrollY = (box: HTMLElement | null, y: number) => {
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const edge = 48;
    if (y < rect.top + edge) box.scrollTop -= 12;
    else if (y > rect.bottom - edge) box.scrollTop += 12;
};

// The gap exists from the first drag frame because it marks where the card came from
const setDropTarget = <T extends ColumnCard>(state: DragState<T>, status: string, index: number) => {
    if (state.dropTarget.value?.status === status && state.dropTarget.value.index === index) return;
    state.dropTarget.value = { status, index };
};

// The slot comes from the pointer against each card middle, since the old half of card rule flickered
function trackPointer<T extends ColumnCard>(ctx: DragContext<T>, x: number, y: number) {
    const { state, source, liftedId } = ctx;

    if (!state.dragging.value) return;
    edgeScrollX(state.boardScroll.value, x);

    const columnEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-column]');
    if (!columnEl) return;
    const status = columnEl.dataset.dropColumn!;
    const scroller = columnEl.querySelector<HTMLElement>('[data-column-scroll]');
    edgeScrollY(scroller, y);
    if (!scroller) return;

    // Pointer on the same ruler as the slots, in column content coordinates
    const pointer = y - scroller.getBoundingClientRect().top + scroller.scrollTop;
    // Hysteresis memory also holds on the origin slot, or the gap blinks under the dragged card
    const last = state.lastSlot.at;
    const current = last?.status === status ? last.index : null;

    // Slots already exclude the lifted card, so this index is the final one
    const index = resolveDropIndex(columnSlots(source.columns()[status] ?? [], liftedId.value, scroller), pointer, current);

    state.lastSlot.at = { status, index };
    setDropTarget(state, status, index);
}

function endDrag<T extends ColumnCard>(ctx: DragContext<T>) {
    ctx.state.dragging.value = null;
    ctx.state.dragSourceKey.value = null;
    ctx.state.dropTarget.value = null;
    ctx.state.lastSlot.at = null;
    ctx.source.dragging?.(false);
}

function dropCard<T extends ColumnCard>(ctx: DragContext<T>) {
    const item = ctx.state.dragging.value;
    const target = ctx.state.dropTarget.value;
    const fromKey = ctx.state.dragSourceKey.value;

    endDrag(ctx);

    if (!item || !target || !fromKey) return;

    ctx.source.drop({ item, fromKey, toKey: target.status, index: target.index });
}

function liftCard<T extends ColumnCard>(ctx: DragContext<T>, item: T, sourceKey: string, el: HTMLElement) {
    ctx.state.lastSlot.at = null;
    ctx.state.dragging.value = item;
    ctx.state.dragSourceKey.value = sourceKey;
    ctx.state.dragHeight.value = el.offsetHeight;
    ctx.source.dragging?.(true);
}

const ghostOf = (el: HTMLElement) => {
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText += `;width:${el.offsetWidth}px;transform:rotate(4deg);opacity:.85;box-shadow:0 12px 24px rgb(0 0 0 / .25);`;
    return ghost;
};

function dragHandlers<T extends ColumnCard>(ctx: DragContext<T>, item: T, sourceKey: string): PointerDragHandlers {
    return {
        ghostOffset: { x: 24, y: 20 },
        // On phones swiping over a card scrolls the board, so dragging needs a hold
        holdDelay: 200,
        onStart: (el) => liftCard(ctx, item, sourceKey, el),
        ghost: ghostOf,
        onMove: (x, y) => trackPointer(ctx, x, y),
        onDrop: () => dropCard(ctx),
        onCancel: () => endDrag(ctx),
        onClick: () => ctx.source.open(item),
    };
}

function columnEntries<T extends ColumnCard>(ctx: DragContext<T>, status: string): ColumnEntry<T>[] {
    const { state, source, liftedId, canDropTo } = ctx;
    const cards = source.columns()[status] ?? [];
    const entries: ColumnEntry<T>[] = cards.map((item) => ({ key: item.id, item }));
    const target = state.dropTarget.value;

    if (state.dragging.value && target?.status === status && canDropTo(state.dragging.value, status)) {
        // The lifted card is hidden but still in this list, so the slot shifts by one after it
        const lifted = status === state.dragSourceKey.value ? cards.findIndex((item) => item.id === liftedId.value) : -1;
        const at = lifted >= 0 && target.index >= lifted ? target.index + 1 : target.index;
        entries.splice(Math.min(at, entries.length), 0, { key: 'gap' });
    }

    return entries;
}

/** Cards in columns that lift, open a gap where they would land and drop between neighbours, the motion rules are in staackyz-cmms .claude/project-docs/context/motion/kanban-drag.md */
export function useColumnDrag<T extends ColumnCard>(source: ColumnDragSource<T>): ColumnDrag<T> {
    // Pointer events instead of the native browser drag and drop, so touch behaves the same
    const pointerDrag = usePointerDrag();
    const state = dragState<T>();
    const { dragging, dragSourceKey, dropTarget, dragHeight, boardScroll } = state;

    const canDropTo = (item: T, target: string) => source.canDrop(item, target, dragSourceKey.value);

    // Why the lifted card leaves the flow but not the DOM: staackyz-cmms .claude/project-docs/context/motion/
    const liftedId = computed(() =>
        dragging.value && dragSourceKey.value && canDropTo(dragging.value, dragSourceKey.value) ? dragging.value.id : null,
    );

    const ctx: DragContext<T> = { state, source, liftedId, canDropTo };
    const entriesOf = (status: string) => columnEntries(ctx, status);

    const onCardPointerDown = (item: T, sourceKey: string, event: PointerEvent) => {
        if ((event.target as HTMLElement).closest('button, a, input, label, [role="menu"], [data-no-drag]')) return;

        pointerDrag.start(event, dragHandlers(ctx, item, sourceKey));
    };

    const setScroller = (el: Element | ComponentPublicInstance | null) => {
        boardScroll.value = el instanceof HTMLElement ? el : null;
    };

    return { dragging, dropTarget, dragHeight, boardScroll, liftedId, canDropTo, columnEntries: entriesOf, onCardPointerDown, setScroller };
}
