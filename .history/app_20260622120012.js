// ============================================================
// UNO Master — Cliente Vanilla JS
// Se comunica con el backend Node/WS vía mensajes JSON
// { type: "...", data: ... }
// ============================================================

(() => {
    // ---------- DOM ----------
    const $ = (id) => document.getElementById(id);
    const lobby = $("lobby");
    const game = $("game");
    const serverInput = $("serverUrl");
    const nickInput = $("nickname");
    const btnJoin = $("btnJoin");
    const lobbyStatus = $("lobbyStatus");
    const lobbyList = $("lobbyList");
    const connStatus = $("connStatus");
    const turnInfo = $("turnInfo");
    const directionInfo = $("directionInfo");
    const meNameEl = $("meName");
    const opponentsEl = $("opponents");
    const discardPile = $("discardPile");
    const drawPile = $("drawPile");
    const logEl = $("log");
    const handEl = $("hand");
    const unoButtons = $("unoButtons");
    const btnUno = $("btnUno");
    const btnCorte = $("btnCorte");
    const colorPicker = $("colorPicker");
    const cancelColor = $("cancelColor");
    const popup = $("popup");
    const popupMsg = $("popupMsg");
    const popupOk = $("popupOk");
    const gameOver = $("gameOver");
    const gameOverMsg = $("gameOverMsg");
    const btnRestart = $("btnRestart");

    // ---------- Estado ----------
    let ws = null;
    let myName = "";
    let lastState = null;
    let waitingForColor = null; // index de carta comodín en espera
    let waitingRoomNames = [];

    // ---------- Server URL ----------
    const params = new URLSearchParams(location.search);
    serverInput.value = "https://juego-uno-servidor.onrender.com";

    // ---------- Helpers de assets ----------
    const COLOR_MAP = { Rojo: "Red", Amarillo: "Yellow", Verde: "Green", Azul: "Blue" };
    const VALUE_MAP = {
        "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
        "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
        "Bloqueo": "SkipTurn",
        "CambioSentido": "Reverse",
        "+2": "DrawTwo",
    };

    function cardImage(card) {
        // Comodines: Wild_ChangeColor / Wild_DrawFour
        if (card.value === "CambiaColor") return "./assets/Wild_ChangeColor.png";
        if (card.value === "+4") return "./assets/Wild_DrawFour.png";
        const c = COLOR_MAP[card.color];
        const v = VALUE_MAP[card.value];
        if (!c || !v) return "./assets/card_back.png";
        return `./assets/${c}_${v}.png`;
    }

    function isWild(card) {
        return card.value === "CambiaColor" || card.value === "+4";
    }

    // ---------- WebSocket ----------
    function connect(url) {
        setConn("Conectando…", "");
        try {
        ws = new WebSocket(url);
        } catch (e) {
        setConn("URL inválida.", "error");
        return;
        }
        ws.onopen = () => {
        setConn("Conectado.", "ok");
        send("joinGame", myName);
        };
        ws.onclose = () => {
        setConn("Desconectado del servidor.", "error");
        btnJoin.disabled = false;
        };
        ws.onerror = () => {
        setConn("Error de conexión. Revisa la URL del servidor.", "error");
        };
        ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        handleServer(msg.type, msg.data);
        };
    }

    function send(type, data) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type, data }));
    }

    function setConn(text, cls) {
        connStatus.textContent = text;
        connStatus.className = "conn-status " + (cls || "");
    }

    // ---------- Server -> Cliente ----------
    function handleServer(type, data) {
        switch (type) {
        case "waitingRoom":
            waitingRoomNames = data;
            renderLobby();
            break;
        case "gameState":
            lastState = data;
            if (lobby.classList.contains("hidden") === false) {
            lobby.classList.add("hidden");
            game.classList.remove("hidden");
            }
            renderGame(data);
            break;
        case "showPopup":
            showPopup(data);
            break;
        case "errorMsg":
            // Notificación no bloqueante
            flashLog("⚠️ " + data);
            break;
        case "gameOver":
            showGameOver(data);
            break;
        }
    }

    // ---------- Lobby ----------
    function renderLobby() {
        lobbyStatus.classList.remove("hidden");
        lobbyList.innerHTML = "";
        for (const n of waitingRoomNames) {
        const li = document.createElement("li");
        li.textContent = n + (n === myName ? "  (tú)" : "");
        lobbyList.appendChild(li);
        }
    }

    btnJoin.addEventListener("click", () => {
        const name = nickInput.value.trim();
        const url = serverInput.value.trim();
        if (!name) { setConn("Escribe tu nombre.", "error"); return; }
        if (!url) { setConn("Escribe la URL del servidor.", "error"); return; }
        myName = name;
        localStorage.setItem("uno_server", url);
        btnJoin.disabled = true;
        connect(url);
    });

    nickInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btnJoin.click();
    });

    // ---------- Game render ----------
    function renderGame(s) {
        meNameEl.textContent = "👤 " + myName;
        turnInfo.textContent = s.isMyTurn
        ? "Es tu turno"
        : `Turno de ${s.currentTurnName}`;
        directionInfo.textContent = s.direction.includes("Derecha") ? "➡️" : "⬅️";

        // Log
        if (s.log) logEl.textContent = s.log;

        // Discard pile (top card)
        discardPile.innerHTML = "";
        if (s.topCard) {
        const img = document.createElement("img");
        img.src = cardImage(s.topCard);
        img.alt = `${s.topCard.color} ${s.topCard.value}`;
        discardPile.appendChild(img);
        }
        const label = document.createElement("span");
        label.className = "pile-label";
        label.textContent = "Descarte";
        discardPile.appendChild(label);

        // Hand
        handEl.innerHTML = "";
        s.hand.forEach((card, i) => {
        const el = document.createElement("div");
        el.className = "card";
        const playable = s.isMyTurn && cardMatches(card, s.topCard);
        if (playable) el.classList.add("playable");
        else if (s.isMyTurn) el.classList.add("disabled");
        const img = document.createElement("img");
        img.src = cardImage(card);
        img.alt = `${card.color} ${card.value}`;
        el.appendChild(img);
        el.addEventListener("click", () => attemptPlay(i, card, playable));
        handEl.appendChild(el);
        });

        // Opponents – calculamos quiénes son y cuántas cartas tienen (basado en el nombre del turno actual + rotación)
        renderOpponents(s);

        // Botonera UNO/CORTE
        if (s.mostrarBotoneraUno) {
        unoButtons.classList.remove("hidden");
        // Si tengo 1 carta y no he cantado: mostrar UNO. Si no, mostrar CORTE.
        const tengoUna = s.hand.length === 1;
        btnUno.style.display = tengoUna && !s.dijoUno ? "" : "none";
        btnCorte.style.display = !tengoUna ? "" : "none";
        } else {
        unoButtons.classList.add("hidden");
        }

        // Draw pile clickeable solo en mi turno
        drawPile.style.opacity = s.isMyTurn ? "1" : "0.6";
        drawPile.style.cursor = s.isMyTurn ? "pointer" : "default";
    }

    function cardMatches(card, top) {
        if (!top) return true;
        if (isWild(card)) return true;
        return card.color === top.color || card.value === top.value;
    }

    function renderOpponents(s) {
        // El servidor no nos manda la lista de jugadores en gameState; reconstruimos desde waitingRoomNames
        opponentsEl.innerHTML = "";
        if (!waitingRoomNames || waitingRoomNames.length === 0) return;
        const meIdx = waitingRoomNames.indexOf(myName);
        if (meIdx === -1) return;
        const ordered = [];
        for (let i = 1; i < waitingRoomNames.length; i++) {
        ordered.push(waitingRoomNames[(meIdx + i) % waitingRoomNames.length]);
        }
        for (const name of ordered) {
        const wrap = document.createElement("div");
        wrap.className = "opponent";
        if (name === s.currentTurnName) wrap.classList.add("active");
        const n = document.createElement("div");
        n.className = "opponent-name";
        n.textContent = name;
        wrap.appendChild(n);
        // No conocemos el tamaño exacto de la mano oponente: mostramos un fan visual estático
        const fan = document.createElement("div");
        fan.className = "opponent-cards";
        for (let i = 0; i < 5; i++) {
            const m = document.createElement("div");
            m.className = "mini-card";
            fan.appendChild(m);
        }
        wrap.appendChild(fan);
        opponentsEl.appendChild(wrap);
        }
    }

    function flashLog(text) {
        logEl.textContent = text;
    }

    // ---------- Acciones ----------
    function attemptPlay(index, card, playable) {
        if (!playable) return;
        if (isWild(card)) {
        waitingForColor = index;
        colorPicker.classList.remove("hidden");
        return;
        }
        send("playCard", { index, chosenColor: null });
    }

    drawPile.addEventListener("click", () => {
        if (!lastState || !lastState.isMyTurn) return;
        send("drawCard");
    });

    btnUno.addEventListener("click", () => send("cantarUno"));
    btnCorte.addEventListener("click", () => send("cantarCorte"));

    // Color picker
    colorPicker.querySelectorAll(".color-btn").forEach((b) => {
        b.addEventListener("click", () => {
        if (waitingForColor === null) return;
        const color = b.dataset.color;
        send("playCard", { index: waitingForColor, chosenColor: color });
        waitingForColor = null;
        colorPicker.classList.add("hidden");
        });
    });
    cancelColor.addEventListener("click", () => {
        waitingForColor = null;
        colorPicker.classList.add("hidden");
    });

    // Popup
    function showPopup(text) {
        popupMsg.textContent = text;
        popup.classList.remove("hidden");
    }
    popupOk.addEventListener("click", () => {
        popup.classList.add("hidden");
        send("resolvePopup");
    });

    // Game over
    function showGameOver(msg) {
        gameOverMsg.textContent = msg;
        gameOver.classList.remove("hidden");
    }
    btnRestart.addEventListener("click", () => {
        location.reload();
    });
})();
