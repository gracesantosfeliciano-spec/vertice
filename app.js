import { initializeApp }
from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    update,
    get,
    onValue,
    push
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

let uid = null;
let roomCode = null;
let roomData = null;
let playerName = "";
let unsubscribeRoom = null;

let currentGame = null;
let gameTimer = null;
let animationFrame = null;

const $ = id => document.getElementById(id);

const screens = {
    home: $("home"),
    lobby: $("lobby"),
    game: $("game"),
    results: $("results")
};

function showScreen(name) {
    Object.values(screens).forEach(x => x.classList.remove("active"));
    screens[name].classList.add("active");
}

function toast(message) {
    const el = $("toast");

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        el.classList.remove("show");
    }, 2400);
}

function error(message) {
    $("homeError").textContent = message;
}

function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    return Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
    return [...array].sort(() => Math.random() - .5);
}

async function ensureAuth() {

    if (uid) return uid;

    try {

        const result = await signInAnonymously(auth);

        uid = result.user.uid;

        $("connectionDot").parentElement.classList.add("online");
        $("connectionText").textContent = "ONLINE";

        return uid;

    } catch (err) {

        console.error(err);

        throw new Error(
            "Não foi possível conectar ao Firebase. Ative Anonymous Authentication."
        );
    }
}

async function createRoom(name) {

    await ensureAuth();

    roomCode = randomCode();
    playerName = name.trim().toUpperCase();

    const roomRef = ref(db, `rooms/${roomCode}`);

    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
        return createRoom(name);
    }

    await set(roomRef, {

        status: "lobby",

        host: uid,

        round: 0,

        usedGames: [],

        createdAt: Date.now(),

        players: {

            [uid]: {

                name: playerName,

                score: 0,

                connected: true,

                ready: true,

                host: true,

                joinedAt: Date.now()

            }

        }

    });

    listenRoom();

    showScreen("lobby");

    toast("SALA CRIADA");

}

async function joinRoom(name, code) {

    await ensureAuth();

    roomCode = code.trim().toUpperCase();
    playerName = name.trim().toUpperCase();

    if (roomCode.length !== 6) {
        throw new Error("Código inválido.");
    }

    const roomRef = ref(db, `rooms/${roomCode}`);

    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
        throw new Error("Essa sala não existe.");
    }

    const data = snapshot.val();

    const players = data.players || {};

    if (Object.keys(players).length >= 8) {
        throw new Error("A sala está cheia.");
    }

    if (data.status !== "lobby") {
        throw new Error("Essa partida já começou.");
    }

    await set(
        ref(db, `rooms/${roomCode}/players/${uid}`),
        {
            name: playerName,
            score: 0,
            connected: true,
            ready: true,
            host: false,
            joinedAt: Date.now()
        }
    );

    listenRoom();

    showScreen("lobby");

    toast("ENTROU NA SALA");

}

function listenRoom() {

    if (unsubscribeRoom) {
        unsubscribeRoom();
    }

    const roomRef = ref(db, `rooms/${roomCode}`);

    unsubscribeRoom = onValue(roomRef, snapshot => {

        if (!snapshot.exists()) {
            toast("A sala foi encerrada.");
            showScreen("home");
            return;
        }

        roomData = snapshot.val();

        if (roomData.status === "lobby") {

            renderLobby();

        }

        if (roomData.status === "playing") {

            renderGame();

        }

        if (roomData.status === "finished") {

            renderResults();

        }

    });
}

function renderLobby() {

    $("roomCode").textContent = roomCode;

    const players = Object.entries(roomData.players || {});

    $("playerCount").textContent =
        `${players.length}/8`;

    $("playersList").innerHTML = players
        .sort((a,b) => a[1].joinedAt - b[1].joinedAt)
        .map(([id, player]) => {

            return `
                <div class="player">
                    <span class="player-name">
                        ${escapeHTML(player.name)}
                    </span>

                    ${
                        player.host
                        ? `<span class="player-host">HOST</span>`
                        : ""
                    }
                </div>
            `;

        }).join("");

    const host = roomData.host === uid;

    $("startBtn").disabled =
        !host ||
        players.length < 2;

    $("lobbyStatus").textContent =
        players.length < 2
        ? "AGUARDANDO JOGADORES"
        : "PRONTO PARA COMEÇAR";

}

function escapeHTML(value) {

    return String(value)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

/* =========================================================
   MINIGAMES
========================================================= */

const GAMES = [

    {
        id: "reflex",
        title: "REFLEXO",
        category: "REAÇÃO",
        time: 6,
        points: 100
    },

    {
        id: "target",
        title: "ALVO",
        category: "PRECISÃO",
        time: 10,
        points: 120
    },

    {
        id: "memory",
        title: "MEMÓRIA",
        category: "MEMÓRIA",
        time: 10,
        points: 150
    },

    {
        id: "odd",
        title: "INTRUSO",
        category: "PERCEPÇÃO",
        time: 8,
        points: 130
    },

    {
        id: "higher",
        title: "MAIOR OU MENOR",
        category: "PROBABILIDADE",
        time: 7,
        points: 100
    },

    {
        id: "center",
        title: "PARE NO CENTRO",
        category: "PRECISÃO",
        time: 6,
        points: 140
    },

    {
        id: "math",
        title: "CÁLCULO",
        category: "MENTE",
        time: 10,
        points: 150
    },

    {
        id: "sequence",
        title: "SEQUÊNCIA",
        category: "LÓGICA",
        time: 10,
        points: 160
    },

    {
        id: "typing",
        title: "DIGITE",
        category: "VELOCIDADE",
        time: 10,
        points: 140
    },

    {
        id: "count",
        title: "CONTAGEM",
        category: "PERCEPÇÃO",
        time: 8,
        points: 120
    },

    {
        id: "color",
        title: "COR CERTA",
        category: "REAÇÃO",
        time: 8,
        points: 130
    },

    {
        id: "choice",
        title: "ESCOLHA",
        category: "RISCO",
        time: 7,
        points: 150
    },

    {
        id: "risk",
        title: "RISCO",
        category: "APOSTA",
        time: 10,
        points: 250
    },

    {
        id: "order",
        title: "ORDENE",
        category: "LÓGICA",
        time: 12,
        points: 170
    },

    {
        id: "reaction",
        title: "NÃO CLIQUE",
        category: "CONTROLE",
        time: 7,
        points: 160
    },

    {
        id: "speed",
        title: "VELOCIDADE",
        category: "DIGITAÇÃO",
        time: 8,
        points: 180
    },

    {
        id: "secret",
        title: "CÓDIGO SECRETO",
        category: "MEMÓRIA",
        time: 10,
        points: 180
    },

    {
        id: "closest",
        title: "MAIS PRÓXIMO",
        category: "PRECISÃO",
        time: 8,
        points: 150
    },

    {
        id: "exact",
        title: "NÚMERO EXATO",
        category: "LÓGICA",
        time: 8,
        points: 170
    },

    {
        id: "maze",
        title: "LABIRINTO",
        category: "ORIENTAÇÃO",
        time: 12,
        points: 180
    },

    {
        id: "truefalse",
        title: "VERDADEIRO OU FALSO",
        category: "CONHECIMENTO",
        time: 8,
        points: 120
    },

    {
        id: "symbol",
        title: "CAÇA-SÍMBOLO",
        category: "PERCEPÇÃO",
        time: 8,
        points: 150
    },

    {
        id: "jackpot",
        title: "JACKPOT",
        category: "EXTREMO",
        time: 8,
        points: 400
    },

    {
        id: "duel",
        title: "DUELO",
        category: "CONFRONTO",
        time: 8,
        points: 250
    }

];

function pickGame(used = []) {

    let available =
        GAMES.filter(game => !used.includes(game.id));

    if (!available.length) {
        available = [...GAMES];
    }

    return available[
        Math.floor(Math.random() * available.length)
    ];
}

async function startGame() {

    if (roomData.host !== uid) return;

    const game = pickGame(roomData.usedGames || []);

    const round = (roomData.round || 0) + 1;

    const duration = game.time * 1000;

    const gameData = {

        id: game.id,

        title: game.title,

        category: game.category,

        points: game.points,

        startedAt: Date.now(),

        endsAt: Date.now() + duration,

        round,

        submissions: {},

        state: generateGameState(game.id)

    };

    await update(
        ref(db, `rooms/${roomCode}`),
        {
            status: "playing",
            round,
            game: gameData,
            usedGames: [
                ...(roomData.usedGames || []),
                game.id
            ]
        }
    );

}

function generateGameState(id) {

    switch(id) {

        case "memory":
            return {
                sequence: Array.from(
                    {length: 5},
                    () => random(1,9)
                )
            };

        case "odd":

            const odd = random(0,8);

            return {
                odd,
                values: Array.from(
                    {length:9},
                    (_,i) => i === odd ? "◆" : "◇"
                )
            };

        case "higher":
            return {
                current: random(10,90),
                next: random(1,99)
            };

        case "math": {

            const a = random(5,30);
            const b = random(2,20);
            const op = Math.random() > .5 ? "+" : "*";

            return {
                a,
                b,
                op,
                answer: op === "+" ? a+b : a*b
            };
        }

        case "sequence": {

            const start = random(2,12);
            const step = random(2,7);

            return {
                numbers: [
                    start,
                    start + step,
                    start + step*2,
                    start + step*3
                ],
                answer: start + step*4
            };
        }

        case "typing": {

            const words = [
                "VERTICE",
                "CONFRONTO",
                "JOGADOR",
                "REAÇÃO",
                "PARTIDA",
                "JACKPOT",
                "VELOCIDADE"
            ];

            return {
                word: words[random(0,words.length-1)]
            };
        }

        case "count": {

            const amount = random(8,30);

            return {
                amount
            };
        }

        case "color": {

            const colors = [
                ["VERMELHO","#ff3b30"],
                ["VERDE","#c8ff00"],
                ["AZUL","#398cff"],
                ["AMARELO","#ffe600"]
            ];

            const correct =
                colors[random(0,colors.length-1)];

            return {
                correct: correct[0],
                display: colors[random(0,colors.length-1)][0],
                colors
            };
        }

        case "secret":

            return {
                code: Array.from(
                    {length:4},
                    () => random(0,9)
                ).join("")
            };

        case "closest":

            return {
                target: random(50,500)
            };

        case "exact":

            return {
                target: random(50,500),
                tolerance: 5
            };

        case "truefalse": {

            const questions = [

                ["O Brasil possui cinco regiões.", true],

                ["A água ferve a 100°C ao nível do mar.", true],

                ["A Lua é uma estrela.", false],

                ["O Sol é uma estrela.", true],

                ["O oceano Atlântico é maior que o Pacífico.", false],

                ["2 + 2 = 5.", false],

                ["A Terra possui dois satélites naturais.", false]

            ];

            const q =
                questions[random(0,questions.length-1)];

            return {
                question: q[0],
                answer: q[1]
            };
        }

        case "symbol": {

            const symbols = ["◆","●","▲","■","★","✦"];

            const target =
                symbols[random(0,symbols.length-1)];

            return {
                target,
                symbols: shuffle([
                    ...Array(7).fill(target),
                    ...Array.from(
                        {length:14},
                        () => symbols[random(0,symbols.length-1)]
                    )
                ])
            };
        }

        default:
            return {};
    }
}

/* =========================================================
   GAME RENDER
========================================================= */

function renderGame() {

    if (!roomData.game) return;

    const game = roomData.game;

    if (
        currentGame?.round === game.round &&
        currentGame?.id === game.id
    ) {
        updatePlayers();
        updateScores();
        return;
    }

    currentGame = game;

    clearTimeout(gameTimer);
    cancelAnimationFrame(animationFrame);

    showScreen("game");

    $("roundNumber").textContent =
        String(game.round).padStart(2,"0");

    $("gameCategory").textContent =
        game.category;

    $("gameTitle").textContent =
        game.title;

    $("roundPoints").textContent =
        `+${game.points}`;

    renderMiniGame(game);

    startTimer(game);

    updatePlayers();
    updateScores();
}

function startTimer(game) {

    const tick = () => {

        const remaining =
            Math.max(
                0,
                game.endsAt - Date.now()
            );

        $("timer").textContent =
            (remaining / 1000).toFixed(1);

        if (remaining <= 0) {

            submitScore(0);

            if (roomData.host === uid) {

                gameTimer = setTimeout(
                    finishRound,
                    700
                );

            }

            return;
        }

        animationFrame =
            requestAnimationFrame(tick);
    };

    tick();
}

function renderMiniGame(game) {

    const area = $("gameArea");

    area.innerHTML = "";

    switch(game.id) {

        case "reflex":
            renderReflex(area,game);
            break;

        case "target":
            renderTarget(area,game);
            break;

        case "memory":
            renderMemory(area,game);
            break;

        case "odd":
            renderOdd(area,game);
            break;

        case "higher":
            renderHigher(area,game);
            break;

        case "center":
            renderCenter(area,game);
            break;

        case "math":
            renderMath(area,game);
            break;

        case "sequence":
            renderSequence(area,game);
            break;

        case "typing":
            renderTyping(area,game);
            break;

        case "count":
            renderCount(area,game);
            break;

        case "color":
            renderColor(area,game);
            break;

        case "choice":
            renderChoice(area,game);
            break;

        case "risk":
            renderRisk(area,game);
            break;

        case "order":
            renderOrder(area,game);
            break;

        case "reaction":
            renderReaction(area,game);
            break;

        case "speed":
            renderSpeed(area,game);
            break;

        case "secret":
            renderSecret(area,game);
            break;

        case "closest":
            renderClosest(area,game);
            break;

        case "exact":
            renderExact(area,game);
            break;

        case "maze":
            renderMaze(area,game);
            break;

        case "truefalse":
            renderTrueFalse(area,game);
            break;

        case "symbol":
            renderSymbol(area,game);
            break;

        case "jackpot":
            renderJackpot(area,game);
            break;

        case "duel":
            renderDuel(area,game);
            break;

        default:
            area.innerHTML = `
                <div class="mini">
                    <h2>PREPARANDO...</h2>
                </div>
            `;
    }
}

/* =========================================================
   MINIGAMES
========================================================= */

function renderReflex(area,game) {

    const delay = random(1200,3500);

    area.innerHTML = `
        <div class="mini">
            <h2>AGUARDE.</h2>
            <p>NÃO CLIQUE ANTES DA HORA.</p>
            <button id="reflexBtn" class="big-action" disabled>
                ...
            </button>
        </div>
    `;

    const btn = $("reflexBtn");

    setTimeout(() => {

        if (!document.body.contains(btn)) return;

        const started = performance.now();

        btn.disabled = false;
        btn.textContent = "AGORA";

        btn.onclick = () => {

            const reaction =
                performance.now() - started;

            const score =
                Math.max(
                    10,
                    Math.round(
                        game.points *
                        Math.max(
                            0.1,
                            1 - reaction / 1500
                        )
                    )
                );

            submitScore(score);

            btn.disabled = true;
            btn.textContent = `${Math.round(reaction)} MS`;
        };

    },delay);
}

function renderTarget(area,game) {

    area.innerHTML = `
        <div class="mini">
            <h2>ACERTE O ALVO</h2>

            <div id="targetZone" class="target-zone"></div>
        </div>
    `;

    const zone = $("targetZone");

    let hits = 0;

    const spawn = () => {

        const target = document.createElement("button");

        target.className = "target";

        target.style.left =
            random(5,90) + "%";

        target.style.top =
            random(5,80) + "%";

        target.onclick = () => {

            hits++;

            target.remove();

            spawn();
        };

        zone.appendChild(target);

        setTimeout(() => {
            target.remove();
        },900);
    };

    spawn();

    const interval = setInterval(spawn,900);

    setTimeout(() => {

        clearInterval(interval);

        submitScore(
            Math.min(
                game.points,
                hits * 20
            )
        );

    }, game.time * 1000);
}

function renderMemory(area,game) {

    const seq =
        game.state.sequence;

    area.innerHTML = `
        <div class="mini">

            <h2>MEMORIZE</h2>

            <div id="memoryDisplay"
                 class="memory-display">
                ${seq.join(" ")}
            </div>

            <input
                id="memoryInput"
                class="answer-input"
                placeholder="SEQUÊNCIA"
                maxlength="${seq.length * 2}"
            >

            <button id="memorySubmit"
                    class="main-button"
                    style="margin:20px auto">
                CONFIRMAR
            </button>

        </div>
    `;

    const display = $("memoryDisplay");

    setTimeout(() => {

        display.textContent = "?????";

    },2500);

    $("memorySubmit").onclick = () => {

        const answer =
            $("memoryInput").value
                .replace(/\D/g,"");

        const correct =
            seq.join("");

        submitScore(
            answer === correct
                ? game.points
                : 0
        );
    };
}

function renderOdd(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>ACHE O INTRUSO</h2>

            <div class="choices">
                ${game.state.values.map((x,i) => `
                    <button class="choice"
                            data-index="${i}">
                        ${x}
                    </button>
                `).join("")}
            </div>

        </div>
    `;

    area.querySelectorAll(".choice")
        .forEach(btn => {

            btn.onclick = () => {

                const index =
                    Number(btn.dataset.index);

                submitScore(
                    index === game.state.odd
                        ? game.points
                        : 0
                );
            };

        });
}

function renderHigher(area,game) {

    const current =
        game.state.current;

    const next =
        game.state.next;

    area.innerHTML = `
        <div class="mini">

            <h2>${current}</h2>

            <p>
                O próximo será MAIOR ou MENOR?
            </p>

            <div class="choices">

                <button class="choice"
                        id="higher">
                    MAIOR
                </button>

                <button class="choice"
                        id="lower">
                    MENOR
                </button>

            </div>

        </div>
    `;

    const answer =
        next > current
        ? "higher"
        : "lower";

    $("higher").onclick =
        () => submitScore(
            answer === "higher"
                ? game.points
                : 0
        );

    $("lower").onclick =
        () => submitScore(
            answer === "lower"
                ? game.points
                : 0
        );
}

function renderCenter(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>PARE NO CENTRO</h2>

            <div class="center-bar">
                <div class="center-zone"></div>
                <div id="marker"
                     class="center-marker"></div>
            </div>

            <button id="stopMarker"
                    class="main-button"
                    style="margin:30px auto">
                PARAR
            </button>

        </div>
    `;

    const marker = $("marker");

    let position = 0;
    let direction = 1;

    const animate = () => {

        position += direction * 1.2;

        if(position >= 98) direction = -1;
        if(position <= 0) direction = 1;

        marker.style.left = position + "%";

        animationFrame =
            requestAnimationFrame(animate);
    };

    animate();

    $("stopMarker").onclick = () => {

        cancelAnimationFrame(animationFrame);

        const distance =
            Math.abs(position - 50);

        const score =
            Math.max(
                0,
                Math.round(
                    game.points *
                    (1 - distance / 50)
                )
            );

        submitScore(score);
    };
}

function renderMath(area,game) {

    const s = game.state;

    area.innerHTML = `
        <div class="mini">

            <h2>CÁLCULO</h2>

            <div class="math-question">
                ${s.a} ${s.op} ${s.b} = ?
            </div>

            <input
                id="mathAnswer"
                class="answer-input"
                type="number"
                autofocus
            >

            <button id="mathBtn"
                    class="main-button"
                    style="margin:20px auto">
                RESPONDER
            </button>

        </div>
    `;

    $("mathBtn").onclick = () => {

        submitScore(
            Number($("mathAnswer").value) === s.answer
                ? game.points
                : 0
        );

    };
}

function renderSequence(area,game) {

    const s = game.state;

    area.innerHTML = `
        <div class="mini">

            <h2>QUAL É O PRÓXIMO?</h2>

            <div class="big-number">
                ${s.numbers.join(" · ")}
            </div>

            <input
                id="seqAnswer"
                class="answer-input"
                type="number"
            >

            <button id="seqBtn"
                    class="main-button"
                    style="margin:20px auto">
                RESPONDER
            </button>

        </div>
    `;

    $("seqBtn").onclick = () => {

        submitScore(
            Number($("seqAnswer").value) === s.answer
                ? game.points
                : 0
        );
    };
}

function renderTyping(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>DIGITE</h2>

            <div class="big-number">
                ${game.state.word}
            </div>

            <input
                id="typingInput"
                class="answer-input"
                autocomplete="off"
            >

            <button id="typingBtn"
                    class="main-button"
                    style="margin:20px auto">
                CONFIRMAR
            </button>

        </div>
    `;

    $("typingBtn").onclick = () => {

        const typed =
            $("typingInput").value
                .trim()
                .toUpperCase();

        submitScore(
            typed === game.state.word
                ? game.points
                : 0
        );
    };
}

function renderCount(area,game) {

    const amount = game.state.amount;

    area.innerHTML = `
        <div class="mini">

            <h2>QUANTOS?</h2>

            <div id="objects"
                 style="
                 display:flex;
                 flex-wrap:wrap;
                 justify-content:center;
                 gap:8px;
                 max-width:600px;
                 margin:30px auto;
                 ">
                ${Array.from(
                    {length:amount},
                    () => `<span style="
                        font-size:25px;
                        color:var(--acid);
                    ">◆</span>`
                ).join("")}
            </div>

            <input
                id="countInput"
                class="answer-input"
                type="number"
            >

            <button id="countBtn"
                    class="main-button"
                    style="margin:20px auto">
                CONFIRMAR
            </button>

        </div>
    `;

    $("countBtn").onclick = () => {

        submitScore(
            Number($("countInput").value) === amount
                ? game.points
                : 0
        );
    };
}

function renderColor(area,game) {

    const s = game.state;

    area.innerHTML = `
        <div class="mini">

            <h2 style="color:${colorValue(s.display,s.colors)}">
                ${s.display}
            </h2>

            <p>
                QUAL É A COR CORRETA?
            </p>

            <div class="choices">
                ${s.colors.map(c => `
                    <button
                        class="choice"
                        data-color="${c[0]}"
                        style="border-color:${c[1]}">
                        ${c[0]}
                    </button>
                `).join("")}
            </div>

        </div>
    `;

    area.querySelectorAll(".choice")
        .forEach(btn => {

            btn.onclick = () => {

                submitScore(
                    btn.dataset.color === s.correct
                        ? game.points
                        : 0
                );
            };
        });
}

function colorValue(name, colors) {

    return colors.find(x => x[0] === name)?.[1]
        || "white";
}

function renderChoice(area,game) {

    const values = [
        game.points,
        game.points * 1.5,
        0,
        -Math.round(game.points / 2)
    ];

    area.innerHTML = `
        <div class="mini">

            <h2>ESCOLHA</h2>

            <p>
                UMA ESCOLHA. UMA CHANCE.
            </p>

            <div class="choices">
                ${shuffle(values).map((v,i) => `
                    <button
                        class="choice"
                        data-value="${v}">
                        CAIXA ${i+1}
                    </button>
                `).join("")}
            </div>

        </div>
    `;

    area.querySelectorAll(".choice")
        .forEach(btn => {

            btn.onclick = () => {

                submitScore(
                    Number(btn.dataset.value)
                );
            };

        });
}

function renderRisk(area,game) {

    let multiplier = 1;
    let stopped = false;

    area.innerHTML = `
        <div class="mini">

            <h2 id="riskValue">
                x1.0
            </h2>

            <p>
                CONTINUE PARA MULTIPLICAR.<br>
                PARE ANTES DE QUEBRAR.
            </p>

            <div class="choices">

                <button id="riskContinue"
                        class="choice">
                    CONTINUAR
                </button>

                <button id="riskStop"
                        class="choice">
                    PARAR
                </button>

            </div>

        </div>
    `;

    const interval = setInterval(() => {

        if (stopped) return;

        if (Math.random() < .18) {

            stopped = true;

            clearInterval(interval);

            $("riskValue").textContent =
                "QUEBROU";

            submitScore(0);

            return;
        }

        multiplier += .25;

        $("riskValue").textContent =
            `x${multiplier.toFixed(2)}`;

    },900);

    $("riskContinue").onclick = () => {};

    $("riskStop").onclick = () => {

        if (stopped) return;

        stopped = true;

        clearInterval(interval);

        submitScore(
            Math.round(
                game.points * multiplier
            )
        );
    };
}

function renderOrder(area,game) {

    const values = shuffle([
        random(10,90),
        random(10,90),
        random(10,90),
        random(10,90)
    ]);

    area.innerHTML = `
        <div class="mini">

            <h2>ORDENE</h2>

            <p>DO MENOR PARA O MAIOR</p>

            <div id="order"
                 class="sequence">

                ${values.map(v => `
                    <button data-value="${v}">
                        ${v}
                    </button>
                `).join("")}

            </div>

        </div>
    `;

    const clicked = [];

    area.querySelectorAll("button")
        .forEach(btn => {

            btn.onclick = () => {

                if (btn.disabled) return;

                clicked.push(
                    Number(btn.dataset.value)
                );

                btn.disabled = true;

                if (clicked.length === values.length) {

                    const correct =
                        [...values].sort((a,b)=>a-b);

                    submitScore(
                        JSON.stringify(clicked) ===
                        JSON.stringify(correct)
                            ? game.points
                            : 0
                    );
                }
            };

        });
}

function renderReaction(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>NÃO CLIQUE</h2>

            <p>
                QUANDO FICAR VERDE, CLIQUE.
            </p>

            <button id="reactionBtn"
                    class="big-action">
                AGUARDE...
            </button>

        </div>
    `;

    const btn = $("reactionBtn");

    const delay = random(1000,3500);

    setTimeout(() => {

        if (!document.body.contains(btn)) return;

        btn.textContent = "CLIQUE";

        btn.style.background =
            "var(--acid)";

        const started =
            performance.now();

        btn.onclick = () => {

            const reaction =
                performance.now() - started;

            submitScore(
                Math.max(
                    20,
                    Math.round(
                        game.points *
                        (1 - reaction/1800)
                    )
                )
            );
        };

    },delay);

    btn.addEventListener("click", () => {

        if (btn.textContent === "AGUARDE...") {

            submitScore(0);

        }

    }, {once:true});
}

function renderSpeed(area,game) {

    const text =
        "VÉRTICE";

    area.innerHTML = `
        <div class="mini">

            <h2>VELOCIDADE</h2>

            <p>
                ESCREVA O TEXTO EXATAMENTE.
            </p>

            <div class="big-number">
                ${text}
            </div>

            <input
                id="speedInput"
                class="answer-input"
                autocomplete="off"
            >

            <button id="speedBtn"
                    class="main-button"
                    style="margin:20px auto">
                ENVIAR
            </button>

        </div>
    `;

    $("speedBtn").onclick = () => {

        const value =
            $("speedInput").value
                .trim()
                .toUpperCase();

        submitScore(
            value === text
                ? game.points
                : 0
        );
    };
}

function renderSecret(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>CÓDIGO SECRETO</h2>

            <div
                id="secretCode"
                class="memory-display">
                ${game.state.code}
            </div>

            <input
                id="secretInput"
                class="answer-input"
                maxlength="4"
            >

            <button
                id="secretBtn"
                class="main-button"
                style="margin:20px auto">
                DECIFRAR
            </button>

        </div>
    `;

    setTimeout(() => {

        if ($("secretCode")) {
            $("secretCode").textContent = "••••";
        }

    },2000);

    $("secretBtn").onclick = () => {

        submitScore(
            $("secretInput").value === game.state.code
                ? game.points
                : 0
        );
    };
}

function renderClosest(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>
                CHEGUE PERTO DE ${game.state.target}
            </h2>

            <input
                id="closestInput"
                class="answer-input"
                type="number"
            >

            <button
                id="closestBtn"
                class="main-button"
                style="margin:20px auto">
                ENVIAR
            </button>

        </div>
    `;

    $("closestBtn").onclick = () => {

        const value =
            Number($("closestInput").value);

        const distance =
            Math.abs(
                value - game.state.target
            );

        const score =
            Math.max(
                0,
                Math.round(
                    game.points *
                    Math.max(
                        0,
                        1 - distance / 100
                    )
                )
            );

        submitScore(score);
    };
}

function renderExact(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>
                ${game.state.target}
            </h2>

            <p>
                DIGITE UM NÚMERO.
                QUANTO MAIS PERTO, MELHOR.
            </p>

            <input
                id="exactInput"
                class="answer-input"
                type="number"
            >

            <button
                id="exactBtn"
                class="main-button"
                style="margin:20px auto">
                CONFIRMAR
            </button>

        </div>
    `;

    $("exactBtn").onclick = () => {

        const distance =
            Math.abs(
                Number($("exactInput").value)
                - game.state.target
            );

        submitScore(
            Math.max(
                0,
                Math.round(
                    game.points *
                    Math.max(
                        0,
                        1 - distance/100
                    )
                )
            )
        );
    };
}

function renderMaze(area,game) {

    const size = 5;

    area.innerHTML = `
        <div class="mini">

            <h2>LABIRINTO</h2>

            <p>
                CHEGUE AO QUADRADO VERDE.
            </p>

            <div id="maze"
                 style="
                 display:grid;
                 grid-template-columns:repeat(5,50px);
                 justify-content:center;
                 gap:4px;
                 margin:30px auto;
                 ">
            </div>

        </div>
    `;

    const maze = $("maze");

    const goal = 24;

    for(let i=0;i<25;i++){

        const cell =
            document.createElement("button");

        cell.style.width = "50px";
        cell.style.height = "50px";

        cell.style.background =
            i === goal
                ? "var(--acid)"
                : "#111";

        cell.style.border =
            "1px solid var(--line)";

        cell.textContent =
            i === 0
                ? "●"
                : i === goal
                    ? "★"
                    : "";

        cell.onclick = () => {

            if(i === goal){

                submitScore(game.points);

            } else {

                submitScore(0);

            }

        };

        maze.appendChild(cell);
    }
}

function renderTrueFalse(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>
                ${game.state.question}
            </h2>

            <div class="choices">

                <button
                    id="trueBtn"
                    class="choice">
                    VERDADEIRO
                </button>

                <button
                    id="falseBtn"
                    class="choice">
                    FALSO
                </button>

            </div>

        </div>
    `;

    $("trueBtn").onclick =
        () => submitScore(
            game.state.answer
                ? game.points
                : 0
        );

    $("falseBtn").onclick =
        () => submitScore(
            !game.state.answer
                ? game.points
                : 0
        );
}

function renderSymbol(area,game) {

    const symbols =
        game.state.symbols;

    area.innerHTML = `
        <div class="mini">

            <h2>
                ACHE:
                ${game.state.target}
            </h2>

            <div class="choices">

                ${symbols.map((symbol,i) => `
                    <button
                        class="choice"
                        data-index="${i}"
                        style="font-size:30px">
                        ${symbol}
                    </button>
                `).join("")}

            </div>

        </div>
    `;

    area.querySelectorAll(".choice")
        .forEach(btn => {

            btn.onclick = () => {

                submitScore(
                    symbols[
                        Number(btn.dataset.index)
                    ] === game.state.target
                        ? Math.round(
                            game.points / 3
                        )
                        : 0
                );

            };

        });
}

function renderJackpot(area,game) {

    area.innerHTML = `
        <div class="mini">

            <h2>JACKPOT</h2>

            <p>
                UMA ÚNICA ESCOLHA.<br>
                400 PONTOS OU ZERO.
            </p>

            <button
                id="jackpot"
                class="big-action">
                ARRISCAR
            </button>

        </div>
    `;

    $("jackpot").onclick = () => {

        const win =
            Math.random() > .65;

        submitScore(
            win
                ? 400
                : 0
        );

        $("jackpot").textContent =
            win
                ? "JACKPOT!"
                : "PERDEU";
    };
}

function renderDuel(area,game) {

    const players =
        Object.entries(roomData.players || {})
            .filter(([id]) => id !== uid);

    const opponent =
        players.length
            ? players[random(0,players.length-1)][1]
            : null;

    area.innerHTML = `
        <div class="mini">

            <h2>DUELO</h2>

            <p>
                ${
                    opponent
                        ? `VOCÊ VS ${escapeHTML(opponent.name)}`
                        : "DISPUTA RELÂMPAGO"
                }
            </p>

            <button
                id="duelBtn"
                class="big-action">
                CLIQUE!
            </button>

        </div>
    `;

    let clicks = 0;

    const btn = $("duelBtn");

    btn.onclick = () => {

        clicks++;

        btn.textContent =
            `${clicks} CLIQUES`;

        submitScore(
            Math.min(
                game.points,
                clicks * 20
            )
        );

    };
}

/* =========================================================
   SCORE
========================================================= */

let alreadySubmitted = false;

async function submitScore(score) {

    if (!currentGame) return;

    if (alreadySubmitted) return;

    alreadySubmitted = true;

    score = Math.max(
        0,
        Math.round(Number(score) || 0)
    );

    try {

        await set(
            ref(
                db,
                `rooms/${roomCode}/game/submissions/${uid}`
            ),
            {
                score,
                submittedAt: Date.now()
            }
        );

    } catch(err) {

        console.error(err);

        toast("ERRO AO ENVIAR PONTUAÇÃO");

    }

    updateScores();
}

function updateScores() {

    const players =
        Object.values(
            roomData?.players || {}
        );

    const me =
        players.find(p =>
            p && p.name === playerName
        );

    $("myScore").textContent =
        me?.score || 0;

    const sorted =
        [...players].sort(
            (a,b) =>
                (b.score || 0) -
                (a.score || 0)
        );

    const index =
        sorted.findIndex(
            p => p.name === playerName
        );

    $("myPosition").textContent =
        index >= 0
            ? `${index+1}º`
            : "—";
}

function updatePlayers() {

    const players =
        Object.entries(
            roomData.players || {}
        );

    const submissions =
        roomData.game?.submissions || {};

    $("livePlayers").innerHTML =
        players.map(([id,p]) => {

            const done =
                !!submissions[id];

            return `
                <div class="live-player ${done ? "done" : ""}">
                    ${escapeHTML(p.name)}
                    ${done ? " ✓" : " ·"}
                </div>
            `;

        }).join("");
}

async function finishRound() {

    if (!roomData?.game) return;

    const submissions =
        roomData.game.submissions || {};

    const players =
        roomData.players || {};

    const updates = {};

    Object.entries(players)
        .forEach(([id,player]) => {

            const earned =
                Number(
                    submissions[id]?.score || 0
                );

            updates[
                `rooms/${roomCode}/players/${id}/score`
            ] =
                Number(player.score || 0)
                + earned;

        });

    await update(
        ref(db),
        updates
    );

    const nextRound =
        roomData.round >= 12;

    if (nextRound) {

        await update(
            ref(db, `rooms/${roomCode}`),
            {
                status: "finished"
            }
        );

    } else {

        setTimeout(async () => {

            if (roomData.host === uid) {

                const latest =
                    await get(
                        ref(db, `rooms/${roomCode}`)
                    );

                const data = latest.val();

                if (data?.status === "playing") {

                    await update(
                        ref(db, `rooms/${roomCode}`),
                        {
                            game: null,
                            status: "lobby"
                        }
                    );

                    setTimeout(
                        () => startGame(),
                        1200
                    );

                }

            }

        },1800);

    }

}

function renderResults() {

    showScreen("results");

    const players =
        Object.entries(
            roomData.players || {}
        )
        .map(([id,p]) => ({
            id,
            ...p
        }))
        .sort(
            (a,b) =>
                (b.score || 0) -
                (a.score || 0)
        );

    const winner =
        players[0];

    $("podium").innerHTML = winner
        ? `
            <div class="winner">
                ${winner.score}
            </div>

            <div class="winner-name">
                ${escapeHTML(winner.name)}
                VENCEU
            </div>
        `
        : "";

    $("ranking").innerHTML =
        players.map((player,index) => {

            return `
                <div class="rank-row">

                    <span class="rank-position">
                        ${String(index+1).padStart(2,"0")}
                    </span>

                    <strong>
                        ${escapeHTML(player.name)}
                    </strong>

                    <span class="rank-score">
                        ${player.score || 0}
                    </span>

                </div>
            `;

        }).join("");
}

/* =========================================================
   EVENTS
========================================================= */

$("createForm").addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const name =
            $("createName").value.trim();

        if (name.length < 2) {

            error("Digite um nome.");

            return;
        }

        try {

            error("");

            await createRoom(name);

        } catch(err) {

            console.error(err);

            error(err.message);

        }

    }
);

$("joinBtn").onclick =
    async () => {

        const name =
            $("joinName").value.trim();

        const code =
            $("roomInput").value.trim();

        if (name.length < 2) {

            error("Digite seu nome.");

            return;
        }

        if (code.length !== 6) {

            error("Digite um código de 6 caracteres.");

            return;
        }

        try {

            error("");

            await joinRoom(name,code);

        } catch(err) {

            console.error(err);

            error(err.message);

        }
    };

$("startBtn").onclick =
    startGame;

$("copyRoom").onclick =
    async () => {

        const url =
            `${location.origin}${location.pathname}?room=${roomCode}`;

        try {

            await navigator.clipboard.writeText(url);

            toast("CONVITE COPIADO");

        } catch {

            toast(roomCode);

        }
    };

$("playAgain").onclick =
    () => {

        showScreen("lobby");

    };

/* URL ?room=ABC123 */

const urlRoom =
    new URLSearchParams(location.search)
        .get("room");

if (urlRoom) {

    $("roomInput").value =
        urlRoom.toUpperCase();

}

console.log(
    "%cVÉRTICE",
    "font-size:40px;font-weight:bold"
);

console.log(
    "24 MINIGAMES / REALTIME MULTIPLAYER"
);
