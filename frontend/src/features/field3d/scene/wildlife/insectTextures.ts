import * as THREE from 'three';

type Kind = 'crow' | 'lime' | 'grass';

/**
 * Procedural butterfly wing textures drawn on a 128×128 canvas (UV 0..1 spans the wing disc):
 * common crow (dark brown, white spots along the margin), lime butterfly (black with pale-yellow patches and a red eyespot),
 * and a plain grass-yellow. No image assets.
 */
export function butterflyWingTexture(kind: Kind): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    g.clearRect(0, 0, size, size);
    const body = kind === 'crow' ? '#2b1c14' : kind === 'lime' ? '#1b1b1a' : '#e9c93a';
    // Wing disc with a slightly scalloped outer edge.
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(size / 2, size / 2, size / 2 - 2, size / 2 - 6, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'crow') {
      g.fillStyle = '#f4f0e6';
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + i * 0.22;
        g.beginPath();
        g.arc(size / 2 + Math.cos(a) * 46, size / 2 + Math.sin(a) * 38, 3 + (i % 3), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#6a4a35';
      g.globalAlpha = 0.5;
      g.beginPath();
      g.ellipse(size * 0.4, size / 2, 22, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    } else if (kind === 'lime') {
      g.fillStyle = '#e8e08a';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(size * 0.35 + i * 9, size * 0.35 + (i % 2) * 22, 7, 15, 0.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#c93b2a';
      g.beginPath();
      g.arc(size * 0.72, size * 0.62, 7, 0, Math.PI * 2);
      g.fill();
    }
    // Dark veins.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(8, size / 2);
      g.lineTo(size - 6, 14 + i * 20);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
