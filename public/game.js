const socket = io({
    transports: ['websocket', 'polling']
});

// Get room ID and player ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const playerId = urlParams.get('player');

// 游戏状态
let gameState = null;
let hasChosen = false;
let opponentHasChosen = false;

// 初始化UI
document.getElementById('roomId').textContent = roomId;
document.getElementById('playerId').textContent = `玩家 ${playerId}`;

// Join room
socket.emit('join-room', { roomId, playerId });

// 接收游戏状态
socket.on('game-state', (state) => {
    gameState = state;
    updateUI();
});

// 玩家加入
socket.on('player-joined', (data) => {
    console.log(`玩家 ${data.playerId} 加入游戏`);
    document.getElementById('gameStatus').textContent = 
        `${data.playerCount}/2 玩家已加入`;
});

// 游戏开始
socket.on('game-start', () => {
    document.getElementById('gameStatus').textContent = '游戏开始！选择你的行动';
    document.getElementById('gameStatus').style.color = 'green';
    updateUI();
});

// 选择确认
socket.on('choice-confirmed', (data) => {
    hasChosen = true;
    document.getElementById('gameStatus').textContent = `你选择了: ${getActionName(data.action)}，等待对手...`;
    disableAllButtons();
});

// 对手已选择
socket.on('opponent-chose', () => {
    opponentHasChosen = true;
    if (!hasChosen) {
        document.getElementById('gameStatus').textContent = '对手已选择，快做出你的选择！';
    }
});

// 回合结算
socket.on('round-result', (result) => {
    hasChosen = false;
    opponentHasChosen = false;
    
    // 显示结算信息
    displayRoundResult(result);
    
    // 如果游戏结束
    if (result.gameOver) {
        displayGameOver(result.winner);
    } else {
        // 继续下一回合
        setTimeout(() => {
            document.getElementById('gameStatus').textContent = `回合 ${result.round + 1} - 选择你的行动`;
            updateUI();
        }, 3000);
    }
});

// 无效行动
socket.on('invalid-action', (data) => {
    alert(data.message);
});

// 游戏重启
socket.on('game-restarted', (state) => {
    gameState = state;
    hasChosen = false;
    opponentHasChosen = false;
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('roundResult').style.display = 'none';
    document.getElementById('gameStatus').textContent = '游戏重启！选择你的行动';
    document.getElementById('gameStatus').style.color = 'green';
    updateUI();
});

// 玩家断开连接
socket.on('player-disconnected', (data) => {
    alert(`玩家 ${data.playerId} 已断开连接`);
    document.getElementById('gameStatus').textContent = '对手已断开连接';
    document.getElementById('gameStatus').style.color = 'red';
    disableAllButtons();
});

// 选择行动
function chooseAction(action) {
    if (hasChosen) {
        alert('你已经做出选择了！');
        return;
    }
    
    socket.emit('choose-action', { roomId, playerId, action });
}

// 更新UI
function updateUI() {
    if (!gameState) return;
    
    const myState = gameState[`player${playerId}`];
    const opponentId = playerId === '1' ? '2' : '1';
    const opponentState = gameState[`player${opponentId}`];
    
    // 更新能量显示
    document.getElementById('myEnergy').textContent = myState.energy;
    document.getElementById('opponentEnergy').textContent = opponentState.energy;
    
    // 更新回合数
    document.getElementById('roundNumber').textContent = gameState.round;
    
    // 更新按钮状态
    if (!hasChosen && !gameState.gameOver) {
        enableButtons(myState);
    } else {
        disableAllButtons();
    }
}

// 启用按钮
function enableButtons(myState) {
    const bubbleBtn = document.getElementById('bubbleBtn');
    const shieldBtn = document.getElementById('shieldBtn');
    const attackBtn = document.getElementById('attackBtn');
    
    // 泡泡始终可用
    bubbleBtn.disabled = false;
    bubbleBtn.style.opacity = '1';
    bubbleBtn.style.cursor = 'pointer';
    
    // 护盾检查冷却
    if (myState.usedShieldLastTurn) {
        shieldBtn.disabled = true;
        shieldBtn.style.opacity = '0.5';
        shieldBtn.style.cursor = 'not-allowed';
        shieldBtn.title = '护盾冷却中！';
    } else {
        shieldBtn.disabled = false;
        shieldBtn.style.opacity = '1';
        shieldBtn.style.cursor = 'pointer';
        shieldBtn.title = '';
    }
    
    // 攻击检查能量
    if (myState.energy < 1) {
        attackBtn.disabled = true;
        attackBtn.style.opacity = '0.5';
        attackBtn.style.cursor = 'not-allowed';
        attackBtn.title = '能量不足！需要1点能量';
    } else {
        attackBtn.disabled = false;
        attackBtn.style.opacity = '1';
        attackBtn.style.cursor = 'pointer';
        attackBtn.title = '';
    }
}

// 禁用所有按钮
function disableAllButtons() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
}

// 显示回合结果
function displayRoundResult(result) {
    const resultDiv = document.getElementById('roundResult');
    resultDiv.style.display = 'block';
    
    const player1Name = playerId === '1' ? '你' : '对手';
    const player2Name = playerId === '2' ? '你' : '对手';
    
    resultDiv.innerHTML = `
        <h3>回合 ${result.round} 结果</h3>
        <p>${player1Name}: ${getActionName(result.player1Action)} | 能量: ${result.player1Energy}</p>
        <p>${player2Name}: ${getActionName(result.player2Action)} | 能量: ${result.player2Energy}</p>
        <p class="result-message">${result.message}</p>
    `;
}

// 显示游戏结束
function displayGameOver(winner) {
    const gameOverDiv = document.getElementById('gameOver');
    gameOverDiv.style.display = 'block';
    
    const winnerText = winner.toString() === playerId ? '你赢了！🎉' : '你输了！😢';
    document.getElementById('winnerText').textContent = winnerText;
    
    document.getElementById('gameStatus').textContent = '游戏结束';
    document.getElementById('gameStatus').style.color = winner.toString() === playerId ? 'green' : 'red';
}

// 重启游戏
function restartGame() {
    socket.emit('restart-game', { roomId });
}

// 获取行动名称
function getActionName(action) {
    const names = {
        'bubble': '泡泡 🫧',
        'shield': '护盾 🛡️',
        'attack': '针 📌'
    };
    return names[action] || action;
}