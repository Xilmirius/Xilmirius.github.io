// Ayudas para armar mallas procedurales de colores planos (decoración del terreno y fondos).
import * as THREE from 'three';

/** Geometría sin índices con un color plano por vértice: así se fusionan piezas de distinto color en una sola malla. */
export function painted(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const ni = g.index ? g.toNonIndexed() : g;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = ni.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  ni.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ni;
}

/** Caras facetadas (low-poly): cada triángulo con su propia normal. */
export function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ni = g.index ? g.toNonIndexed() : g;
  ni.computeVertexNormals();
  return ni;
}

/** Variante de un color con la luminosidad corrida (para que las piezas repetidas no sean idénticas). */
export function shade(color: number | THREE.Color, dl: number): THREE.Color {
  return new THREE.Color(color).offsetHSL(0, 0, dl);
}
