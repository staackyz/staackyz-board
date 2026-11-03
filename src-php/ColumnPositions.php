<?php

namespace Staackyz\Board;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Order inside a column is a float between two neighbours, read from the database so a stale screen cannot place a card
 * wrong. The app hands the query of one column, the board knows no table. It is the midpoint columnMoves draws on screen.
 *
 * @template TModel of Model
 */
final class ColumnPositions
{
    /** Below this two neighbours are too close to split again, and the column gets whole numbers back */
    private const MIN_GAP = 0.000001;

    /**
     * @param  Closure(string): Builder<TModel>  $column  the cards of that column, already narrowed to what the board shows
     * @param  string  $field  the float column that holds the order
     */
    public function __construct(private Closure $column, private string $field = 'position') {}

    /** Newest first, a card created or moved in without a chosen place lands above every other card of its column */
    public function topOf(string $key, ?int $selfId = null): float
    {
        return ColumnTop::above($this->others($key, $selfId), $this->field, 1);
    }

    /** Call it inside the transaction that saves the card, so the lock on the column holds until the write */
    public function between(string $key, ?int $afterId, ?int $beforeId, int $selfId): float
    {
        $column = $this->rows($key, $selfId);
        [$previous, $next] = $this->neighbours($column, $afterId, $beforeId);

        if ($previous !== null && $next !== null && abs($next - $previous) < self::MIN_GAP) {
            $this->renumber($key, $column);
            [$previous, $next] = $this->neighbours($this->rows($key, $selfId), $afterId, $beforeId);
        }

        return match (true) {
            $previous !== null && $next !== null => ($previous + $next) / 2,
            $previous !== null => $previous + 1,
            $next !== null => $next - 1,
            default => 1,
        };
    }

    /** @return Builder<TModel> */
    private function others(string $key, ?int $selfId): Builder
    {
        $query = ($this->column)($key);

        return $selfId === null ? $query : $query->whereKeyNot($selfId);
    }

    /** @return list<array{id: int, position: float}> */
    private function rows(string $key, int $selfId): array
    {
        $query = $this->others($key, $selfId);
        $id = $query->getModel()->getKeyName();

        // Locked so two moves into the same column cannot read the same gap
        return $query->orderBy($this->field)->orderBy($id)
            ->lockForUpdate()
            ->get([$id, $this->field])
            ->map(fn (Model $card) => ['id' => (int) $card->getKey(), 'position' => (float) $card->getAttribute($this->field)])
            ->values()
            ->all();
    }

    /**
     * Placing after a card wins, since that is what the person saw above the gap, and with no card above it goes before the one below.
     *
     * @param  list<array{id: int, position: float}>  $column
     * @return array{0: ?float, 1: ?float}
     */
    private function neighbours(array $column, ?int $afterId, ?int $beforeId): array
    {
        $ids = array_column($column, 'id');
        $after = $afterId !== null ? array_search($afterId, $ids, true) : false;

        if ($after !== false) {
            return [$column[$after]['position'], $column[$after + 1]['position'] ?? null];
        }

        $before = $beforeId !== null ? array_search($beforeId, $ids, true) : false;

        if ($before !== false) {
            return [$column[$before - 1]['position'] ?? null, $column[$before]['position']];
        }

        // Neither neighbour exists anymore, so the end of the column is the honest place
        $last = end($column);

        return [$last === false ? null : $last['position'], null];
    }

    /**
     * Through the base query so a renumbering does not stamp every card as changed.
     *
     * @param  list<array{id: int, position: float}>  $column
     */
    private function renumber(string $key, array $column): void
    {
        foreach ($column as $index => $row) {
            $query = ($this->column)($key);
            $query->toBase()->where($query->getModel()->getQualifiedKeyName(), $row['id'])->update([$this->field => $index + 1]);
        }
    }
}
