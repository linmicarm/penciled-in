import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { socket } from "./socket";
import type { Board, Card, Move, Presence } from "./types";
import "./App.css";

const NAME =
  ["mika", "yuki", "rin", "hana", "sora"][Math.floor(Math.random() * 5)] +
  "-" +
  Math.floor(Math.random() * 100);

const PENCILS = ["#d4849a", "#84a4d4", "#84d4a4", "#d4b884", "#a984d4"];

function pencilFor(name: string) {
  const i = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return {
    "--pencil": PENCILS[i % PENCILS.length],
    "--tilt": `${(i % 5) * 6 - 12}deg`,
  } as React.CSSProperties;
}

// deterministic per-card tilt, never lands flat
function tiltFor(id: string) {
  const n = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const t = (n % 9) - 4;
  return t + (t >= 0 ? 1 : -1);
}

function applyMove(board: Board, { cardId, toColumnId, newIndex }: Move): Board {
  const columns = board.columns.map((c) => ({ ...c, cards: [...c.cards] }));
  const from = columns.find((c) => c.cards.some((k) => k.id === cardId));
  const to = columns.find((c) => c.id === toColumnId);
  if (!from || !to) return board;

  const i = from.cards.findIndex((k) => k.id === cardId);
  const [card] = from.cards.splice(i, 1);
  to.cards.splice(newIndex, 0, card);
  return { ...board, columns };
}

function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const tilt = isDragging ? -4.5 : tiltFor(card.id);

  // compose our rotation into dnd-kit's inline transform, or CSS gets clobbered
  const base = CSS.Transform.toString(transform) ?? "";
  const scale = isDragging ? " scale(1.04)" : "";

  return (
    <div
      ref={setNodeRef}
      className={`card ${isDragging ? "dragging" : ""}`}
      style={{
        transform: `${base} rotate(${tilt}deg)${scale}`,
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      {card.text}
    </div>
  );
}

function Column({ id, title, cards }: { id: string; title: string; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [text, setText] = useState("");

  function add() {
    const clean = text.trim();
    if (!clean) return;
    socket.emit("card:create", { columnId: id, text: clean });
    setText("");
  }

  return (
    <div ref={setNodeRef} className={`column ${isOver ? "over" : ""}`}>
      <h2>{title}</h2>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard key={card.id} card={card} />
        ))}
      </SortableContext>

      <input
        className="add-card"
        value={text}
        placeholder="+ add a card"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        onBlur={add}
      />
    </div>
  );
}

function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [users, setUsers] = useState<Presence[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    socket.connect();
    socket.emit("join", { name: NAME });

    socket.on("board:state", setBoard);
    socket.on("presence:update", setUsers);

    socket.on("card:moved", (move) => {
      setBoard((prev) => (prev ? applyMove(prev, move) : prev));
    });

    socket.on("card:created", ({ columnId, card }) => {
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.id === columnId ? { ...c, cards: [...c.cards, card] } : c
              ),
            }
          : prev
      );
    });

    return () => {
      socket.off("board:state");
      socket.off("presence:update");
      socket.off("card:moved");
      socket.off("card:created");
      socket.disconnect();
    };
  }, []);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || !board) return;

    const cardId = String(active.id);
    const overId = String(over.id);

    const targetColumn =
      board.columns.find((c) => c.id === overId) ??
      board.columns.find((c) => c.cards.some((k) => k.id === overId));
    if (!targetColumn) return;

    const newIndex =
      overId === targetColumn.id
        ? targetColumn.cards.length
        : targetColumn.cards.findIndex((k) => k.id === overId);

    // fire and forget — the server decides, then tells everyone
    socket.emit("card:move", { cardId, toColumnId: targetColumn.id, newIndex });
  }

  if (!board) return <p className="loading">connecting...</p>;

  return (
    <div className="app">
      <header>
        <h1>penciled in</h1>
        <div className="presence">
          {users.map((u, i) => (
            <span key={i} className="pill" style={pencilFor(u.name)}>
              {u.name}
            </span>
          ))}
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="board">
          {board.columns.map((col) => (
            <Column key={col.id} id={col.id} title={col.title} cards={col.cards} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

export default App;