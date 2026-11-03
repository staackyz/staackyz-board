// Why the ruler must be layout position and never what is drawn on screen, staackyz-cmms .claude/project-docs/context/motion/

export interface DropSlot {
    id: number;
    /** Card middle in column content coordinates, not screen coordinates */
    middle: number;
    height: number;
}

/** Slack in px the pointer must clear past the middle before changing slot */
export const DROP_HYSTERESIS = 8;

/** Index from 0 to slots.length, with middles in ascending order */
export const resolveDropIndex = (slots: DropSlot[], pointer: number, current: number | null = null, hysteresis = DROP_HYSTERESIS): number => {
    let raw = 0;
    while (raw < slots.length && pointer > slots[raw].middle) raw++;

    if (current === null || current === raw || current < 0 || current > slots.length || hysteresis <= 0) return raw;

    // Going down the boundary is the middle of the card left behind, going up it is the one just below
    const boundary = raw > current ? slots[raw - 1].middle : slots[raw].middle;
    const crossed = raw > current ? pointer >= boundary + hysteresis : pointer <= boundary - hysteresis;

    return crossed ? raw : current;
};

export interface GridSlot extends DropSlot {
    /** Card left edge and top edge in zone content coordinates, same ruler as middle */
    left: number;
    top: number;
    width: number;
}

/** Cards side by side in a wide column are read left to right, row by row, so the slot is the first card the pointer sits before */
export const resolveGridDropIndex = (slots: GridSlot[], x: number, y: number): number => {
    const index = slots.findIndex((slot) => y < slot.top || (y <= slot.top + slot.height && x < slot.left + slot.width / 2));

    return index === -1 ? slots.length : index;
};

/** One card per row keeps the vertical ruler and its hysteresis, more than one reads the grid in order */
export const resolveZoneDropIndex = (slots: GridSlot[], x: number, y: number, current: number | null): number => {
    const sideBySide = slots.some((slot) => slot.left !== slots[0].left);

    return sideBySide ? resolveGridDropIndex(slots, x, y) : resolveDropIndex(slots, y, current);
};
