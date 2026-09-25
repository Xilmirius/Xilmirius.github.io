// Postproceso: bloom (todo lo que brilla, brilla de verdad) + un pase de "feedback" con
// aberración cromática, viñeta, destellos de color, pulso rojo de peligro y saturación.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const FeedbackShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uCA: { value: 0.0 },
    uVignette: { value: 0.35 },
    uDanger: { value: 0.0 },
    uSat: { value: 1.12 },
    uTime: { value: 0.0 },
    uZoom: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uFlash;
    uniform float uCA, uVignette, uDanger, uSat, uTime, uZoom;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      // "zoom blur" radial suave para impactos fuertes
      vec3 col = vec3(0.0);
      vec2 off = c * uCA * (0.4 + d);
      if (uZoom > 0.001) {
        for (int i = 0; i < 6; i++) {
          float k = 1.0 - uZoom * float(i) * 0.012;
          vec2 uv = 0.5 + c * k;
          col.r += texture2D(tDiffuse, uv + off).r;
          col.g += texture2D(tDiffuse, uv).g;
          col.b += texture2D(tDiffuse, uv - off).b;
        }
        col /= 6.0;
      } else {
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      float v = smoothstep(0.85, 0.35, d);
      col *= mix(1.0 - uVignette, 1.0, v);
      float edge = smoothstep(0.32, 0.75, d);
      col = mix(col, vec3(0.85, 0.02, 0.05), clamp(edge * uDanger * (0.55 + 0.45 * sin(uTime * 7.0)), 0.0, 1.0));
      col += uFlash;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private fb: ShaderPass;
  private flashCol = new THREE.Color(0, 0, 0);
  private flashAmt = 0;
  private ca = 0;
  private zoom = 0;
  danger = 0;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.35, 1.05);
    this.composer.addPass(this.bloom);
    this.fb = new ShaderPass(FeedbackShader);
    this.composer.addPass(this.fb);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** Destello de pantalla (color en HDR, se suma). */
  flash(color: number, amount: number) {
    const c = new THREE.Color(color);
    if (amount >= this.flashAmt) { this.flashCol.copy(c); this.flashAmt = amount; }
  }

  aberration(a: number) { this.ca = Math.max(this.ca, a); }
  zoomBlur(a: number) { this.zoom = Math.max(this.zoom, a); }

  render(dt: number, time: number) {
    this.flashAmt = Math.max(0, this.flashAmt - dt * 3.2);
    this.ca = Math.max(0.0015, this.ca - dt * 0.12);
    this.zoom = Math.max(0, this.zoom - dt * 3);
    const u = this.fb.uniforms;
    (u.uFlash.value as THREE.Color).copy(this.flashCol).multiplyScalar(this.flashAmt);
    u.uCA.value = this.ca;
    u.uZoom.value = this.zoom;
    u.uDanger.value = this.danger;
    u.uTime.value = time;
    this.bloom.strength = 0.5 + Math.min(0.4, this.flashAmt);
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
