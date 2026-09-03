import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, RotateCcw, Save, ScanLine, Trophy, Undo2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const STORE_KEY = "dominican-domino-calculator-react-v1";

const initialState = {
  teams: ["Equipo A", "Equipo B"],
  target: 200,
  rounds: [],
};

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { ...initialState, ...saved };
  } catch {
    return initialState;
  }
}

function DominoTile({ small = false, blankBottom = false }) {
  return (
    <div className={`tile ${small ? "tile--small" : ""}`} aria-hidden="true">
      <div className="half">
        <span className="pip" />
      </div>
      <div className="half">{!blankBottom && <span className="pip" />}</div>
    </div>
  );
}

function analyzeDominoImage(image, sensitivity) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dark = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const dots = [];

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    const luma = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    dark[index] = alpha > 80 && luma < sensitivity ? 1 : 0;
  }

  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= dark.length || seen[next] || !dark[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const ratio = boxW / boxH;
    const density = area / (boxW * boxH);
    const scaledMin = Math.max(10, width * height * 0.000012);
    const scaledMax = Math.max(160, width * height * 0.0022);
    const looksLikePip =
      area >= scaledMin &&
      area <= scaledMax &&
      boxW >= 3 &&
      boxH >= 3 &&
      ratio > 0.42 &&
      ratio < 2.35 &&
      density > 0.28;

    if (looksLikePip) {
      dots.push({
        x: (minX + maxX) / 2 / width,
        y: (minY + maxY) / 2 / height,
        radius: Math.max(boxW, boxH) / 2 / width,
      });
    }
  }

  return dots;
}

function ScoreCard({ index, name, score, hands, last, target, isActive, isLeader, isWinner, onNameChange }) {
  return (
    <article className={`score-card team-${index} ${isActive ? "is-active" : ""} ${isLeader ? "is-leader" : ""} ${isWinner ? "is-winner" : ""}`}>
      <span className="winner-ribbon">Gano</span>
      <span className="side-label">Bando {index === 0 ? "rojo" : "azul"}</span>
      <div className="team-head">
        <input
          className="team-name"
          value={name}
          aria-label={`Nombre ${name}`}
          onChange={(event) => onNameChange(index, event.target.value)}
        />
        <span className="badge">{hands} manos</span>
      </div>
      <div className="score">{score}</div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${Math.min((score / target) * 100, 100)}%` }} />
      </div>
      <div className="meta-row">
        <span>{score >= target ? "Meta alcanzada" : `Faltan ${Math.max(target - score, 0)}`}</span>
        <span>Ultima: {last}</span>
      </div>
    </article>
  );
}

function App() {
  const [state, setState] = useState(loadState);
  const [winner, setWinner] = useState(0);
  const [points, setPoints] = useState(0);
  const [toast, setToast] = useState("");
  const [winnerMessage, setWinnerMessage] = useState(null);
  const [scanner, setScanner] = useState({ image: "", dots: [], sensitivity: 86, analyzed: false });
  const [scannerOpen, setScannerOpen] = useState(false);
  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const totals = useMemo(
    () =>
      state.rounds.reduce(
        (sum, round) => {
          sum[round.team] += round.total;
          return sum;
        },
        [0, 0],
      ),
    [state.rounds],
  );

  const hands = useMemo(
    () =>
      state.rounds.reduce(
        (sum, round) => {
          sum[round.team] += 1;
          return sum;
        },
        [0, 0],
      ),
    [state.rounds],
  );

  const roundTotal = cleanNumber(points);

  const leaderScore = Math.max(...totals);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (scanner.image) URL.revokeObjectURL(scanner.image);
      stopCamera();
    };
  }, [scanner.image]);

  function lastFor(team) {
    return [...state.rounds].reverse().find((round) => round.team === team)?.total || 0;
  }

  function updateTeam(index, value) {
    setState((current) => {
      const teams = [...current.teams];
      teams[index] = value || `Equipo ${index + 1}`;
      return { ...current, teams };
    });
  }

  function updateSetting(key, value, minimum = 0) {
    setState((current) => ({ ...current, [key]: Math.max(cleanNumber(value), minimum) }));
  }

  function addRound() {
    if (!roundTotal) {
      setToast("Anota puntos primero.");
      return;
    }

    const round = {
      team: winner,
      base: cleanNumber(points),
      total: roundTotal,
      note: "",
      at: new Date().toISOString(),
    };

    const nextRounds = [...state.rounds, round];
    const nextScore = nextRounds.reduce((sum, item) => sum + (item.team === winner ? item.total : 0), 0);

    setState((current) => ({ ...current, rounds: nextRounds }));
    setPoints(0);

    if (nextScore >= state.target) {
      setWinnerMessage({
        title: `${state.teams[winner]} gana`,
        text: `Llego a ${nextScore} puntos de una meta de ${state.target}.`,
      });
    }
  }

  function undoRound() {
    if (!state.rounds.length) {
      setToast("No hay manos para deshacer.");
      return;
    }
    setState((current) => ({ ...current, rounds: current.rounds.slice(0, -1) }));
    setToast("Ultima mano deshecha.");
  }

  function resetGame() {
    setState((current) => ({ ...current, teams: [...initialState.teams], rounds: [] }));
    setWinner(0);
    setPoints(0);
    setWinnerMessage(null);
    setToast("Partida nueva lista.");
  }

  function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (scanner.image) URL.revokeObjectURL(scanner.image);
    setScanner({ image: URL.createObjectURL(file), dots: [], sensitivity: scanner.sensitivity, analyzed: false });
  }

  async function startCamera() {
    try {
      setScannerOpen(true);
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setToast("Camara lista.");
    } catch {
      setToast("No pude abrir la camara. Revisa permisos del navegador.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function captureFromCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setToast("Abre la camara primero.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setToast("No pude capturar la foto.");
        return;
      }
      if (scanner.image) URL.revokeObjectURL(scanner.image);
      setScanner((current) => ({ ...current, image: URL.createObjectURL(blob), dots: [], analyzed: false }));
      setToast("Foto capturada.");
    }, "image/jpeg", 0.92);
  }

  function scanImage() {
    if (!imageRef.current) {
      setToast("Elige una foto primero.");
      return;
    }
    const dots = analyzeDominoImage(imageRef.current, scanner.sensitivity);
    setScanner((current) => ({ ...current, dots, analyzed: true }));
    setToast(dots.length ? `${dots.length} puntos detectados.` : "No detecte puntos claros.");
  }

  function useScanResult() {
    setPoints(scanner.dots.length);
    setToast(`${scanner.dots.length} puntos pasados a la mano.`);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Calculadora Domino Dominicano</h1>
          <p className="subtitle">
            Marcador rapido para partidas por parejas.
          </p>
        </div>
      </header>

      <section className="scoreboard" aria-label="Marcador">
        {[0, 1].map((team) => (
          <ScoreCard
            key={team}
            index={team}
            name={state.teams[team]}
            score={totals[team]}
            hands={hands[team]}
            last={lastFor(team)}
            target={state.target}
            isActive={winner === team}
            isLeader={totals[team] === leaderScore && leaderScore > 0}
            isWinner={totals[team] >= state.target}
            onNameChange={updateTeam}
          />
        ))}
      </section>

      <section className="grid">
        <div>
          <section className="panel new-round">
            <h2>Nueva mano</h2>
            <div className="entry-grid">
              <div className="field">
                <span>Equipo que anota</span>
                <div className="team-picker" role="group" aria-label="Equipo que anota">
                  {[0, 1].map((team) => (
                    <button
                      key={team}
                      className={`team-pick team-${team}`}
                      type="button"
                      aria-pressed={winner === team}
                      onClick={() => setWinner(team)}
                    >
                      <span>{state.teams[team]}</span>
                      <strong>{totals[team]}</strong>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Puntos contados</span>
                <input type="number" min="0" max="168" step="1" value={points} onChange={(event) => setPoints(event.target.value)} />
              </label>
            </div>

            <div className="quick" aria-label="Puntos rapidos">
              <button type="button" onClick={() => setPoints(cleanNumber(points) + 30)}>
                +30
              </button>
            </div>

            <div className="actions">
              <button className="btn primary" type="button" onClick={addRound}>
                <Save size={18} />
                Anotar mano
              </button>
            </div>

            <section className="scanner">
              <div className="scanner-head">
                <div>
                  <h3>Calcular por foto</h3>
                  <p>{scannerOpen ? "Enfoca las fichas y captura el conteo." : "Pulsa camara para abrir el visor."}</p>
                </div>
                <div className="camera-actions">
                  <button className="capture-btn" type="button" onClick={startCamera}>
                    <Camera size={18} />
                    Camara
                  </button>
                  <button className="capture-btn capture-btn--light" type="button" onClick={() => {
                    stopCamera();
                    setScannerOpen(false);
                  }}>
                    <CameraOff size={18} />
                    Cerrar
                  </button>
                </div>
              </div>

              {scannerOpen && (
                <div className="scanner-body">
                  <div className="camera-box">
                    <video ref={videoRef} playsInline muted />
                    <button className="btn primary" type="button" onClick={captureFromCamera}>
                      <Camera size={18} />
                      Capturar
                    </button>
                  </div>
                  {scanner.image && (
                    <div className="photo-box">
                      <img ref={imageRef} src={scanner.image} alt="Fichas para calcular" onLoad={scanImage} />
                      {scanner.dots.map((dot, index) => (
                        <span
                          className="detected-dot"
                          key={`${dot.x}-${dot.y}-${index}`}
                          style={{
                            left: `${dot.x * 100}%`,
                            top: `${dot.y * 100}%`,
                            width: `${Math.max(dot.radius * 220, 12)}px`,
                            height: `${Math.max(dot.radius * 220, 12)}px`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="scan-controls">
                    <label className="field">
                      <span>Sensibilidad</span>
                      <input
                        type="range"
                        min="45"
                        max="150"
                        value={scanner.sensitivity}
                        onChange={(event) => setScanner((current) => ({ ...current, sensitivity: Number(event.target.value) }))}
                      />
                    </label>
                    <div className="scan-result">
                      <strong>{scanner.analyzed ? scanner.dots.length : "--"}</strong>
                      <span>puntos</span>
                    </div>
                    <button className="btn ghost" type="button" onClick={scanImage}>
                      <ScanLine size={18} />
                      Analizar
                    </button>
                    <button className="btn primary" type="button" onClick={useScanResult} disabled={!scanner.analyzed}>
                      Usar conteo
                    </button>
                    <label className="fallback-upload">
                      Subir imagen
                      <input type="file" accept="image/*" capture="environment" onChange={handleImage} />
                    </label>
                  </div>
                </div>
              )}
            </section>
          </section>

          <section className="history">
            <h2>Historial</h2>
            <div className="history-teams">
              {[0, 1].map((team) => {
                const teamRounds = state.rounds
                  .map((round, index) => ({ ...round, roundNumber: index + 1 }))
                  .filter((round) => round.team === team)
                  .reverse();

                return (
                  <button
                    className={`history-team team-${team} ${winner === team ? "is-active" : ""}`}
                    key={team}
                    type="button"
                    aria-pressed={winner === team}
                    onClick={() => setWinner(team)}
                  >
                    <div className="history-team-head">
                      <strong>{state.teams[team]}</strong>
                      <span>{totals[team]}</span>
                    </div>
                    <div className="round-list">
                      {!teamRounds.length ? (
                        <div className="empty">Sin manos</div>
                      ) : (
                        teamRounds.map((round) => (
                          <div className={`round team-${round.team}`} key={`${round.at}-${round.roundNumber}`}>
                            <span className="round-points">+{round.total}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="panel">
          <h2>Opciones de mesa</h2>
          <div className="settings">
            <label className="field">
              <span>Meta</span>
              <input type="number" min="50" max="1000" step="5" value={state.target} onChange={(event) => updateSetting("target", event.target.value, 50)} />
            </label>
          </div>

          <div className="actions">
            <button className="btn ghost" type="button" onClick={undoRound}>
              <Undo2 size={18} />
              Deshacer
            </button>
            <button className="btn ghost" type="button" onClick={resetGame}>
              <RotateCcw size={18} />
              Nueva partida
            </button>
          </div>

        </aside>
      </section>

      {winnerMessage && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="winner-title">
            <Trophy size={34} />
            <h3 id="winner-title">{winnerMessage.title}</h3>
            <p>{winnerMessage.text}</p>
            <div className="actions">
              <button className="btn primary" type="button" onClick={resetGame}>
                Otra partida
              </button>
              <button className="btn secondary" type="button" onClick={() => setWinnerMessage(null)}>
                Seguir viendo
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
