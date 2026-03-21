/**
 * Particle Animation Engine
 *
 * Creates small glowing dots that flow along SVG path edges,
 * visualizing data propagation through the column lineage graph.
 *
 * Each edge gets multiple staggered particles that loop continuously.
 * When a column is selected, only the highlighted path's particles
 * remain active and speed up.
 */

interface Particle {
  element: SVGCircleElement;
  path: SVGPathElement;
  pathLength: number;
  offset: number;      // 0-1, stagger offset
  speed: number;       // pixels per frame
  progress: number;    // current position along path (0 to pathLength)
  active: boolean;
  edgeId: string;
}

const PARTICLE_RADIUS = 2.5;
const PARTICLE_RADIUS_HIGHLIGHTED = 3.5;
const PARTICLES_PER_EDGE = 3;
const BASE_SPEED = 0.8;
const HIGHLIGHT_SPEED = 2.5;
const GLOW_FILTER_ID = 'particle-glow';

const COLORS: Record<string, string> = {
  passthrough: '#3b82f6',
  rename: '#10b981',
  transform: '#f59e0b',
  aggregate: '#8b5cf6',
};

export class AnimationEngine {
  private particles: Particle[] = [];
  private animationId: number | null = null;
  private particlesLayer: SVGGElement | null = null;
  private highlightedEdges: Set<string> | null = null;
  private speedMultiplier = 1;

  init(particlesLayer: SVGGElement) {
    this.particlesLayer = particlesLayer;
    this.addGlowFilter();
  }

  private addGlowFilter() {
    if (!this.particlesLayer) return;

    const svg = this.particlesLayer.ownerSVGElement;
    if (!svg) return;

    // Check if filter already exists
    if (svg.querySelector(`#${GLOW_FILTER_ID}`)) return;

    const defs = svg.querySelector('defs') || svg.insertBefore(
      document.createElementNS('http://www.w3.org/2000/svg', 'defs'),
      svg.firstChild
    );

    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', GLOW_FILTER_ID);
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');

    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '2');
    blur.setAttribute('result', 'glow');

    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const mergeGlow = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mergeGlow.setAttribute('in', 'glow');
    const mergeOriginal = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mergeOriginal.setAttribute('in', 'SourceGraphic');

    merge.appendChild(mergeGlow);
    merge.appendChild(mergeOriginal);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
  }

  /**
   * Create particles for all edge paths.
   */
  createParticles(
    edgePaths: Array<{
      element: SVGPathElement;
      edgeId: string;
      transformationType: string;
    }>
  ) {
    this.stop();
    this.clearParticles();

    if (!this.particlesLayer) return;

    for (const { element, edgeId, transformationType } of edgePaths) {
      const pathLength = element.getTotalLength();
      if (pathLength < 1) continue;

      const color = COLORS[transformationType] || COLORS.passthrough;

      for (let i = 0; i < PARTICLES_PER_EDGE; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', String(PARTICLE_RADIUS));
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', '0.8');
        circle.setAttribute('filter', `url(#${GLOW_FILTER_ID})`);
        circle.classList.add('particle', transformationType);

        this.particlesLayer.appendChild(circle);

        this.particles.push({
          element: circle,
          path: element,
          pathLength,
          offset: i / PARTICLES_PER_EDGE,
          speed: BASE_SPEED,
          progress: (i / PARTICLES_PER_EDGE) * pathLength,
          active: true,
          edgeId,
        });
      }
    }
  }

  /**
   * Start the animation loop.
   */
  start() {
    if (this.animationId !== null) return;
    this.animate();
  }

  /**
   * Stop the animation loop.
   */
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Highlight specific edges — only their particles remain visible and speed up.
   */
  setHighlightedEdges(edgeIds: Set<string> | null) {
    this.highlightedEdges = edgeIds;

    for (const particle of this.particles) {
      if (edgeIds === null) {
        // Show all
        particle.active = true;
        particle.speed = BASE_SPEED * this.speedMultiplier;
        particle.element.setAttribute('r', String(PARTICLE_RADIUS));
        particle.element.setAttribute('opacity', '0.8');
      } else if (edgeIds.has(particle.edgeId)) {
        // Highlighted: faster, bigger, brighter
        particle.active = true;
        particle.speed = HIGHLIGHT_SPEED * this.speedMultiplier;
        particle.element.setAttribute('r', String(PARTICLE_RADIUS_HIGHLIGHTED));
        particle.element.setAttribute('opacity', '1');
      } else {
        // Dimmed: hide
        particle.active = false;
        particle.element.setAttribute('opacity', '0');
      }
    }
  }

  /**
   * Set global speed multiplier (1-5 from user settings).
   */
  setSpeed(multiplier: number) {
    this.speedMultiplier = multiplier;
    for (const particle of this.particles) {
      if (particle.active) {
        const isHighlighted = this.highlightedEdges?.has(particle.edgeId);
        particle.speed = (isHighlighted ? HIGHLIGHT_SPEED : BASE_SPEED) * multiplier;
      }
    }
  }

  private animate = () => {
    for (const particle of this.particles) {
      if (!particle.active) continue;

      // Advance position
      particle.progress += particle.speed;

      // Loop back to start
      if (particle.progress >= particle.pathLength) {
        particle.progress = particle.progress % particle.pathLength;
      }

      // Get point on path at current progress
      const point = particle.path.getPointAtLength(particle.progress);

      // Use transform for GPU acceleration
      particle.element.style.transform = `translate(${point.x}px, ${point.y}px)`;
      particle.element.setAttribute('cx', '0');
      particle.element.setAttribute('cy', '0');
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private clearParticles() {
    for (const particle of this.particles) {
      particle.element.remove();
    }
    this.particles = [];
  }

  dispose() {
    this.stop();
    this.clearParticles();
  }
}
