import { PartitionedBuffer, type Schema } from "../mod.ts";

type Position = { x: number; y: number };
type Velocity = { vx: number; vy: number };
type Life = { current: number; total: number };
// kind: 0=rocket, 1=spark; color: 0..255 (ANSI 256), glyph: code point
type Meta = { kind: number; color: number; glyph: number };

const positionSchema: Schema<Position> = { x: Float32Array, y: Float32Array };
const velocitySchema: Schema<Velocity> = { vx: Float32Array, vy: Float32Array };
const lifeSchema: Schema<Life> = { current: Float32Array, total: Float32Array };
const metaSchema: Schema<Meta> = { kind: Uint8Array, color: Uint8Array, glyph: Uint16Array };

function nowSeconds(): number {
  return Date.now() / 1000;
}

function getTerminalSize(): { width: number; height: number } {
  try {
    // Deno specific; fallback to defaults
    // deno-lint-ignore no-explicit-any
    const denoAny = (globalThis as any).Deno;
    if (denoAny && typeof denoAny.consoleSize === "function") {
      const { columns, rows } = denoAny.consoleSize(denoAny.stdout.rid);
      return { width: Math.max(40, columns), height: Math.max(20, rows) };
    }
  } catch (_) {
    // ignore
  }
  const columns = (globalThis as unknown as { Deno?: never }).Deno ? 80 : (typeof Deno !== "undefined" ? 80 : 80);
  const rows = (globalThis as unknown as { Deno?: never }).Deno ? 30 : (typeof Deno !== "undefined" ? 30 : 30);
  return { width: columns, height: rows };
}

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : (n > max ? max : n);
}

class FireworksDemo {
  readonly #buffer: PartitionedBuffer;
  readonly #maxParticles: number;
  #activeParticles = 0;
  #width: number;
  #height: number;
  #lastSpawnTime = 0;
  #spawnInterval = 0.18; // seconds between rockets
  #fpsEMA = 60;
  #fpsAlpha = 0.1;
  #rocketsSpawnedSec = 0;
  #explosionsSec = 0;
  #spawnRate = 0;
  #explosionRate = 0;
  #lastRateTick = nowSeconds();

  constructor(maxParticles: number) {
    this.#maxParticles = maxParticles;

    const { width, height } = getTerminalSize();
    this.#width = width;
    this.#height = height - 5; // reserve rows for HUD

    // Compute conservative buffer size per particle
    const estimatedBytesPerParticle = 64;
    const bufferSize = Math.ceil(maxParticles * estimatedBytesPerParticle);

    this.#buffer = new PartitionedBuffer(bufferSize, maxParticles);

    this.#buffer.addPartition<Position>({ name: "position", schema: positionSchema });
    this.#buffer.addPartition<Velocity>({ name: "velocity", schema: velocitySchema });
    this.#buffer.addPartition<Life>({ name: "life", schema: lifeSchema });
    this.#buffer.addPartition<Meta>({ name: "meta", schema: metaSchema });
  }

  get activeParticles(): number {
    return this.#activeParticles;
  }

  get maxParticles(): number {
    return this.#maxParticles;
  }

  spawnRocket(): boolean {
    if (this.#activeParticles >= this.#maxParticles) return false;

    const pos = this.#buffer.getPartition<Position>("position")!;
    const vel = this.#buffer.getPartition<Velocity>("velocity")!;
    const life = this.#buffer.getPartition<Life>("life")!;
    const meta = this.#buffer.getPartition<Meta>("meta")!;

    const index = this.#activeParticles++;

    const x = 10 + Math.random() * (this.#width - 20);
    const y = this.#height - 2;
    const speed = 20 + Math.random() * 25;

    pos.partitions.x[index] = x;
    pos.partitions.y[index] = y;
    vel.partitions.vx[index] = (Math.random() - 0.5) * 4;
    vel.partitions.vy[index] = -speed;

    life.partitions.current[index] = 1.5 + Math.random() * 0.9; // duration until explode
    life.partitions.total[index] = life.partitions.current[index]!;

    meta.partitions.kind[index] = 0; // rocket
    meta.partitions.color[index] = 196 + Math.floor(Math.random() * 36); // bright reds/yellows
    meta.partitions.glyph[index] = "^".codePointAt(0)!;

    this.#rocketsSpawnedSec++;
    return true;
  }

  #explode(x: number, y: number, baseColor: number): void {
    this.#explosionsSec++;
    const sparks = 40 + Math.floor(Math.random() * 40);
    const pos = this.#buffer.getPartition<Position>("position")!;
    const vel = this.#buffer.getPartition<Velocity>("velocity")!;
    const life = this.#buffer.getPartition<Life>("life")!;
    const meta = this.#buffer.getPartition<Meta>("meta")!;

    for (let s = 0; s < sparks && this.#activeParticles < this.#maxParticles; s++) {
      const index = this.#activeParticles++;

      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 25;

      pos.partitions.x[index] = x;
      pos.partitions.y[index] = y;
      vel.partitions.vx[index] = Math.cos(angle) * speed;
      vel.partitions.vy[index] = Math.sin(angle) * speed;

      const ttl = 1.2 + Math.random() * 1.2;
      life.partitions.current[index] = ttl;
      life.partitions.total[index] = ttl;

      meta.partitions.kind[index] = 1; // spark
      meta.partitions.color[index] = clamp(baseColor + (-10 + Math.floor(Math.random() * 21)), 16, 231);
      meta.partitions.glyph[index] = "*".codePointAt(0)!;
    }
  }

  #moveParticle(fromIndex: number, toIndex: number): void {
    const pos = this.#buffer.getPartition<Position>("position")!;
    const vel = this.#buffer.getPartition<Velocity>("velocity")!;
    const life = this.#buffer.getPartition<Life>("life")!;
    const meta = this.#buffer.getPartition<Meta>("meta")!;

    pos.partitions.x[toIndex] = pos.partitions.x[fromIndex]!;
    pos.partitions.y[toIndex] = pos.partitions.y[fromIndex]!;
    vel.partitions.vx[toIndex] = vel.partitions.vx[fromIndex]!;
    vel.partitions.vy[toIndex] = vel.partitions.vy[fromIndex]!;
    life.partitions.current[toIndex] = life.partitions.current[fromIndex]!;
    life.partitions.total[toIndex] = life.partitions.total[fromIndex]!;
    meta.partitions.kind[toIndex] = meta.partitions.kind[fromIndex]!;
    meta.partitions.color[toIndex] = meta.partitions.color[fromIndex]!;
    meta.partitions.glyph[toIndex] = meta.partitions.glyph[fromIndex]!;
  }

  update(deltaTime: number): void {
    const g = 28; // gravity (rows/sec^2)
    const air = 0.99; // simple damping

    const pos = this.#buffer.getPartition<Position>("position")!;
    const vel = this.#buffer.getPartition<Velocity>("velocity")!;
    const life = this.#buffer.getPartition<Life>("life")!;
    const meta = this.#buffer.getPartition<Meta>("meta")!;

    let aliveCount = 0;

    const now = nowSeconds();
    // FPS (EMA)
    if (deltaTime > 0) {
      const fpsInstant = 1 / deltaTime;
      this.#fpsEMA = this.#fpsEMA * (1 - this.#fpsAlpha) + fpsInstant * this.#fpsAlpha;
    }
    // Per-second rates
    if (now - this.#lastRateTick >= 1) {
      this.#spawnRate = this.#rocketsSpawnedSec;
      this.#explosionRate = this.#explosionsSec;
      this.#rocketsSpawnedSec = 0;
      this.#explosionsSec = 0;
      this.#lastRateTick = now;
    }
    if (now - this.#lastSpawnTime >= this.#spawnInterval) {
      this.spawnRocket();
      // Occasionally spawn two
      if (Math.random() < 0.3) this.spawnRocket();
      this.#lastSpawnTime = now;
    }

    for (let i = 0; i < this.#activeParticles; i++) {
      const kind = meta.partitions.kind[i]!;

      // Decrease remaining life
      life.partitions.current[i]! -= deltaTime;
      if (life.partitions.current[i]! <= 0) {
        // Explode rocket at end of life
        if (kind === 0) {
          this.#explode(pos.partitions.x[i]!, pos.partitions.y[i]!, meta.partitions.color[i]!);
        }
        continue;
      }

      // Physics
      vel.partitions.vy[i]! += g * deltaTime;
      vel.partitions.vx[i]! *= air;
      vel.partitions.vy[i]! *= air;

      pos.partitions.x[i]! += vel.partitions.vx[i]! * deltaTime;
      pos.partitions.y[i]! += vel.partitions.vy[i]! * deltaTime;

      // Bounds and explode rockets at apex (when vy crosses from negative to positive)
      if (kind === 0 && vel.partitions.vy[i]! > 0) {
        this.#explode(pos.partitions.x[i]!, pos.partitions.y[i]!, meta.partitions.color[i]!);
        continue;
      }

      // Cull out-of-bounds and ground hits for sparks
      if (
        pos.partitions.x[i]! < 0 || pos.partitions.x[i]! >= this.#width ||
        pos.partitions.y[i]! < 0 || pos.partitions.y[i]! >= this.#height
      ) {
        continue;
      }

      // Fade glyph for sparks based on life ratio
      if (kind === 1) {
        const ratio = life.partitions.current[i]! / life.partitions.total[i]!;
        meta.partitions.glyph[i] = (ratio < 0.33)
          ? ".".codePointAt(0)!
          : (ratio < 0.66)
          ? "+".codePointAt(0)!
          : "*".codePointAt(0)!;
      } else {
        meta.partitions.glyph[i] = "^".codePointAt(0)!;
      }

      if (i !== aliveCount) {
        this.#moveParticle(i, aliveCount);
      }
      aliveCount++;
    }

    this.#activeParticles = aliveCount;
  }

  renderFrame(): string {
    const gridWidth = this.#width;
    const gridHeight = this.#height;
    const frame: string[] = new Array(gridWidth * gridHeight);
    for (let k = 0; k < frame.length; k++) frame[k] = " ";

    const pos = this.#buffer.getPartition<Position>("position")!;
    const meta = this.#buffer.getPartition<Meta>("meta")!;

    let rockets = 0;
    let sparks = 0;
    for (let i = 0; i < this.#activeParticles; i++) {
      const x = Math.floor(pos.partitions.x[i]!);
      const y = Math.floor(pos.partitions.y[i]!);
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
      const idx = y * gridWidth + x;

      const kind = meta.partitions.kind[i]!;
      if (kind === 0) rockets++;
      else sparks++;
      const glyphCode = meta.partitions.glyph[i]!;
      const glyph = String.fromCodePoint(glyphCode);
      const color = meta.partitions.color[i]!;
      // 38;5;{n}m sets ANSI 256 foreground color
      frame[idx] = `\x1b[38;5;${color}m${glyph}\x1b[0m`;
    }

    const lines: string[] = new Array(gridHeight + 4);
    for (let r = 0; r < gridHeight; r++) {
      const start = r * gridWidth;
      lines[r] = frame.slice(start, start + gridWidth).join("");
    }

    const used = this.#buffer.getOffset();
    const total = this.#buffer.byteLength;
    const free = this.#buffer.getFreeSpace();
    const usagePct = ((used / total) * 100).toFixed(1);
    const fps = this.#fpsEMA.toFixed(1);

    const hud1 = `FPS: ${fps}  |  Active: ${this.activeParticles}/${this.maxParticles} (${
      ((this.activeParticles / this.maxParticles) * 100).toFixed(1)
    }%)`;
    const hud2 =
      `Rockets: ${rockets}  Sparks: ${sparks}  |  Spawns/s: ${this.#spawnRate}  Explosions/s: ${this.#explosionRate}`;
    const hud3 = `Buffer: used ${Math.round(used / 1024)}KB / ${Math.round(total / 1024)}KB  (${usagePct}%)  free ${
      Math.round(free / 1024)
    }KB`;
    const hud4 = `q: quit  |  rockets every ${this.#spawnInterval.toFixed(2)}s`;
    lines[gridHeight] = hud1;
    lines[gridHeight + 1] = hud2;
    lines[gridHeight + 2] = hud3;
    lines[gridHeight + 3] = hud4;

    return lines.join("\n");
  }
}

function clearScreen(): void {
  // Clear and move cursor to home; hide cursor
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[2J\x1b[H\x1b[?25l"));
}

function showCursor(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
}

function run(): void {
  const demo = new FireworksDemo(8000);

  clearScreen();

  let last = nowSeconds();
  let running = true;
  const decoder = new TextDecoder();
  const buf = new Uint8Array(1);
  try {
    Deno.stdin.setRaw(true);
  } catch (_) {
    // ignore if not a TTY
  }

  const loop = () => {
    if (!running) return;

    const t = nowSeconds();
    const dt = t - last;
    last = t;

    demo.update(dt);

    // Move cursor home and draw current frame
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[H"));
    console.log(demo.renderFrame());

    setTimeout(loop, 1000 / 60);
  };

  // Basic key listener to quit on 'q' or Ctrl+C
  if (Deno.build.os !== "windows") {
    const signals = ["SIGINT", "SIGTERM"] as const;
    for (const sig of signals) {
      // deno-lint-ignore no-explicit-any
      (Deno as any).addSignalListener?.(sig, () => {
        running = false;
        try {
          Deno.stdin.setRaw(false);
        } catch (_) {
          // ignore
        }
        showCursor();
        console.log("\nGoodbye!\n");
      });
    }
  }

  // Keypress reader: quit on 'q' or 'Q'
  (async () => {
    while (running) {
      const n = await Deno.stdin.read(buf);
      if (n === null) break;
      const ch = decoder.decode(buf.subarray(0, n));
      if (ch === "q" || ch === "Q") {
        running = false;
        try {
          Deno.stdin.setRaw(false);
        } catch (_) {
          // ignore
        }
        showCursor();
        console.log("\nGoodbye!\n");
        break;
      }
    }
  })();

  // Start
  loop();
}

run();
