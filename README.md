# @staackyz/board

The kanban frame shared by the Staackyz apps: columns, pointer drag (touch included), the drop slot and where a card
lands. It knows nothing about orders, tasks or any server. The app brings the cards, draws them through slots and saves
every move itself.

Shipped as source (`.vue` and `.ts`), compiled by the app's own Vite.

## Install

Pinned to a tag, never to a branch:

```json
"@staackyz/board": "git+ssh://git@github.com/staackyz/staackyz-board.git#v0.1.0"
```

The machine running `npm ci` (CI runner, deploy server) needs read access to this repository.

In the app:

- `vite.config.ts`: `optimizeDeps: { exclude: ['@staackyz/board'] }`, since the dev prebundle cannot read `.vue`
- `tailwind.config.js`: add `'./node_modules/@staackyz/board/src/**/*.{vue,ts}'` to `content`
- the app styles the hook classes the frame uses, after `@tailwind utilities`: `kanban-col` (column width on phones),
  `card-room` (room above lifting cards), `scrollbar-hidden`, `gap-el` (the slot a lifted card leaves), the
  `board` transition (`board-move`, `board-enter-*`, `board-leave-*`) and the `--screen-pad` variable. The theme
  tokens are the shadcn ones (`primary`, `background`). The CMMS `resources/css/app.css` is the reference

## Pieces

| Export | What it does |
|---|---|
| `ColumnBoard` | The scroller, the columns and the gap. Slots `header` and `card` draw the app's own column title and card |
| `useColumnDrag` | Lift, gap and drop. `drop` is called on release, the app decides what it means |
| `columnMoves` | Where a card lands among the visible neighbours, plus `sideways` and `nudge` for keys and menus. `place` is the app's |
| `usePointerDrag` | The pointer drag under it all, also usable alone |
| `resolveDropIndex`, `resolveZoneDropIndex` | The slot rule with 8px hysteresis, and the grid reading for side by side cards |

Every card element needs `data-card-id` and calls `drag.onCardPointerDown(card, columnKey, $event)` on `pointerdown`.

## Staackyz Life: tasks from its own database

The Life admin keeps its tasks in its own table (`docs/decisions/2026-11-03-admin-tasks-storage.md` in that repo).
The page receives them as an Inertia prop, and the only thing the board asks is `id`, `position` and a column key.

```ts
import { ColumnBoard, columnMoves, useColumnDrag } from '@staackyz/board';
import { router } from '@inertiajs/vue3';

interface Task { id: number; status: string; position: number; title: string }

const props = defineProps<{ tasks: Task[]; statuses: string[] }>();

// Local copy so the card moves at once and the server confirms afterwards
const tasks = ref<Task[]>([]);
watch(() => props.tasks, (fresh) => (tasks.value = fresh.map((t) => ({ ...t }))), { immediate: true });

const columns = computed(() =>
    Object.fromEntries(props.statuses.map((s) => [s, tasks.value.filter((t) => t.status === s).sort((a, b) => a.position - b.position)])),
);

const moves = columnMoves<Task>({
    columns: () => columns.value,
    keys: () => props.statuses,
    columnOf: (task) => task.status,
    place: ({ card, toKey, position, after, before }) => {
        Object.assign(tasks.value.find((t) => t.id === card.id)!, { status: toKey, position });
        router.patch(route('admin.tasks.move', card.id), { status: toKey, after: after?.id ?? null, before: before?.id ?? null }, {
            preserveScroll: true,
            only: ['tasks'],
        });
    },
});

const drag = useColumnDrag<Task>({
    columns: () => columns.value,
    canDrop: () => true,
    drop: ({ item, toKey, index }) => moves.moveTo(item, toKey, index),
    open: (task) => openTask(task.id),
});
```

The server is the authority: the move route checks the task belongs to the admin, validates `status` against the
column list and the two neighbour ids against the same column, and recomputes the position with the same midpoint rule
(`midpoint` in `src/columnMoves.ts`). What the client sends as position is never stored.

## Releasing

Change, `npm test`, bump `version`, commit, tag `vX.Y.Z`, push the tag. Each app moves to the new tag in its own PR,
with its own tests.
