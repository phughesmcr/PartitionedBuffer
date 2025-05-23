import { PartitionedBuffer, type Schema } from "../mod.ts";

// Define our particle properties
type Position = { x: number; y: number };
type Velocity = { vx: number; vy: number };
type Color = { r: number; g: number; b: number; a: number };
type Life = { current: number; total: number };

// Define schemas for each property type
const positionSchema: Schema<Position> = { x: Float32Array, y: Float32Array };
const velocitySchema: Schema<Velocity> = { vx: Float32Array, vy: Float32Array };
const colorSchema: Schema<Color> = {
  r: Uint8Array,
  g: Uint8Array,
  b: Uint8Array,
  a: Float32Array,
};
const lifeSchema: Schema<Life> = {
  current: Float32Array,
  total: Float32Array,
};

/**
 * A simple particle system demonstrating PartitionedBuffer usage
 */
class ParticleSystem {
  readonly #buffer: PartitionedBuffer;
  readonly #maxParticles: number;
  #activeParticles = 0;

  constructor(maxParticles: number) {
    this.#maxParticles = maxParticles;
    
    // Create buffer with generous space - PartitionedBuffer will calculate exact requirements
    // Each schema property gets 8-byte alignment, so estimate conservatively
    const estimatedBytesPerParticle = 64; // Conservative estimate for all properties with alignment
    const bufferSize = maxParticles * estimatedBytesPerParticle;
    
    // Alternative: Calculate exact size requirements (more advanced)
    // import { getEntitySize } from "../src/Schema.ts";
    // const positionSize = getEntitySize(positionSchema) * maxParticles;
    // const velocitySize = getEntitySize(velocitySchema) * maxParticles;
    // const colorSize = getEntitySize(colorSchema) * maxParticles;
    // const lifeSize = getEntitySize(lifeSchema) * maxParticles;
    // const bufferSize = positionSize + velocitySize + colorSize + lifeSize + 1024; // Extra padding
    
    // Create buffer with space for all particles
    this.#buffer = new PartitionedBuffer(bufferSize, maxParticles);

    // Add partitions for each property type
    this.#buffer.addPartition({ name: "position", schema: positionSchema });
    this.#buffer.addPartition({ name: "velocity", schema: velocitySchema });
    this.#buffer.addPartition({ name: "color", schema: colorSchema });
    this.#buffer.addPartition({ name: "life", schema: lifeSchema });
  }

  /**
   * Spawn a new particle
   */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    g: number,
    b: number,
    lifespan: number,
  ): boolean {
    if (this.#activeParticles >= this.#maxParticles) {
      return false;
    }

    const index = this.#activeParticles++;

    // Get all partitions
    const position = this.#buffer.getPartition("position")!;
    const velocity = this.#buffer.getPartition("velocity")!;
    const color = this.#buffer.getPartition("color")!;
    const life = this.#buffer.getPartition("life")!;

    // Set initial values
    position.partitions.x[index] = x;
    position.partitions.y[index] = y;

    velocity.partitions.vx[index] = vx;
    velocity.partitions.vy[index] = vy;

    color.partitions.r[index] = r;
    color.partitions.g[index] = g;
    color.partitions.b[index] = b;
    color.partitions.a[index] = 1.0;

    life.partitions.current[index] = lifespan;
    life.partitions.total[index] = lifespan;

    return true;
  }

  /**
   * Update all particles
   * @param deltaTime Time since last update in seconds
   */
  update(deltaTime: number): void {
    const position = this.#buffer.getPartition("position")!;
    const velocity = this.#buffer.getPartition("velocity")!;
    const color = this.#buffer.getPartition("color")!;
    const life = this.#buffer.getPartition("life")!;

    let aliveCount = 0;

    // Update each particle
    for (let i = 0; i < this.#activeParticles; i++) {
      // Update life
      life.partitions.current[i] -= deltaTime;

      if (life.partitions.current[i] <= 0) {
        continue;
      }

      // Update position based on velocity
      position.partitions.x[i] += velocity.partitions.vx[i] * deltaTime;
      position.partitions.y[i] += velocity.partitions.vy[i] * deltaTime;

      // Apply gravity
      velocity.partitions.vy[i] += 9.81 * deltaTime;

      // Update alpha based on remaining life
      const lifeRatio = life.partitions.current[i] / life.partitions.total[i];
      color.partitions.a[i] = lifeRatio;

      // Compact alive particles to the front of the buffer
      if (i !== aliveCount) {
        this.#moveParticle(i, aliveCount);
      }
      aliveCount++;
    }

    this.#activeParticles = aliveCount;
  }

  /**
   * Move a particle from one index to another
   */
  #moveParticle(fromIndex: number, toIndex: number): void {
    const position = this.#buffer.getPartition("position")!;
    const velocity = this.#buffer.getPartition("velocity")!;
    const color = this.#buffer.getPartition("color")!;
    const life = this.#buffer.getPartition("life")!;

    // Move position
    position.partitions.x[toIndex] = position.partitions.x[fromIndex];
    position.partitions.y[toIndex] = position.partitions.y[fromIndex];

    // Move velocity
    velocity.partitions.vx[toIndex] = velocity.partitions.vx[fromIndex];
    velocity.partitions.vy[toIndex] = velocity.partitions.vy[fromIndex];

    // Move color
    color.partitions.r[toIndex] = color.partitions.r[fromIndex];
    color.partitions.g[toIndex] = color.partitions.g[fromIndex];
    color.partitions.b[toIndex] = color.partitions.b[fromIndex];
    color.partitions.a[toIndex] = color.partitions.a[fromIndex];

    // Move life
    life.partitions.current[toIndex] = life.partitions.current[fromIndex];
    life.partitions.total[toIndex] = life.partitions.total[fromIndex];
  }

  /**
   * Get current number of active particles
   */
  get activeParticles(): number {
    return this.#activeParticles;
  }

  /**
   * Get maximum number of particles
   */
  get maxParticles(): number {
    return this.#maxParticles;
  }

  /**
   * Clear all particles
   */
  clear(): void {
    this.#buffer.clear();
    this.#activeParticles = 0;
  }
}

// Example usage demonstrating particle system simulation
function runParticleDemo() {
  console.log("Starting particle system simulation...\n");
  
  const particles = new ParticleSystem(4_000);
  let isRunning = true;
  const simulationTime = 5; // Run for 5 seconds

  // Initial burst of particles
  console.log("Spawning initial particles...");
  for (let i = 0; i < 1000; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 50;
    
    particles.spawn(
      0, 0, // position
      Math.cos(angle) * speed, Math.sin(angle) * speed, // velocity
      255, 100 + Math.random() * 155, 0, // color
      2 + Math.random() * 2, // lifespan
    );
  }
  console.log(`Spawned ${particles.activeParticles} particles\n`);

  // Simulation loop
  console.log("Starting simulation...");
  
  let lastTime = performance.now() / 1000;
  let startTime = lastTime;

  function animate() {
    if (!isRunning) return;

    const currentTime = performance.now() / 1000;
    const deltaTime = currentTime - lastTime;
    const elapsedTime = currentTime - startTime;
    lastTime = currentTime;

    particles.update(deltaTime);

    // Log stats every second
    if (Math.floor(elapsedTime) > Math.floor(elapsedTime - deltaTime)) {
      const stats = {
        time: elapsedTime.toFixed(1),
        activeParticles: particles.activeParticles,
        maxParticles: particles.maxParticles,
        utilizationPct: ((particles.activeParticles / particles.maxParticles) * 100).toFixed(1)
      };

      console.log(
        `Time: ${stats.time}s | ` +
        `Active: ${stats.activeParticles} | ` +
        `Max: ${stats.maxParticles} | ` +
        `Utilization: ${stats.utilizationPct}%`
      );
    }

    if (elapsedTime < simulationTime) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(animate);
      } else {
        // Fallback to setTimeout for environments without requestAnimationFrame
        setTimeout(animate, 1000 / 60);
      }
    } else {
      console.log("\nSimulation complete!");
      isRunning = false;
    }
  }

  // Start animation
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(animate);
  } else {
    setTimeout(animate, 1000 / 60);
  }
}

// Run the demo
runParticleDemo(); 