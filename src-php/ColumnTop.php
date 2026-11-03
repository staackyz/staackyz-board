<?php

namespace Staackyz\Board;

use Illuminate\Database\Eloquent\Builder;

/**
 * Where a card lands when it moves into another column without a chosen place: above the first card there, the same
 * rule for every board of the family
 */
final class ColumnTop
{
    /**
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $column  the other cards of the column, already narrowed
     */
    public static function above(Builder $column, string $field, float $empty): float
    {
        $first = $column->min($field);

        return $first === null ? $empty : (float) $first - 1;
    }
}
