export type Card = {
  id: string;
  text: string;
};

export type Column = {
  id: string;
  title: string;
  cards: Card[];
};

export type Board = {
  id: string;
  columns: Column[];
};

export type Move = {
  cardId: string;
  toColumnId: string;
  newIndex: number;
};

export type Presence = {
  name: string;
};

// events the server sends us
export type ServerToClientEvents = {
  "board:state": (board: Board) => void;
  "card:moved": (move: Move) => void;
  "presence:update": (users: Presence[]) => void;
};

// events we send the server
export type ClientToServerEvents = {
  join: (payload: { name: string }) => void;
  "card:move": (move: Move) => void;
};

export type ServerToClientEvents = {
  "board:state": (board: Board) => void;
  "card:moved": (move: Move) => void;
  "card:created": (payload: { columnId: string; card: Card }) => void;
  "presence:update": (users: Presence[]) => void;
};

export type ClientToServerEvents = {
  join: (payload: { name: string }) => void;
  "card:move": (move: Move) => void;
  "card:create": (payload: { columnId: string; text: string }) => void;
};