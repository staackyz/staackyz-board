import type { ColumnCard } from './useColumnDrag';

/** A card that keeps its place in the column by a number, so a move only writes the moved card */
export interface PositionedCard extends ColumnCard {
    position: number;
}

/** Where a move lands, with the visible neighbours the app hands its server so both sides compute the same place */
export interface ColumnMove<T extends PositionedCard, K extends string = string> {
    card: T;
    toKey: K;
    position: number;
    after: T | null;
    before: T | null;
}

export interface ColumnMovesSource<T extends PositionedCard, K extends string = string> {
    /** The cards each column shows, in the order the person sees them */
    columns: () => Record<string, T[]>;
    /** The column keys from left to right */
    keys: () => K[];
    columnOf: (card: T) => K;
    /** The app applies the move to its local copy and saves it, the board never writes anywhere by itself */
    place: (move: ColumnMove<T, K>) => void;
}

// Between the two neighbours, the same midpoint the server computes, so the card does not jump when the answer lands
export const midpoint = (after: PositionedCard | null, before: PositionedCard | null) =>
    after && before ? (after.position + before.position) / 2 : after ? after.position + 1 : before ? before.position - 1 : 1;

/** Every move, so a drag, a key press and a menu land the card the same way */
export function columnMoves<T extends PositionedCard, K extends string = string>(source: ColumnMovesSource<T, K>) {
    /** Lands the card at that index of what the person sees in the column */
    const moveTo = (card: T, toKey: K, index: number) => {
        const column = (source.columns()[toKey] ?? []).filter((other) => other.id !== card.id);
        const at = Math.max(0, Math.min(index, column.length));
        const [after, before] = [column[at - 1] ?? null, column[at] ?? null];

        source.place({ card, toKey, position: midpoint(after, before), after, before });
    };

    const indexIn = (card: T) => (source.columns()[source.columnOf(card)] ?? []).findIndex((other) => other.id === card.id);

    /** One column to the side, landing at the top so the card stays in sight */
    const sideways = (card: T, step: -1 | 1) => {
        const keys = source.keys();
        const next = keys[keys.indexOf(source.columnOf(card)) + step];
        if (next) moveTo(card, next, 0);
    };

    /** One slot up or down inside its column */
    const nudge = (card: T, step: -1 | 1) => {
        const key = source.columnOf(card);
        const target = indexIn(card) + step;
        if (indexIn(card) >= 0 && target >= 0 && target < (source.columns()[key]?.length ?? 0)) moveTo(card, key, target);
    };

    return { moveTo, indexIn, sideways, nudge };
}
