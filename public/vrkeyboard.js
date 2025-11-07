import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class VRKeyboard {
  constructor(scene) {
    this.scene = scene;
    this.keys = [];
    this.keyMeshes = [];
    this.group = new THREE.Group();
    this.callback = null;

    // Keyboard layout
    this.layout = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
      ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
      ['Escape', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', 'Enter'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'ArrowUp'],
      ['Space', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
    ];

    this.init();
  }

  init() {
    const keyWidth = 0.08;
    const keyHeight = 0.08;
    const keyDepth = 0.02;
    const keySpacing = 0.01;

    let yOffset = 0;

    // Create keys for each row
    this.layout.forEach((row, rowIndex) => {
      let xOffset = -(row.length * (keyWidth + keySpacing)) / 2;

      row.forEach((keyLabel, colIndex) => {
        const key = this.createKey(keyLabel, keyWidth, keyHeight, keyDepth);

        // Adjust width for special keys
        let width = keyWidth;
        if (keyLabel === 'Backspace') width = keyWidth * 1.5;
        if (keyLabel === 'Tab') width = keyWidth * 1.3;
        if (keyLabel === 'Enter') width = keyWidth * 1.5;
        if (keyLabel === 'Space') width = keyWidth * 5;
        if (keyLabel === 'Escape') width = keyWidth * 1.3;

        key.position.x = xOffset + width / 2;
        key.position.y = -yOffset;
        key.position.z = 0;

        this.group.add(key);
        this.keyMeshes.push({
          mesh: key,
          label: keyLabel,
          originalY: -yOffset
        });

        xOffset += width + keySpacing;
      });

      yOffset += keyHeight + keySpacing;
    });

    // Add background panel
    const panelGeometry = new THREE.PlaneGeometry(
      this.layout[0].length * (keyWidth + keySpacing) + 0.2,
      yOffset + 0.1
    );
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.z = -keyDepth - 0.01;
    this.group.add(panel);

    this.scene.add(this.group);
    console.log('VRKeyboard initialized with', this.keyMeshes.length, 'keys');
  }

  createKey(label, width, height, depth) {
    const group = new THREE.Group();

    // Adjust dimensions for special keys
    let keyWidth = width;
    if (label === 'Backspace') keyWidth = width * 1.5;
    if (label === 'Tab') keyWidth = width * 1.3;
    if (label === 'Enter') keyWidth = width * 1.5;
    if (label === 'Space') keyWidth = width * 5;
    if (label === 'Escape') keyWidth = width * 1.3;

    // Create key button
    const geometry = new THREE.BoxGeometry(keyWidth, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2d4059,
      emissive: 0x0a0a0a,
      metalness: 0.3,
      roughness: 0.7
    });
    const keyMesh = new THREE.Mesh(geometry, material);
    group.add(keyMesh);

    // Create text label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;

    // Draw text
    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Adjust text for special keys
    let displayText = label;
    if (label === 'Backspace') displayText = '←';
    if (label === 'Enter') displayText = '↵';
    if (label === 'Tab') displayText = '⇥';
    if (label === 'Space') displayText = '___';
    if (label === 'Escape') displayText = 'ESC';
    if (label === 'ArrowUp') displayText = '↑';
    if (label === 'ArrowDown') displayText = '↓';
    if (label === 'ArrowLeft') displayText = '←';
    if (label === 'ArrowRight') displayText = '→';

    context.fillText(displayText, 64, 64);

    // Create texture and apply to plane
    const texture = new THREE.CanvasTexture(canvas);
    const textGeometry = new THREE.PlaneGeometry(keyWidth * 0.8, height * 0.8);
    const textMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.z = depth / 2 + 0.001;
    group.add(textMesh);

    // Store the actual key mesh for interaction
    group.userData.keyMesh = keyMesh;

    return group;
  }

  handleSelection(intersectedObject) {
    // Find the key that was selected
    for (const keyData of this.keyMeshes) {
      if (keyData.mesh.userData.keyMesh === intersectedObject ||
          keyData.mesh === intersectedObject ||
          keyData.mesh.children.includes(intersectedObject)) {

        // Visual feedback - press animation
        keyData.mesh.position.z = -0.01;
        setTimeout(() => {
          keyData.mesh.position.z = 0;
        }, 100);

        // Trigger callback
        if (this.callback) {
          this.callback(keyData.label);
        }

        console.log('Key pressed:', keyData.label);
        break;
      }
    }
  }

  onKeyPress(callback) {
    this.callback = callback;
  }

  getInteractiveObjects() {
    return this.keyMeshes.map(k => k.mesh.userData.keyMesh);
  }

  update() {
    // Update keyboard animations or effects if needed
  }

  set position(pos) {
    this.group.position.copy(pos);
  }

  get position() {
    return this.group.position;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
