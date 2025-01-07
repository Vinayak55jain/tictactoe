import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (HTML, CSS, client-side JS, audio)
app.use(express.static(__dirname));

// Route for the home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game logic
let waitingPlayer = null;
let playingArray = [];

// Handle connection event
io.on("connection", (socket) => {
    socket.on("find", (data) => {
        if (data.name) {
            if (waitingPlayer) {
                // Start game when two players are found
                const roomName = `room-${waitingPlayer.id}-${socket.id}`;
                const game = {
                    p1: { p1name: waitingPlayer.name, p1value: "X" },
                    p2: { p2name: data.name, p2value: "O" },
                    board: Array(9).fill(null),
                    currentTurn: "X",
                    room: roomName
                };
                playingArray.push(game);

                socket.join(roomName);
                waitingPlayer.socket.join(roomName);

                io.to(roomName).emit("find", { allPlayer: [game] });
                waitingPlayer = null; // Reset the waiting player
            } else {
                waitingPlayer = { name: data.name, socket, id: socket.id };
            }
        }
    });

    socket.on("sendMessage", (data) => {
        const game = playingArray.find(g => g.p1.p1name === data.playerName || g.p2.p2name === data.playerName);
        if (game) {
            // Broadcast the message to both players in the room
            io.to(game.room).emit("receiveMessage", { player: data.playerName, message: data.message });
        }
    });

    socket.on("playing", (data) => {
        const game = playingArray.find(g => g.p1.p1name === data.name || g.p2.p2name === data.name);
        if (!game) return;

        const index = parseInt(data.id);
        if (!game.board[index] && game.currentTurn === data.value) {
            game.board[index] = data.value;
            game.currentTurn = data.value === "X" ? "O" : "X";
            io.to(game.room).emit("playing", { allPlayer: [game] });

            // Check if there's a winner or draw
            if (checkWin(game.board)) {
                io.to(game.room).emit("gameResult", { result: data.value });
                // End game and disable further moves
            } else if (game.board.every(cell => cell)) {
                io.to(game.room).emit("gameResult", { result: "draw" });
            }
        }
    });

    socket.on("disconnect", () => {
        if (waitingPlayer && waitingPlayer.socket === socket) {
            waitingPlayer = null; // If the waiting player disconnects, reset waiting player
        } else {
            // Remove the game if a player in an active game disconnects
            playingArray = playingArray.filter(game => game.p1.socket !== socket && game.p2.socket !== socket);
        }
    });
});

// Function to check for a winning condition
function checkWin(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  // Columns
        [0, 4, 8], [2, 4, 6]              // Diagonals
    ];
    return winPatterns.some(pattern => {
        const [a, b, c] = pattern;
        return board[a] && board[a] === board[b] && board[a] === board[c];
    });
}

// Start the server
server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});
