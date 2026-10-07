import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    update,
    get,
    onValue,
    onDisconnect,
    push
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

import {
    firebaseConfig
} from "./firebase-config.js";


/* =========================
   FIREBASE
========================= */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getDatabase(app);


/* =========================
   HELPERS
========================= */

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];


/* =========================
   STATE
========================= */

let uid = null;

let roomCode = null;

let roomData = null;

let myName = "";

let pendingAction = null;

let timerInterval = null;

let unsubscribeRoom = null;


/* =========================
   GAME DATA
========================= */

const cards = [

    {
        type: "QUESTION",
        text: "QUAL FOI A ÚLTIMA COISA QUE VOCÊ FEZ E PENSOU: ISSO FOI UMA PÉSSIMA IDEIA?",
        hint: "Todo mundo responde. O grupo decide a mais convincente."
    },

    {
        type: "QUESTION",
        text: "QUEM NESTA SALA SOBREVIVERIA MELHOR SEM INTERNET POR UMA SEMANA?",
        hint: "Aponte. Sem discurso de defesa."
    },

    {
        type: "CHALLENGE",
        text: "ESCOLHA ALGUÉM. ESSA PESSOA PRECISA CONTAR UMA HISTÓRIA REAL EM 30 SEGUNDOS.",
        hint: "O grupo decide se a história convenceu."
    },

    {
        type: "QUESTION",
        text: "SE VOCÊS TROCASSEM DE VIDA POR 24 HORAS, QUEM VOCÊ ESCOLHERIA?",
        hint: "Você também precisa explicar o motivo."
    },

    {
        type: "CHAOS",
        text: "TODO MUNDO MUDA DE LUGAR.",
        hint: "Depois disso, a pessoa mais rápida escolhe quem começa."
    },

    {
        type: "QUESTION",
        text: "QUAL PESSOA AQUI VOCÊ LEVARIA PARA UMA SITUAÇÃO COMPLETAMENTE CAÓTICA?",
        hint: "Só vale uma escolha."
    },

    {
        type: "CHALLENGE",
        text: "IMITE ALGUÉM DA SALA SEM FALAR O NOME.",
        hint: "O resto precisa descobrir."
    },

    {
        type: "QUESTION",
        text: "QUAL SEGREDO INÚTIL SOBRE VOCÊ QUASE NINGUÉM SABE?",
        hint: "Quanto mais específico, melhor."
    },

    {
        type: "CHAOS",
        text: "O HOST ESCOLHE DUAS PESSOAS. ELAS DUELAM.",
        hint: "Uma pergunta. Uma resposta. O grupo decide."
    },

    {
        type: "QUESTION",
        text: "QUEM SERIA O PIOR PARCEIRO PARA UMA VIAGEM SEM PLANEJAMENTO?",
        hint: "Vote com honestidade."
    },

    {
        type: "CHALLENGE",
        text: "DEFENDA UMA OPINIÃO QUE VOCÊ NEM SEQUER ACREDITA.",
        hint: "Você tem 25 segundos para convencer a sala."
    },

    {
        type: "QUESTION",
        text: "SE ESTA PARTIDA TIVESSE UM TÍTULO, QUAL SERIA?",
        hint: "A resposta mais criativa ganha."
    }

];


/* =========================
   SCREEN
========================= */

function showScreen(name) {

    $$(".screen").forEach(screen => {

        screen.classList.toggle(
            "active",
            screen.id === `screen-${name}`
        );

    });

}


/* =========================
   TOAST
========================= */

function toast(message) {

    const element = $("#toast");

    element.textContent = message;

    element.classList.add("show");

    setTimeout(() => {

        element.classList.remove("show");

    }, 2200);

}


/* =========================
   ROOM CODE
========================= */

function randomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    return Array
        .from(
            { length: 6 },
            () =>
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ]
        )
        .join("");

}


/* =========================
   NAME
========================= */

function normalizeName(value) {

    return value
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 18)
        .toUpperCase();

}


/* =========================
   AUTH
========================= */

async function ensureAuth() {

    if (uid)
        return;

    await signInAnonymously(auth);

}


/* =========================
   CREATE ROOM
========================= */

async function createRoom() {

    const code =
        randomCode();

    roomCode = code;

    const roomRef =
        ref(
            db,
            `rooms/${code}`
        );


    await set(roomRef, {

        host: uid,

        status: "lobby",

        createdAt: Date.now(),

        round: 0,

        maxRounds: cards.length,

        currentCard: null,

        startedAt: null,

        timerDuration: 20,

        players: {

            [uid]: {

                name: myName,

                score: 0,

                online: true,

                joinedAt: Date.now()

            }

        }

    });


    await bindPresence(code);

    bindRoom(code);

    showScreen("lobby");

}


/* =========================
   JOIN ROOM
========================= */

async function joinRoom(code) {

    code =
        code
            .trim()
            .toUpperCase();


    if (
        !/^[A-Z0-9]{6}$/.test(code)
    ) {

        throw new Error(
            "Código inválido."
        );

    }


    const roomRef =
        ref(
            db,
            `rooms/${code}`
        );


    const snapshot =
        await get(roomRef);


    if (!snapshot.exists()) {

        throw new Error(
            "Sala não encontrada."
        );

    }


    const data =
        snapshot.val();


    if (
        data.status === "finished"
    ) {

        throw new Error(
            "Essa partida já terminou."
        );

    }


    const players =
        Object.keys(
            data.players || {}
        );


    if (
        players.length >= 8 &&
        !data.players?.[uid]
    ) {

        throw new Error(
            "Sala cheia."
        );

    }


    roomCode = code;


    await update(
        ref(
            db,
            `rooms/${code}/players/${uid}`
        ),
        {

            name: myName,

            score:
                data.players?.[uid]?.score ||
                0,

            online: true,

            joinedAt: Date.now()

        }
    );


    await bindPresence(code);

    bindRoom(code);

    showScreen("lobby");

}


/* =========================
   PRESENCE
========================= */

async function bindPresence(code) {

    const connected =
        ref(
            db,
            ".info/connected"
        );


    onValue(
        connected,
        async snapshot => {

            if (
                snapshot.val() === true
            ) {

                const player =
                    ref(
                        db,
                        `rooms/${code}/players/${uid}/online`
                    );


                await onDisconnect(player)
                    .set(false);


                await set(
                    player,
                    true
                );

            }

        }
    );

}


/* =========================
   ROOM LISTENER
========================= */

function bindRoom(code) {

    if (unsubscribeRoom)
        unsubscribeRoom();


    unsubscribeRoom =
        onValue(
            ref(
                db,
                `rooms/${code}`
            ),
            snapshot => {

                roomData =
                    snapshot.val();


                if (!roomData)
                    return;


                if (
                    roomData.status ===
                    "lobby"
                ) {

                    renderLobby(
                        roomData
                    );

                    showScreen(
                        "lobby"
                    );

                }


                if (
                    roomData.status ===
                    "playing"
                ) {

                    renderGame(
                        roomData
                    );

                    showScreen(
                        "game"
                    );

                }


                if (
                    roomData.status ===
                    "finished"
                ) {

                    renderFinish(
                        roomData
                    );

                    showScreen(
                        "finish"
                    );

                }

            }
        );

}


/* =========================
   LOBBY
========================= */

function renderLobby(data) {

    const players =
        Object.entries(
            data.players || {}
        );


    $("#roomCode")
        .textContent =
        roomCode || "------";


    $("#lobbyStatus")
        .textContent =
        `${players.length} PLAYER${players.length === 1 ? "" : "S"}`;


    const hostName =
        data.players?.[data.host]?.name ||
        "//";


    $("#hostLabel")
        .textContent =
        `HOST — ${
            data.host === uid
                ? "VOCÊ"
                : hostName
        }`;


    $("#playerList")
        .innerHTML =
        players
            .map(
                ([id, player], index) => `

                <div class="player-row">

                    <span class="num">
                        ${String(index + 1).padStart(2, "0")}
                    </span>

                    <span class="name">

                        <i class="player-dot"></i>

                        ${escapeHTML(
                            player.name ||
                            "PLAYER"
                        )}

                    </span>

                    <span class="host">

                        ${
                            id === data.host
                                ? "HOST"
                                : player.online
                                    ? "ONLINE"
                                    : "OFFLINE"
                        }

                    </span>

                </div>

            `
            )
            .join("");


    const isHost =
        data.host === uid;


    $("#startGame").disabled =
        !isHost ||
        players.length < 2;


    $("#waitLabel")
        .textContent =
        isHost

            ? players.length < 2
                ? "PRECISA DE PELO MENOS 2 PLAYERS."
                : "VOCÊ É O HOST. QUANDO QUISER, COMECE."

            : "AGUARDANDO O HOST...";

}


/* =========================
   START GAME
========================= */

async function startGame() {

    if (
        !roomData ||
        roomData.host !== uid
    )
        return;


    const card =
        makeCard(1);


    await update(
        ref(
            db,
            `rooms/${roomCode}`
        ),
        {

            status: "playing",

            round: 1,

            currentCard: card,

            startedAt: Date.now(),

            timerDuration: 20

        }
    );


    await addFeed(
        `${myName} iniciou a partida.`
    );

}


/* =========================
   CARD
========================= */

function makeCard(round) {

    const base =
        cards[
            (round - 1) %
            cards.length
        ];


    return {

        ...base,

        id: round,

        createdAt: Date.now()

    };

}


/* =========================
   GAME
========================= */

function renderGame(data) {

    const players =
        Object.entries(
            data.players || {}
        );


    $("#gameRoom")
        .textContent =
        roomCode;


    $("#gamePlayerCount")
        .textContent =
        String(
            players.length
        ).padStart(2, "0");


    $("#roundLabel")
        .textContent =
        `ROUND ${
            String(data.round)
                .padStart(2, "0")
        } / ${
            data.maxRounds
        }`;


    $("#cardNumber")
        .textContent =
        String(data.round)
            .padStart(2, "0");


    $("#cardType")
        .textContent =
        data.currentCard?.type ||
        "QUESTION";


    $("#targetLabel")
        .textContent =
        data.currentCard?.target ||
        "FOR EVERYONE";


    $("#cardText")
        .textContent =
        data.currentCard?.text ||
        "";


    $("#cardHint")
        .textContent =
        data.currentCard?.hint ||
        "";


    $("#gamePlayers")
        .innerHTML =
        players
            .map(
                ([id, player]) => `

                <div class="
                    game-player
                    ${id === data.turn ? "active" : ""}
                ">

                    <span class="player-dot"></span>

                    <span>
                        ${escapeHTML(player.name)}
                    </span>

                    <span class="score">
                        ${player.score || 0}
                    </span>

                </div>

            `
            )
            .join("");


    renderFeed(
        data.feed || {}
    );


    $("#nextRound")
        .style.display =
        data.host === uid
            ? "flex"
            : "none";


    const started =
        data.currentCard?.createdAt ||
        data.startedAt ||
        Date.now();


    startTimer(
        started,
        data.timerDuration || 20
    );

}


/* =========================
   TIMER
========================= */

function startTimer(
    startedAt,
    duration
) {

    clearInterval(
        timerInterval
    );


    function tick() {

        const elapsed =
            (
                Date.now() -
                startedAt
            ) / 1000;


        const left =
            Math.max(
                0,
                duration -
                elapsed
            );


        $("#timerText")
            .textContent =
            String(
                Math.ceil(left)
            ).padStart(2, "0");


        $("#timerBar")
            .style.width =
            `${
                Math.max(
                    0,
                    left /
                    duration *
                    100
                )
            }%`;


        if (left <= 0) {

            clearInterval(
                timerInterval
            );

        }

    }


    tick();

    timerInterval =
        setInterval(
            tick,
            250
        );

}


/* =========================
   NEXT ROUND
========================= */

async function nextRound() {

    if (
        !roomData ||
        roomData.host !== uid
    )
        return;


    if (
        roomData.round >=
        roomData.maxRounds
    ) {

        await update(
            ref(
                db,
                `rooms/${roomCode}`
            ),
            {
                status: "finished"
            }
        );

        return;
    }


    const next =
        roomData.round + 1;


    const card =
        makeCard(next);


    await update(
        ref(
            db,
            `rooms/${roomCode}`
        ),
        {

            round: next,

            currentCard: card,

            startedAt: Date.now(),

            timerDuration: 20

        }
    );


    await addFeed(
        `${myName} abriu a rodada ${
            String(next)
                .padStart(2, "0")
        }.`
    );

}


/* =========================
   ANSWER
========================= */

async function chooseAnswer(
    choice
) {

    $$(".answer")
        .forEach(button => {

            button.classList.toggle(
                "selected",
                button.dataset.choice === choice
            );

        });


    if (
        !uid ||
        !roomCode
    )
        return;


    const playerRef =
        ref(
            db,
            `rooms/${roomCode}/players/${uid}`
        );


    const current =
        roomData
            ?.players
            ?.[
                uid
            ]
            ?.score ||
        0;


    await update(
        playerRef,
        {
            score:
                current + 10
        }
    );


    await addFeed(
        `${myName} respondeu ${choice}.`
    );

}


/* =========================
   FEED
========================= */

async function addFeed(
    message
) {

    const feed =
        push(
            ref(
                db,
                `rooms/${roomCode}/feed`
            )
        );


    await set(
        feed,
        {
            message,
            at: Date.now()
        }
    );

}


function renderFeed(feed) {

    const entries =
        Object.values(feed || {})
            .sort(
                (a, b) =>
                    (b.at || 0) -
                    (a.at || 0)
            )
            .slice(0, 5);


    $("#feedList")
        .innerHTML =
        entries
            .map(
                item => `
                    <div class="feed-item">
                        ${escapeHTML(
                            item.message
                        )}
                    </div>
                `
            )
            .join("");

}


/* =========================
   FINISH
========================= */

function renderFinish(data) {

    clearInterval(
        timerInterval
    );


    $("#finalRoom")
        .textContent =
        `ROOM ${roomCode}`;


    const players =
        Object.values(
            data.players || {}
        )
        .sort(
            (a, b) =>
                (b.score || 0) -
                (a.score || 0)
        );


    $("#ranking")
        .innerHTML =
        players
            .map(
                (player, index) => `

                <div class="rank-row">

                    <span class="rank-num">
                        ${String(index + 1).padStart(2, "0")}
                    </span>

                    <span class="rank-name">
                        ${escapeHTML(player.name)}
                    </span>

                    <span class="rank-score">
                        ${player.score || 0}
                    </span>

                </div>

            `
            )
            .join("");

}


/* =========================
   NAME MODAL
========================= */

function openNameModal(
    action
) {

    pendingAction =
        action;


    $("#nameInput")
        .value =
        myName;


    $("#nameModal")
        .classList
        .remove("hidden");


    setTimeout(
        () =>
            $("#nameInput").focus(),
        50
    );

}


async function executePending() {

    try {

        myName =
            normalizeName(
                $("#nameInput").value
            );


        if (
            myName.length < 2
        ) {

            throw new Error(
                "Coloque pelo menos 2 caracteres."
            );

        }


        await ensureAuth();


        $("#nameModal")
            .classList
            .add("hidden");


        if (
            pendingAction ===
            "create"
        ) {

            await createRoom();

        }


        if (
            pendingAction ===
            "join"
        ) {

            await joinRoom(
                $("#roomInput").value
            );

        }

    } catch (error) {

        $("#nameError")
            .textContent =
            error.message ||
            "Não foi possível continuar.";

        $("#nameModal")
            .classList
            .remove("hidden");

    }

}


/* =========================
   COPY INVITE
========================= */

$("#copyInvite")
    .onclick =
    async () => {

        const url =
            `${location.origin}${location.pathname}?room=${roomCode}`;


        await navigator
            .clipboard
            .writeText(url);


        toast(
            "CONVITE COPIADO."
        );

    };


/* =========================
   EVENTS
========================= */

$("#createRoom")
    .onclick =
    () =>
        openNameModal(
            "create"
        );


$("#showJoin")
    .onclick =
    () => {

        $("#joinPanel")
            .classList
            .remove("hidden");

        $("#roomInput")
            .focus();

    };


$("#joinRoom")
    .onclick =
    () => {

        if (
            !$("#roomInput").value
        ) {

            $("#homeError")
                .textContent =
                "Digite o código da sala.";

            return;

        }


        openNameModal(
            "join"
        );

    };


$("#confirmName")
    .onclick =
    executePending;


$("#nameInput")
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                executePending();

            }

        }
    );


$("#startGame")
    .onclick =
    startGame;


$("#nextRound")
    .onclick =
    nextRound;


$("#newGame")
    .onclick =
    () => {

        clearInterval(
            timerInterval
        );


        if (unsubscribeRoom)
            unsubscribeRoom();


        roomCode = null;

        roomData = null;


        history.replaceState(
            {},
            "",
            location.pathname
        );


        showScreen(
            "home"
        );

    };


$$(".answer")
    .forEach(button => {

        button.onclick =
            () =>
                chooseAnswer(
                    button.dataset.choice
                );

    });


$$("[data-back]")
    .forEach(button => {

        button.onclick =
            () => {

                if (
                    unsubscribeRoom
                )
                    unsubscribeRoom();


                roomCode = null;

                roomData = null;


                showScreen(
                    "home"
                );

            };

    });


/* =========================
   CURSOR
========================= */

document.addEventListener(
    "mousemove",
    event => {

        $("#cursor")
            .style.left =
            `${event.clientX}px`;

        $("#cursor")
            .style.top =
            `${event.clientY}px`;

    }
);


document
    .querySelectorAll(
        "button"
    )
    .forEach(button => {

        button.addEventListener(
            "mouseenter",
            () =>
                document.body.classList.add(
                    "hovering"
                )
        );

        button.addEventListener(
            "mouseleave",
            () =>
                document.body.classList.remove(
                    "hovering"
                )
        );

    });


/* =========================
   AUTH STATE
========================= */

onAuthStateChanged(
    auth,
    user => {

        uid =
            user?.uid ||
            null;

    }
);


/* =========================
   URL ROOM
========================= */

const urlRoom =
    new URLSearchParams(
        location.search
    ).get("room");


if (urlRoom) {

    $("#roomInput")
        .value =
        urlRoom.toUpperCase();

    $("#joinPanel")
        .classList
        .remove("hidden");

}


/* =========================
   ESCAPE
========================= */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
    .replace(
        /[&<>"']/g,
        character =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[character])
    );

}