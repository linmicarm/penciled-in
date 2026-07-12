# penciled in ✎

A real-time collaborative planning board. Two people open the same board, one drags a card, the other sees it move — and neither breaks when they drag the same card at once.

**[Live demo →](https://penciled-in-app.vercel.app)** · Open it in two tabs to see the sync.

<img width="1474" height="944" alt="image" src="https://github.com/user-attachments/assets/c0f07770-6c08-485b-9dac-530fdddeabe6" />


---

## Architecture decisions

The features here are ordinary. The decisions underneath them are the point.

### The server is the referee

Clients don't broadcast their own state — they send an *intent*, the server applies it to the canonical board, and the server broadcasts the result.

```
client: "move card-3 to col-done at index 0"
server: applies it, clamps the index, rebroadcasts what actually happened
everyone: replays the same operation
```

The naive alternative is to broadcast the whole board on every change. It's simpler and it's wrong: last writer wins, so if two people drag at once, one person's move silently disappears. Sending the move instead of the state means concurrent drags of different cards both survive, and concurrent drags of the *same* card resolve deterministically — because only one machine is allowed to decide what's true.

Invalid moves (a card that's no longer where the client thought it was) return `null` and are dropped rather than broadcast. That's the concurrency safety valve.

### The broadcast doesn't wait on the database

```js
io.to(board.id).emit("card:moved", result.applied);  // broadcast first
persistBoard(board, result.touched);                 // then persist, no await
```

The in-memory board is the live source of truth during a session; Postgres is a write-behind store, hydrated once on boot.

Awaiting the database before broadcasting would add a round trip to every drag — in a feature whose entire value proposition is that it feels instant. The tradeoff is a narrow window where a crash could lose the last move. For a planning board that's the right trade. For a payments system it wouldn't be.

### The server mints ids

Card ids are generated server-side, never accepted from the client. If clients minted their own, two people could collide — or a malicious client could overwrite an existing card by reusing its id. Same principle as moves: the client proposes, the server decides.

### Optimistic updates were deliberately left out

`handleDragEnd` emits and does nothing else. The card doesn't move until the server echoes it back. Local optimistic updates would feel marginally snappier and would let two clients diverge, which is the exact bug this whole design exists to prevent. On a real connection the round trip is invisible.

---

## Stack

**Client** — React 19, TypeScript, Vite, `@dnd-kit` for drag and drop
**Server** — Node.js, Express.js, Socket.IO
**Data** — Supabase (Postgres)
**Deploy** — Vercel (client), Render (server), GitHub Actions (CI)

The socket event contract is typed and shared in `client/src/types.ts` — `ServerToClientEvents` and `ClientToServerEvents` are what make the wire format checkable rather than a handshake agreement.

## Known limits

Honest ones, since they're the first thing an interviewer will ask:

- **Single board, fixed columns.** Scope was deliberate — the hard problem here is concurrent sync, not CRUD on boards.
- **Card `position` is an integer**, rewritten for both affected columns on every move. Fine at this scale; fractional indexing is the scalable answer.
- **Single server instance.** Horizontal scaling would need the Socket.IO Redis adapter so rooms span processes. The database is already Postgres, so that part wouldn't have to change.

## Running locally

```bash
# server
cd server
npm install
# add SUPABASE_URL and SUPABASE_SERVICE_KEY to server/.env
npm run dev
```

```bash
# client
cd client
npm install
npm run dev
```

Open `localhost:5173` in two tabs.
