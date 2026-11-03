<?php

namespace Staackyz\Board\Tests;

use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;
use Staackyz\Board\ColumnPositions;

class Card extends Model
{
    protected $table = 'cards';

    protected $guarded = [];

    protected $casts = ['position' => 'float'];
}

class ColumnPositionsTest extends TestCase
{
    private ColumnPositions $positions;

    protected function setUp(): void
    {
        $capsule = new Capsule;
        $capsule->addConnection(['driver' => 'sqlite', 'database' => ':memory:']);
        $capsule->setAsGlobal();
        $capsule->bootEloquent();

        Capsule::schema()->create('cards', function ($table) {
            $table->id();
            $table->string('status');
            $table->double('position');
            $table->boolean('archived')->default(false);
            $table->timestamps();
        });

        $this->positions = new ColumnPositions(fn (string $status) => Card::query()->where('status', $status)->where('archived', false));
    }

    private function card(string $status, float $position, bool $archived = false): Card
    {
        return Card::create(['status' => $status, 'position' => $position, 'archived' => $archived]);
    }

    public function test_lands_between_the_two_neighbours(): void
    {
        $a = $this->card('todo', 1);
        $b = $this->card('todo', 2);
        $moved = $this->card('doing', 1);

        $this->assertSame(1.5, $this->positions->between('todo', $a->id, $b->id, $moved->id));
    }

    public function test_after_wins_over_before_and_the_ends_add_or_take_one(): void
    {
        $a = $this->card('todo', 1);
        $b = $this->card('todo', 2);
        $moved = $this->card('doing', 1);

        $this->assertSame(3.0, $this->positions->between('todo', $b->id, $a->id, $moved->id));
        $this->assertSame(0.0, $this->positions->between('todo', null, $a->id, $moved->id));
    }

    public function test_a_vanished_neighbour_sends_the_card_to_the_end_and_an_empty_column_gives_one(): void
    {
        $this->card('todo', 4);
        $moved = $this->card('doing', 1);

        $this->assertSame(5.0, $this->positions->between('todo', 999, null, $moved->id));
        $this->assertSame(1.0, $this->positions->between('review', 999, 998, $moved->id));
    }

    public function test_the_column_query_decides_what_counts(): void
    {
        $this->card('todo', 1, archived: true);
        $moved = $this->card('doing', 1);

        $this->assertSame(1.0, $this->positions->between('todo', null, null, $moved->id));
        $this->assertSame(1.0, $this->positions->topOf('todo'));
    }

    public function test_top_of_is_above_the_first_card_leaving_the_card_itself_out(): void
    {
        $this->card('todo', 3);
        $self = $this->card('todo', -2);

        $this->assertSame(2.0, $this->positions->topOf('todo', $self->id));
        $this->assertSame(-3.0, $this->positions->topOf('todo'));
    }

    public function test_neighbours_too_close_renumber_the_column_without_touching_timestamps(): void
    {
        $a = $this->card('todo', 1);
        $b = $this->card('todo', 1.0000001);
        $c = $this->card('todo', 5);
        $moved = $this->card('doing', 1);
        Card::query()->toBase()->update(['updated_at' => '2020-01-01 00:00:00']);

        $this->assertSame(1.5, $this->positions->between('todo', $a->id, $b->id, $moved->id));
        $this->assertSame([1.0, 2.0, 3.0], Card::query()->whereKey([$a->id, $b->id, $c->id])->orderBy('id')->pluck('position')->all());
        $this->assertSame(['2020-01-01 00:00:00'], Card::query()->toBase()->distinct()->pluck('updated_at')->all());
    }
}
