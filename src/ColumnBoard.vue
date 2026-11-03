<script setup lang="ts" generic="T extends ColumnCard, C extends { key: string }">
import type { ColumnCard, ColumnDrag } from './useColumnDrag';

/**
 * The frame of a kanban board, the scroller, the columns, the drop box and the gap a lifted card leaves, shared by the order
 * board and the Console sprint board. Each board draws its own header and card through the slots.
 * Why the column is space-y and not flex gap, and why the lifted card stays in the DOM: staackyz-cmms .claude/project-docs/context/design/kanban-board.md
 */
const props = defineProps<{
    columns: C[];
    drag: ColumnDrag<T>;
    /** The columns share the screen width from lg up, a board with many columns keeps scrolling sideways instead */
    shareWidth: boolean;
    /** The tint of each column box */
    boxClass: (column: C) => string;
}>();

defineSlots<{
    header(scope: { column: C }): unknown;
    card(scope: { item: T; index: number; column: C }): unknown;
}>();

const dropping = (key: string) => {
    const lifted = props.drag.dragging.value;

    return lifted !== null && props.drag.dropTarget.value?.status === key && props.drag.canDropTo(lifted, key);
};
</script>

<template>
    <!-- items-stretch keeps the drop area full height even when the list is short, and the painted box inside is what shrinks -->
    <div
        :ref="props.drag.setScroller"
        class="-mx-[var(--screen-pad)] flex min-h-0 flex-1 scroll-pl-[var(--screen-pad)] items-stretch gap-3 overflow-x-auto px-[var(--screen-pad)] pb-4"
        :class="[
            props.shareWidth ? 'lg:mx-0 lg:overflow-x-visible lg:px-0' : '',
            // Snap only when not dragging, since two scroll-snap utilities resolve by CSS order and not string order
            props.drag.dragging.value ? '' : 'snap-x snap-mandatory sm:snap-none',
        ]"
    >
        <div
            v-for="column in props.columns"
            :key="column.key"
            :data-drop-column="column.key"
            class="kanban-col flex min-h-0 shrink-0 flex-col sm:w-80"
            :class="props.shareWidth ? 'lg:w-auto lg:min-w-0 lg:flex-1' : ''"
        >
            <!-- min-h-24 and no flex-1, so the box fits its content and an empty column is still a visible drop target -->
            <div
                data-column-box
                class="flex min-h-24 flex-col rounded-xl transition-shadow"
                :class="[props.boxClass(column), dropping(column.key) ? 'ring-2 ring-primary/70' : '']"
            >
                <div class="group/col flex shrink-0 items-center gap-2 px-3 py-2.5">
                    <slot name="header" :column="column" />
                </div>

                <!-- No bar and so no gutter, the cards sit centred in the column and nothing jumps when a drag starts or ends -->
                <!-- min-h-0 and no flex-1, so the list is the height of what it has and still scrolls -->
                <TransitionGroup
                    tag="div"
                    name="board"
                    data-column-scroll
                    scroll-region
                    class="card-room scrollbar-hidden min-h-0 space-y-1 overflow-y-auto px-2 pb-2 sm:space-y-1.5"
                >
                    <template v-for="(entry, i) in props.drag.columnEntries(column.key)" :key="entry.key">
                        <slot v-if="entry.item" name="card" :item="entry.item" :index="i" :column="column" />

                        <div
                            v-else
                            :style="{ height: `${props.drag.dragHeight.value}px` }"
                            class="gap-el shrink-0 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10"
                        />
                    </template>
                </TransitionGroup>
            </div>
        </div>
    </div>
</template>
