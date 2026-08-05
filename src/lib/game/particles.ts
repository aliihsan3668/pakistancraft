// PakistanCraft — particle system for block break / place effects
import * as THREE from "three";
import { BLOCKS, Block, buildAtlasTexture, Tile, tileUV } from "./blocks";
import { ATLAS_COLS } from "./constants";

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  tile: number;
}

export class ParticleSystem {
  scene: THREE.Scene;
  particles: Particle[] = [];
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  maxParticles = 600;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    const uvs = new Float32Array(this.maxParticles * 2);
    const alphas = new Float32Array(this.maxParticles);
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aTileUv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));

    const atlas = buildAtlasTexture();
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uAtlas: { value: atlas },
        uCols: { value: ATLAS_COLS },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec2 aTileUv;
        attribute float alpha;
        varying vec2 vTileUv;
        varying float vAlpha;
        void main() {
          vTileUv = aTileUv;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec2 vTileUv;
        varying float vAlpha;
        void main() {
          vec4 c = texture2D(uAtlas, vTileUv);
          if (c.a < 0.1) discard;
          gl_FragColor = vec4(c.rgb, c.a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  // Emit a burst of particles for a broken/placed block at (x,y,z).
  emitBlockBreak(x: number, y: number, z: number, block: number, count = 14) {
    const def = BLOCKS[block];
    if (!def) return;
    // use the side tile texture for the particles
    const tile = def.tiles[1];
    const uv = tileUV(tile);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) this.particles.shift();
      const px = x + 0.2 + Math.random() * 0.6;
      const py = y + 0.2 + Math.random() * 0.6;
      const pz = z + 0.2 + Math.random() * 0.6;
      this.particles.push({
        pos: new THREE.Vector3(px, py, pz),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 4 + 1,
          (Math.random() - 0.5) * 3
        ),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        size: 4 + Math.random() * 4,
        tile,
      });
      void uv;
    }
  }

  update(dt: number) {
    const posAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizeAttr = this.geometry.getAttribute("size") as THREE.BufferAttribute;
    const uvAttr = this.geometry.getAttribute("aTileUv") as THREE.BufferAttribute;
    const alphaAttr = this.geometry.getAttribute("alpha") as THREE.BufferAttribute;

    // update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
    }

    // write to buffers
    const n = this.maxParticles;
    for (let i = 0; i < n; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        posAttr.array[i * 3] = p.pos.x;
        posAttr.array[i * 3 + 1] = p.pos.y;
        posAttr.array[i * 3 + 2] = p.pos.z;
        sizeAttr.array[i] = p.size;
        const uv = tileUV(p.tile);
        uvAttr.array[i * 2] = (uv.u0 + uv.u1) * 0.5;
        uvAttr.array[i * 2 + 1] = (uv.v0 + uv.v1) * 0.5;
        alphaAttr.array[i] = 1 - p.life / p.maxLife;
      } else {
        sizeAttr.array[i] = 0;
        alphaAttr.array[i] = 0;
      }
    }
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  }
}

export { Block, Tile };
