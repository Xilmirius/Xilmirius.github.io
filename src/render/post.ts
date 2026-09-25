// Postproceso: bloom suave (solo brillan los acentos de color) + un pase de "feedback":
// viñeta, saturación, pulso rojo de peligro y un tinte de color en los BORDES para los impactos.
// Reglas (pedido del jugador): nunca se pone la pantalla blanca, nunca se mueve ni se deforma la imagen.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Bloom: fuerza, radio y umbral. Umbral alto = solo brillan colores HDR intensos, no el mundo. */
export const BLOOM = { strength: 0.3, radius: 0.25, threshold: 1.2 };
/** Tope del tinte de borde en los impactos (0..1). */
const EDGE_MAX = 0.28;

const FeedbackShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uEdge: { value: new THREE.Color(0, 0, 0) },
    uEdgeAmt: { value: 0.0 },
    uVignette: { value: 0.3 },
    uDanger: { value: 0.0 },
    uSat: { value: 1.1 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uEdge;
    uniform float uEdgeAmt, uVignette, uDanger, uSat, uTime;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      float v = smoothstep(0.85, 0.35, d);
      col *= mix(1.0 - uVignette, 1.0, v);
      float edge = smoothstep(0.34, 0.78, d);
      // Impacto: el color entra por los bordes y deja el centro (donde está la acción) intacto.
      col = mix(col, uEdge, clamp(edge * uEdgeAmt, 0.0, 1.0));
      col = mix(col, vec3(0.85, 0.02, 0.05), clamp(edge * uDanger * (0.55 + 0.45 * sin(uTime * 7.0)), 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private fb: ShaderPass;
  private edgeCol = new THREE.Color(0, 0, 0);
  private edgeAmt = 0;
  danger = 0;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(this.bloom);
    this.fb = new ShaderPass(FeedbackShader);
    this.composer.addPass(this.fb);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** Tinte de color en los bordes de la pantalla (impactos). amount 0..1, con tope EDGE_MAX. */
  flash(color: number, amount: number) {
    const a = Math.min(EDGE_MAX, amount);
    if (a >= this.edgeAmt) { this.edgeCol.setHex(color); this.edgeAmt = a; }
  }

  render(dt: number, time: number) {
    this.edgeAmt = Math.max(0, this.edgeAmt - dt * 1.6);
    const u = this.fb.uniforms;
    (u.uEdge.value as THREE.Color).copy(this.edgeCol);
    u.uEdgeAmt.value = this.edgeAmt;
    u.uDanger.value = this.danger;
    u.uTime.value = time;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
