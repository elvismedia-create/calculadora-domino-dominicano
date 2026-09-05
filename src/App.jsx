import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Check, RotateCcw, Save, ScanLine, Trash2, Trophy, Undo2, X } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const STORE_KEY = "dominican-domino-calculator-react-v1";
const UPDATE_RELOAD_KEY = "hilario-domino-update-reload";

const initialState = {
  teams: ["Equipo A", "Equipo B"],
  target: 200,
  keepNames: false,
  rounds: [],
};

const confettiPieces = Array.from({ length: 42 }, (_, index) => ({
  id: index,
  left: `${(index * 19) % 100}%`,
  delay: `${(index % 9) * 0.13}s`,
  duration: `${2.6 + (index % 6) * 0.24}s`,
  color: ["#d7142f", "#005bbb", "#ffffff", "#ffc400"][index % 4],
  size: `${8 + (index % 4) * 3}px`,
}));

function IntroScreen() {
  return (
    <section className="intro-screen" aria-label="Cargando Hilario Domino">
      <div className="intro-card">
        <div className="intro-sticker" aria-hidden="true">
          <img src="/assets/hilario-laughing-sticker.png" alt="" />
          <span>Ja ja ja</span>
        </div>
        <div className="intro-title">
          <strong>Hilario Domino</strong>
          <span>Cargando mesa</span>
        </div>
        <div className="intro-bar" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return {
      ...initialState,
      ...saved,
      teams: Array.isArray(saved.teams) && saved.teams.length >= 2 ? saved.teams.slice(0, 2) : initialState.teams,
      keepNames: Boolean(saved.keepNames),
      rounds: Array.isArray(saved.rounds) ? saved.rounds : [],
    };
  } catch {
    return initialState;
  }
}

function analyzeDominoImage(image, sensitivity) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  const total = width * height;
  const { data } = ctx.getImageData(0, 0, width, height);
  const luma = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    luma[i] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }

  // Imagen integral: nivel de fondo local, para aguantar luz desigual y sombras.
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += luma[y * width + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
    }
  }

  const bgRadius = Math.max(8, Math.round(Math.min(width, height) / 22));
  function localMean(x, y) {
    const x0 = Math.max(0, x - bgRadius);
    const y0 = Math.max(0, y - bgRadius);
    const x1 = Math.min(width, x + bgRadius + 1);
    const y1 = Math.min(height, y + bgRadius + 1);
    const sum =
      integral[y1 * stride + x1] -
      integral[y0 * stride + x1] -
      integral[y1 * stride + x0] +
      integral[y0 * stride + x0];
    return sum / ((x1 - x0) * (y1 - y0));
  }

  // La sensibilidad del control (0-100) se traduce en cuanto contraste exigimos.
  const contrast = Math.max(18, Math.min(90, 75 - sensitivity * 0.5));
  const dark = new Uint8Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = luma[index];
      dark[index] = value < 205 && value < localMean(x, y) - contrast ? 1 : 0;
    }
  }

  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  const candidates = [];
  const minArea = Math.max(6, total * 0.000006);
  const maxArea = total * 0.004;

  for (let start = 0; start < total; start += 1) {
    if (!dark[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;

    let area = 0;
    let lumaSum = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (top > 0) {
      top -= 1;
      const current = stack[top];
      const x = current % width;
      const y = (current - x) / width;
      area += 1;
      lumaSum += luma[current];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && dark[current - 1] && !seen[current - 1]) {
        seen[current - 1] = 1;
        stack[top] = current - 1;
        top += 1;
      }
      if (x < width - 1 && dark[current + 1] && !seen[current + 1]) {
        seen[current + 1] = 1;
        stack[top] = current + 1;
        top += 1;
      }
      if (y > 0 && dark[current - width] && !seen[current - width]) {
        seen[current - width] = 1;
        stack[top] = current - width;
        top += 1;
      }
      if (y < height - 1 && dark[current + width] && !seen[current + width]) {
        seen[current + width] = 1;
        stack[top] = current + width;
        top += 1;
      }
    }

    if (area < minArea || area > maxArea) continue;
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (boxW < 3 || boxH < 3) continue;
    if (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) continue;

    const ratio = boxW / boxH;
    if (ratio < 0.55 || ratio > 1.85) continue;
    if (area / (boxW * boxH) < 0.55) continue;

    const radius = (boxW + boxH) / 4;
    const circularity = area / (Math.PI * radius * radius);
    if (circularity < 0.62 || circularity > 1.45) continue;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    // Un punto tiene que ser claramente mas oscuro que la cara de la ficha.
    if (localMean(Math.round(centerX), Math.round(centerY)) - lumaSum / area < 26) continue;

    candidates.push({ centerX, centerY, radius, area });
  }

  if (!candidates.length) return { dots: [], rejected: true };

  // Los puntos de una misma foto miden practicamente lo mismo: fuera lo que se salga.
  const radii = candidates.map((candidate) => candidate.radius).sort((a, b) => a - b);
  const median = radii[Math.floor(radii.length / 2)];
  const sized = candidates.filter(
    (candidate) => candidate.radius >= median * 0.55 && candidate.radius <= median * 1.75,
  );
  if (!sized.length) return { dots: [], rejected: true };

  sized.sort((a, b) => b.area - a.area);
  const kept = [];
  for (const candidate of sized) {
    const duplicated = kept.some((other) => {
      const dx = candidate.centerX - other.centerX;
      const dy = candidate.centerY - other.centerY;
      const limit = Math.min(candidate.radius, other.radius) * 0.8;
      return dx * dx + dy * dy < limit * limit;
    });
    if (!duplicated) kept.push(candidate);
  }

  if (kept.length > 200) return { dots: [], rejected: true };

  kept.sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  return {
    dots: kept.map((candidate) => ({
      x: candidate.centerX / width,
      y: candidate.centerY / height,
      radius: candidate.radius / width,
    })),
    rejected: false,
  };
}

function ScoreCard({ index, name, score, last, target, isActive, isLeader, isWinner, onNameChange, onSelect }) {
  return (
    <article
      className={`score-card team-${index} ${isActive ? "is-active" : ""} ${isLeader ? "is-leader" : ""} ${isWinner ? "is-winner" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="winner-ribbon">Gano</span>
      <span className="side-label">Bando {index === 0 ? "rojo" : "azul"}</span>
      <div className="team-head">
        <input
          className="team-name"
          value={name}
          aria-label={`Nombre ${name}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => onNameChange(index, event.target.value)}
        />
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
  const [showIntro, setShowIntro] = useState(true);
  const [winner, setWinner] = useState(0);
  const [points, setPoints] = useState(0);
  const [toast, setToast] = useState("");
  const [winnerMessage, setWinnerMessage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [scanScoreConfirm, setScanScoreConfirm] = useState(null);
  const [scanner, setScanner] = useState({ image: "", dots: [], sensitivity: 0, analyzed: false });
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

  const leaderScore = Math.max(...totals);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    let refreshing = false;
    sessionStorage.removeItem(UPDATE_RELOAD_KEY);

    const reloadForUpdate = () => {
      if (refreshing || sessionStorage.getItem(UPDATE_RELOAD_KEY) === "1") return;
      refreshing = true;
      sessionStorage.setItem(UPDATE_RELOAD_KEY, "1");
      window.location.reload();
    };

    const registerWorker = async () => {
      const registration = await navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" });

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "activated" && navigator.serviceWorker.controller) {
            reloadForUpdate();
          }
        });
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      await registration.update();
    };

    const checkForUpdates = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
    };

    window.addEventListener("focus", checkForUpdates);
    document.addEventListener("visibilitychange", checkForUpdates);
    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
    registerWorker().catch(() => undefined);

    return () => {
      window.removeEventListener("focus", checkForUpdates);
      document.removeEventListener("visibilitychange", checkForUpdates);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 2400);
    return () => window.clearTimeout(timer);
  }, []);

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

  function addRound(totalOverride, teamOverride = winner) {
    const total = cleanNumber(totalOverride ?? points);
    const scoringTeam = teamOverride;

    if (!total) {
      setToast("Anota puntos primero.");
      return;
    }

    const round = {
      team: scoringTeam,
      base: total,
      total,
      note: "",
      at: new Date().toISOString(),
    };

    const nextRounds = [...state.rounds, round];
    const nextScore = nextRounds.reduce((sum, item) => sum + (item.team === scoringTeam ? item.total : 0), 0);

    setState((current) => ({ ...current, rounds: nextRounds }));
    setWinner(scoringTeam);
    setPoints(0);

    if (nextScore >= state.target) {
      setWinnerMessage({
        title: `${state.teams[scoringTeam]} gana`,
        text: `Llego a ${nextScore} puntos de una meta de ${state.target}.`,
      });
    }
  }

  function confirmScanScore(team) {
    if (!scanScoreConfirm) return;
    const total = scanScoreConfirm.total;
    setScanScoreConfirm(null);
    clearScanPhoto();
    setPoints(0);
    addRound(total, team);
  }

  function undoRound() {
    if (!state.rounds.length) {
      setToast("No hay manos para deshacer.");
      return;
    }
    setState((current) => ({ ...current, rounds: current.rounds.slice(0, -1) }));
    setToast("Ultima mano deshecha.");
  }

  function deleteRound(roundIndex) {
    setState((current) => ({ ...current, rounds: current.rounds.filter((_, index) => index !== roundIndex) }));
    setDeleteConfirm(null);
    setWinnerMessage(null);
    setToast("Anotacion borrada.");
  }

  function resetGame() {
    setState((current) => ({
      ...current,
      teams: current.keepNames ? current.teams : [...initialState.teams],
      rounds: [],
    }));
    setWinner(0);
    setPoints(0);
    setDeleteConfirm(null);
    setScanScoreConfirm(null);
    setWinnerMessage(null);
    setToast("Partida nueva lista.");
  }

  function clearScanPhoto() {
    setScanner((current) => {
      if (current.image) URL.revokeObjectURL(current.image);
      return { ...current, image: "", dots: [], analyzed: false };
    });
  }

  function discardPhoto() {
    clearScanPhoto();
    setToast("Foto desechada. Toma otra cuando quieras.");
  }

  function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    setScanner((current) => {
      if (current.image) URL.revokeObjectURL(current.image);
      return { ...current, image: imageUrl, dots: [], analyzed: false };
    });
    event.target.value = "";
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
      const imageUrl = URL.createObjectURL(blob);
      setScanner((current) => {
        if (current.image) URL.revokeObjectURL(current.image);
        return { ...current, image: imageUrl, dots: [], analyzed: false };
      });
      setToast("Foto capturada.");
    }, "image/jpeg", 0.92);
  }

  function scanImage() {
    if (!imageRef.current) {
      setToast("Elige una foto primero.");
      return;
    }
    const result = analyzeDominoImage(imageRef.current, scanner.sensitivity);
    const dots = result.dots;
    setScanner((current) => ({ ...current, dots, analyzed: true }));
    if (result.rejected || !dots.length) {
      setToast("No detecte puntos. Acerca las fichas o mueve la sensibilidad.");
      return;
    }
    setToast(`${dots.length} puntos detectados.`);
  }

  function useScanResult() {
    const total = scanner.dots.length;
    setPoints(total);
    clearScanPhoto();
    setToast(`${total} puntos pasados a la mano.`);
  }

  function useScanAndScore() {
    const total = scanner.dots.length;
    setScanScoreConfirm({ total });
  }

  return (
    <main className="app">
      <header className="hero-banner" aria-label="Hilario domino">
        <img src="/assets/hilario-domino-banner.jpg" alt="Hilario Domino" />
      </header>

      <section className="scoreboard" aria-label="Marcador">
        {[0, 1].map((team) => (
          <ScoreCard
            key={team}
            index={team}
            name={state.teams[team]}
            score={totals[team]}
            last={lastFor(team)}
            target={state.target}
            isActive={winner === team}
            isLeader={totals[team] === leaderScore && leaderScore > 0}
            isWinner={totals[team] >= state.target}
            onNameChange={updateTeam}
            onSelect={() => setWinner(team)}
          />
        ))}
      </section>

      <section className="grid">
        <div>
          <section className="panel new-round">
            <h2>Anotación</h2>
            <div className="entry-grid">
              <label className="field">
                <span>Puntos contados</span>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="1"
                  inputMode="numeric"
                  value={points}
                  onFocus={() => {
                    if (cleanNumber(points) === 0) setPoints("");
                  }}
                  onBlur={() => {
                    if (points === "") setPoints(0);
                  }}
                  onChange={(event) => setPoints(event.target.value)}
                />
              </label>
            </div>

            <div className="quick" aria-label="Puntos rapidos">
              <button type="button" onClick={() => setPoints(cleanNumber(points) + 30)}>
                +30
              </button>
            </div>

            <div className="actions">
              <button className="btn primary score-submit" type="button" onClick={() => addRound()}>
                <Save size={18} />
                Anotar mano
              </button>
            </div>

            <section className="scanner">
              <div className="scanner-head">
                <div>
                  <h3>Calcular por foto</h3>
                  <p>
                    {scanner.image
                      ? "Si esa foto no sirve, desechala o toma otra."
                      : scannerOpen
                        ? "Enfoca las fichas y captura el conteo."
                        : "Pulsa camara para abrir el visor."}
                  </p>
                </div>
                <div className="camera-actions">
                  <button className="capture-btn" type="button" onClick={startCamera}>
                    <Camera size={18} />
                    Camara
                  </button>
                  {scannerOpen && (
                    <button className="capture-btn capture-btn--light" type="button" onClick={() => {
                      stopCamera();
                      setScannerOpen(false);
                    }}>
                      <CameraOff size={18} />
                      Cerrar
                    </button>
                  )}
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
                      <div className="photo-actions">
                        <button className="photo-action" type="button" onClick={discardPhoto}>
                          <X size={16} />
                          Desechar
                        </button>
                        <button className="photo-action photo-action--primary" type="button" onClick={captureFromCamera}>
                          <Camera size={16} />
                          Tomar otra
                        </button>
                      </div>
                      {scanner.dots.map((dot, index) => (
                        <span
                          className="detected-dot"
                          key={`${dot.x}-${dot.y}-${index}`}
                          style={{
                            left: `${dot.x * 100}%`,
                            top: `${dot.y * 100}%`,
                            width: `${Math.max(dot.radius * 2 * 100, 2.6)}%`,
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
                        min="0"
                        max="100"
                        value={scanner.sensitivity}
                        onChange={(event) => {
                          const sensitivity = Number(event.target.value);
                          setScanner((current) => ({ ...current, sensitivity }));
                        }}
                        onMouseUp={scanImage}
                        onTouchEnd={scanImage}
                      />
                    </label>
                    <div className="scan-result">
                      <strong>{scanner.analyzed ? scanner.dots.length : "--"}</strong>
                      <span>puntos</span>
                    </div>
                    {scanner.analyzed && (
                      <p className="scan-note">
                        Revisa los puntos marcados antes de usar el conteo.
                      </p>
                    )}
                    <button className="btn ghost" type="button" onClick={scanImage}>
                      <ScanLine size={18} />
                      Analizar
                    </button>
                    <button className="btn primary" type="button" onClick={useScanResult} disabled={!scanner.analyzed}>
                      Usar conteo
                    </button>
                    <button className="btn primary score-submit" type="button" onClick={useScanAndScore} disabled={!scanner.analyzed || !scanner.dots.length}>
                      <Check size={18} />
                      Elegir bando y anotar
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
            <h2>Puntuaciones</h2>
            <div className="history-teams">
              {[0, 1].map((team) => {
                const teamRounds = state.rounds
                  .map((round, index) => ({ ...round, roundIndex: index, roundNumber: index + 1 }))
                  .filter((round) => round.team === team)
                  .reverse();
                const latestRoundIndex = teamRounds[0]?.roundIndex;

                return (
                  <div
                    className={`history-team team-${team} ${winner === team ? "is-active" : ""}`}
                    key={team}
                    role="button"
                    tabIndex={0}
                    aria-pressed={winner === team}
                    onClick={() => setWinner(team)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setWinner(team);
                      }
                    }}
                  >
                    <div className="history-team-head">
                      <div>
                        <strong>{state.teams[team]}</strong>
                        <small>{teamRounds.length ? `${teamRounds.length} anotaciones` : "Sin anotaciones"}</small>
                      </div>
                      <span>{totals[team]}</span>
                    </div>
                    <div className="round-list">
                      {!teamRounds.length ? (
                        <div className="empty">Sin manos</div>
                      ) : (
                        teamRounds.map((round) => (
                          <div className={`round team-${round.team} ${round.roundIndex === latestRoundIndex ? "is-latest" : ""}`} key={`${round.at}-${round.roundNumber}`}>
                            <span className="round-points">+{round.total}</span>
                            {winner === team && (
                              <button
                                className="delete-round"
                                type="button"
                                aria-label={`Borrar +${round.total}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteConfirm({
                                    roundIndex: round.roundIndex,
                                    total: round.total,
                                    teamName: state.teams[team],
                                  });
                                }}
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={state.keepNames}
              onChange={(event) => setState((current) => ({ ...current, keepNames: event.target.checked }))}
            />
            <span>Mantener nombres al empezar otra partida</span>
          </label>

        </aside>
      </section>

      {deleteConfirm && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <Trash2 size={30} />
            <h3 id="delete-title">Borrar +{deleteConfirm.total}</h3>
            <p>Esta anotacion de {deleteConfirm.teamName} se quitara del marcador.</p>
            <div className="actions">
              <button className="btn danger" type="button" onClick={() => deleteRound(deleteConfirm.roundIndex)}>
                <Trash2 size={18} />
                Borrar
              </button>
              <button className="btn secondary" type="button" onClick={() => setDeleteConfirm(null)}>
                <X size={18} />
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}

      {scanScoreConfirm && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal scan-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="scan-score-title">
            <Check size={30} />
            <h3 id="scan-score-title">A que bando van?</h3>
            <p>La camara conto {scanScoreConfirm.total} puntos. Elige el bando antes de anotar.</p>
            <div className="scan-team-options">
              {[0, 1].map((team) => (
                <button
                  className={`scan-team-option team-${team} ${winner === team ? "is-active" : ""}`}
                  type="button"
                  key={team}
                  onClick={() => confirmScanScore(team)}
                >
                  <span>{team === 0 ? "Bando rojo" : "Bando azul"}</span>
                  <strong>{state.teams[team]}</strong>
                  <em>+{scanScoreConfirm.total}</em>
                </button>
              ))}
            </div>
            <button className="btn secondary" type="button" onClick={() => setScanScoreConfirm(null)}>
              <X size={18} />
              Cancelar
            </button>
          </section>
        </div>
      )}

      {winnerMessage && (
        <div className="modal-backdrop" role="presentation">
          <div className="confetti" aria-hidden="true">
            {confettiPieces.map((piece) => (
              <span
                key={piece.id}
                style={{
                  left: piece.left,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                  background: piece.color,
                  width: piece.size,
                  height: piece.size,
                }}
              />
            ))}
          </div>
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

      {showIntro && <IntroScreen />}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
