const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 存储所有房间
const rooms = {};

// 提供静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 添加这些调试代码
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
    res.send('Server is working!');
});

// 创建房间API
app.get('/create-room', (req, res) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
        players: {},
        gameState: null
    };
    
    res.json({
        roomId: roomId,
        player1Link: `http://localhost:3000/game.html?room=${roomId}&player=1`,
        player2Link: `http://localhost:3000/game.html?room=${roomId}&player=2`
    });
});

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);
    
    socket.on('join-room', (data) => {
        const { roomId, playerId } = data;
        
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players[playerId] = socket.id;
            
            console.log(`玩家${playerId}加入房间${roomId}`);
            
            // 通知房间内所有玩家
            io.to(roomId).emit('player-joined', {
                playerId: playerId,
                playerCount: Object.keys(rooms[roomId].players).length
            });
            
            // 如果两个玩家都到齐了，开始游戏
            if (Object.keys(rooms[roomId].players).length === 2) {
                io.to(roomId).emit('game-start');
            }
        }
    });
    
    // 玩家出牌
    socket.on('play-card', (data) => {
        const { roomId, playerId, card } = data;
        // 广播给房间内其他玩家
        socket.to(roomId).emit('opponent-played', {
            playerId: playerId,
            card: card
        });
    });
    
    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
    });
});

// 生成随机房间ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

const PORT = 3000;
http.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error('Server failed to start:', err);
        return;
    }
    console.log(`✅ Server is running!`);
    console.log(`📍 Open your browser and visit: http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
});