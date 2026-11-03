/** Placing a card lands it between the neighbours the person sees, and the app is the one that saves it. Runs via `npm test`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnMoves, midpoint } from '../src/columnMoves.ts';

const card = (id, column, position) => ({ id, column, position });

const board = (cards) => {
    const placed = [];
    const moves = columnMoves({
        columns: () => ({
            todo: cards.filter((c) => c.column === 'todo'),
            doing: cards.filter((c) => c.column === 'doing'),
            done: cards.filter((c) => c.column === 'done'),
        }),
        keys: () => ['todo', 'doing', 'done'],
        columnOf: (c) => c.column,
        place: (move) => placed.push(move),
    });

    return { moves, placed };
};

describe('midpoint', () => {
    it('sits between two neighbours, past the last one or before the first one', () => {
        assert.equal(midpoint({ id: 1, position: 2 }, { id: 2, position: 4 }), 3);
        assert.equal(midpoint({ id: 1, position: 2 }, null), 3);
        assert.equal(midpoint(null, { id: 2, position: 4 }), 3);
        assert.equal(midpoint(null, null), 1);
    });
});

describe('columnMoves', () => {
    const a = card(1, 'todo', 1);
    const b = card(2, 'todo', 2);
    const c = card(3, 'todo', 3);
    const d = card(4, 'doing', 10);

    it('hands the app the neighbours and the position, leaving the moved card out of its own column', () => {
        const { moves, placed } = board([a, b, c, d]);
        moves.moveTo(a, 'todo', 1);

        assert.deepEqual(placed, [{ card: a, toKey: 'todo', position: 2.5, after: b, before: c }]);
    });

    it('clamps an index past the end to the bottom of the column', () => {
        const { moves, placed } = board([a, b, c, d]);
        moves.moveTo(a, 'doing', 9);

        assert.deepEqual(placed[0], { card: a, toKey: 'doing', position: 11, after: d, before: null });
    });

    it('moves sideways to the top of the next column and stops at the edges', () => {
        const { moves, placed } = board([a, b, c, d]);
        moves.sideways(b, 1);
        moves.sideways(b, -1);

        assert.equal(placed.length, 1);
        assert.deepEqual(placed[0], { card: b, toKey: 'doing', position: 9, after: null, before: d });
    });

    it('nudges inside the column and never past its ends', () => {
        const { moves, placed } = board([a, b, c, d]);
        moves.nudge(a, -1);
        moves.nudge(c, 1);
        moves.nudge(c, -1);

        assert.equal(placed.length, 1);
        assert.equal(placed[0].toKey, 'todo');
        assert.equal(placed[0].position, 1.5);
        assert.equal(moves.indexIn(c), 2);
    });
});
