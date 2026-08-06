// PakistanCraft — sky system: sun & moon discs, stars, gradient sky dome
import * as THREE from "three";

export class Sky {
  scene: THREE.Scene;
  // sky dome (large inverted sphere with gradient shader)
  dome: THREE.Mesh;
  // sun & moon sprites
  sunMesh: THREE.Mesh;
  moonMesh: THREE.Mesh;
  // stars (Points)
  stars: THREE.Points;
  // cached colors
  skyColor = new THREE.Color("#87b6e8");
  fogColor = new THREE.Color("#bcd8ee");

  // --- reusable temporaries (avoid per-frame allocations) ---
  private _sunDir = new THREE.Vector3();
  // static color constants (never re-allocated)
  private C_NIGHT = new THREE.Color("#0a1430");
  private C_DAY = new THREE.Color("#7ab2e0");
  private C_DAY_TOP = new THREE.Color("#3a78c8");
  private C_SUNSET = new THREE.Color("#e89a5a");
  private C_SUNSET_HORIZON = new THREE.Color("#ffb878");
  private C_BOTTOM_DAY = new THREE.Color("#cdd8e8");
  private C_SUN_GLOW_DAY = new THREE.Color("#fff0c0");
  private C_SUN_GLOW_SUNSET = new THREE.Color("#ff9a3a");
  private C_NIGHT_HORIZON = new THREE.Color("#1a2848");
  private C_SUN_GLOW_NIGHT = new THREE.Color("#3a4870");
  private C_SUN_DISC = new THREE.Color("#fff8e0");
  // reusable output colors
  private _top = new THREE.Color();
  private _horizon = new THREE.Color();
  private _bottom = new THREE.Color();
  private _sunGlow = new THREE.Color();
  private _tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ---- Sky dome (gradient) ----
    const domeGeo = new THREE.SphereGeometry(800, 24, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color("#4a8fd8") },
        uBottom: { value: new THREE.Color("#bcd8ee") },
        uHorizon: { value: new THREE.Color("#e8d0a0") },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color("#ffd8a0") },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldDir;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        void main() {
          vec3 d = normalize(vWorldDir);
          float h = d.y;
          vec3 col;
          if (h > 0.0) {
            col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
          } else {
            col = mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.7));
          }
          // sun glow
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(s, 64.0) * 0.8;
          col += uSunColor * pow(s, 4.0) * 0.06;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    // ---- Sun disc ----
    const sunGeo = new THREE.CircleGeometry(18, 24);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.95,
      fog: false,
      depthWrite: false,
      depthTest: false,
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.renderOrder = -900;
    scene.add(this.sunMesh);

    // ---- Moon disc ----
    const moonGeo = new THREE.CircleGeometry(12, 24);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe8e8f0,
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthWrite: false,
      depthTest: false,
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.renderOrder = -900;
    scene.add(this.moonMesh);

    // ---- Stars ----
    const starCount = 1200;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      // random point on upper hemisphere of radius 600
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1) * 0.5; // bias toward upper
      const r = 600;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 40;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 1 + Math.random() * 2.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    starGeo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        uniform float uOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = uOpacity;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vOpacity;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(1.0, 1.0, 0.95, a * vOpacity);
        }
      `,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -950;
    scene.add(this.stars);
  }

  // Update sky based on timeOfDay (0..1) and player position.
  // t=0.25 sunrise, 0.5 noon, 0.75 sunset, 0 midnight
  update(timeOfDay: number, playerX: number, playerY: number, playerZ: number) {
    const ang = (timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(ang);
    const sunX = Math.cos(ang);
    const sunZ = 0.3;
    const sunDir = this._sunDir.set(sunX, sunY, sunZ).normalize();
    const dist = 500;

    // sun position
    this.sunMesh.position.set(
      playerX + sunDir.x * dist,
      playerY + sunDir.y * dist,
      playerZ + sunDir.z * dist
    );
    this.sunMesh.lookAt(playerX, playerY, playerZ);
    // moon is opposite the sun
    this.moonMesh.position.set(
      playerX - sunDir.x * dist,
      playerY - sunDir.y * dist,
      playerZ - sunDir.z * dist
    );
    this.moonMesh.lookAt(playerX, playerY, playerZ);

    // dome follows player
    this.dome.position.set(playerX, playerY, playerZ);
    this.stars.position.set(playerX, playerY, playerZ);

    // star opacity: visible at night
    const starOpacity = Math.max(0, -sunY * 1.4);
    (this.stars.material as THREE.ShaderMaterial).uniforms.uOpacity.value =
      Math.min(1, starOpacity);

    // sky colors — use cached color fields, no per-frame allocation
    const top = this._top;
    const horizon = this._horizon;
    const bottom = this._bottom;
    const sunGlow = this._sunGlow;

    if (sunY > 0.2) {
      // full day
      top.copy(this.C_DAY_TOP);
      horizon.copy(this.C_DAY);
      bottom.copy(this.C_BOTTOM_DAY);
      sunGlow.copy(this.C_SUN_GLOW_DAY);
    } else if (sunY > -0.2) {
      // sunrise / sunset transition
      const k = (sunY + 0.2) / 0.4; // 0..1
      top.copy(this.C_NIGHT).lerp(this.C_DAY_TOP, k);
      horizon.copy(this.C_SUNSET_HORIZON).lerp(this.C_DAY, k);
      bottom.copy(this.C_NIGHT).lerp(this.C_BOTTOM_DAY, k);
      sunGlow.copy(this.C_SUN_GLOW_SUNSET).lerp(this.C_SUN_GLOW_DAY, k);
      // tint horizon warm
      horizon.lerp(this.C_SUNSET_HORIZON, (1 - Math.abs(sunY) / 0.2) * 0.5);
    } else {
      // night
      top.copy(this.C_NIGHT);
      horizon.copy(this.C_NIGHT_HORIZON);
      bottom.copy(this.C_NIGHT);
      sunGlow.copy(this.C_SUN_GLOW_NIGHT);
    }

    const domeMat = this.dome.material as THREE.ShaderMaterial;
    domeMat.uniforms.uTop.value.copy(top);
    domeMat.uniforms.uHorizon.value.copy(horizon);
    domeMat.uniforms.uBottom.value.copy(bottom);
    domeMat.uniforms.uSunDir.value.copy(sunDir);
    domeMat.uniforms.uSunColor.value.copy(sunGlow);

    // sun disc visibility + color
    const sunMat = this.sunMesh.material as THREE.MeshBasicMaterial;
    sunMat.visible = sunY > -0.15;
    sunMat.color.copy(sunGlow).lerp(this.C_SUN_DISC, Math.max(0, sunY));
    const moonMat = this.moonMesh.material as THREE.MeshBasicMaterial;
    moonMat.visible = sunY < 0.15;

    // expose for fog
    this.skyColor.copy(horizon);
    this.fogColor.copy(horizon);
  }

  dispose() {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as THREE.Material).dispose();
    this.moonMesh.geometry.dispose();
    (this.moonMesh.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}
