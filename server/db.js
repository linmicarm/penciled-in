import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const COLUMN_ORDER = [
  { id: "col-todo", title: "to do" },
  { id: "col-doing", title: "doing" },
  { id: "col-done", title: "done" },
];

// read every card, rebuild the board shape the client expects
export async function loadBoard() {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("position");

  if (error) throw error;

  return {
    id: "board-1",
    columns: COLUMN_ORDER.map((col) => ({
      ...col,
      cards: data
        .filter((c) => c.column_id === col.id)
        .map((c) => ({ id: c.id, text: c.text })),
    })),
  };
}

// rewrite positions for the columns a move touched
export async function persistBoard(board, columnIds) {
  const rows = board.columns
    .filter((col) => columnIds.includes(col.id))
    .flatMap((col) =>
      col.cards.map((card, i) => ({
        id: card.id,
        column_id: col.id,
        text: card.text,
        position: i,
      }))
    );

  const { error } = await supabase.from("cards").upsert(rows);
  if (error) console.error("persist failed:", error.message);
}

export async function insertCard(card, columnId, position) {
  const { error } = await supabase.from("cards").insert({
    id: card.id,
    column_id: columnId,
    text: card.text,
    position,
  });
  if (error) console.error("insert failed:", error.message);
}