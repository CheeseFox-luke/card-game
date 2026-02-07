const socket = io({
    transports: ['websocket', 'polling']
});


// Get room ID and player ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const playerId = urlParams.get('player');

document.getElementById('roomId').textContent = roomId;
document.getElementById('playerId').textContent = `Player ${playerId}`;

// Join room
socket.emit('join-room', { roomId, playerId });

// Initialize player's hand (simple example)
const playerHand = ['A', 'K', 'Q', 'J', '10'];
renderPlayerHand();

function renderPlayerHand() {
    const handDiv = document.getElementById('playerHand');
    handDiv.innerHTML = '';
    
    playerHand.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        cardDiv.textContent = card;
        cardDiv.onclick = () => playCard(card);
        handDiv.appendChild(cardDiv);
    });
}

function playCard(card) {
    // Send card play info
    socket.emit('play-card', { roomId, playerId, card });
    
    // Display in play area
    const playArea = document.getElementById('playArea');
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.textContent = card;
    playArea.appendChild(cardDiv);
    
    // Remove from hand
    const index = playerHand.indexOf(card);
    if (index > -1) {
        playerHand.splice(index, 1);
        renderPlayerHand();
    }
}

// Listen for player joined
socket.on('player-joined', (data) => {
    console.log(`Player ${data.playerId} joined the game`);
    document.getElementById('gameStatus').textContent = 
        `${data.playerCount}/2 players joined`;
});

// Game start
socket.on('game-start', () => {
    document.getElementById('gameStatus').textContent = 'Game Started!';
    document.getElementById('gameStatus').style.color = 'green';
});

// Opponent played card
socket.on('opponent-played', (data) => {
    const playArea = document.getElementById('playArea');
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.textContent = data.card;
    cardDiv.style.background = '#ffcdd2';
    playArea.appendChild(cardDiv);
});
