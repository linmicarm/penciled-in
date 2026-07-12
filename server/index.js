import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { loadBoard, persistBoard, insertCard } from "./db.js";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" },
});

// hydrated from the db on boot, then held in memory as the live truth
let board = await loadBoard();

const presence = new Map();

function applyMove({ cardId, toColumnId, newIndex }) {
  const fromColumn = board.columns.find((c) =>
    c.cards.some((card) => card.id === cardId)
  );
  const toColumn = board.columns.find((c) => c.id === toColumnId);
  if (!fromColumn || !toColumn) return null;

  const cardIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
  const [card] = fromColumn.cards.splice(cardIndex, 1);

  const index = Math.max(0, Math.min(newIndex, toColumn.cards.length));
  toColumn.cards.splice(index, 0, card);

  return {
    applied: { cardId, toColumnId, newIndex: index },
    touched: [fromColumn.id, toColumn.id],
  };
}

io.on("connection", (socket) => {
  socket.on("join", ({ name }) => {
    presence.set(socket.id, { name: name || "anon" });
    socket.join(board.id);

    socket.emit("board:state", board);
    io.to(board.id).emit("presence:update", [...presence.values()]);
  });

  socket.on("card:move", (move) => {
    const result = applyMove(move);
    if (!result) return;

    // broadcast first — nobody waits on the database
    io.to(board.id).emit("card:moved", result.applied);

    // then persist, fire and forget
    persistBoard(board, result.touched);
  });

  socket.on("card:create", ({ columnId, text }) => {
  const clean = String(text ?? "").trim().slice(0, 200);
  if (!clean) return;

  const column = board.columns.find((c) => c.id === columnId);
  if (!column) return;

  // server mints the id — never trust the client for identity
  const card = { id: `card-${crypto.randomUUID()}`, text: clean };
  column.cards.push(card);

  io.to(board.id).emit("card:created", { columnId, card });

  insertCard(card, columnId, column.cards.length - 1);
});

  socket.on("disconnect", () => {
    presence.delete(socket.id);
    io.to(board.id).emit("presence:update", [...presence.values()]);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`✿ penciled in server on :${PORT}`);
});