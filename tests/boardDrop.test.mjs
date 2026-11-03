/** A wide maintainer column lays its cards side by side, so the drop slot is read left to right, row by row, and a one card wide column keeps the vertical ruler with its hysteresis. Runs via `npm test`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveGridDropIndex, resolveZoneDropIndex } from '../src/boardDrop.ts';

const card = (id, left, top) => ({ id, left, top, width: 200, height: 100, middle: top + 50 });

// Two rows of three, 10px gaps
const grid = [card(1, 0, 0), card(2, 210, 0), card(3, 420, 0), card(4, 0, 110), card(5, 210, 110)];

describe('cards side by side', () => {
    it('lands before the card whose left half is under the pointer', () => {
        assert.equal(resolveGridDropIndex(grid, 50, 50), 0);
        assert.equal(resolveGridDropIndex(grid, 150, 50), 1);
        assert.equal(resolveGridDropIndex(grid, 300, 50), 1);
        assert.equal(resolveGridDropIndex(grid, 520, 50), 3);
    });

    it('moves to the next row once the pointer is below the first one', () => {
        assert.equal(resolveGridDropIndex(grid, 50, 160), 3);
        assert.equal(resolveGridDropIndex(grid, 350, 160), 5);
        assert.equal(resolveGridDropIndex(grid, 50, 400), 5);
    });
});

describe('picking the ruler', () => {
    it('reads the grid when the cards sit side by side', () => {
        assert.equal(resolveZoneDropIndex(grid, 150, 50, null), 1);
    });

    it('keeps the vertical ruler for a single card wide column', () => {
        const column = [card(1, 0, 0), card(2, 0, 110), card(3, 0, 220)];

        assert.equal(resolveZoneDropIndex(column, 190, 40, null), 0);
        assert.equal(resolveZoneDropIndex(column, 190, 70, null), 1);
        assert.equal(resolveZoneDropIndex(column, 10, 300, null), 3);
    });
});
