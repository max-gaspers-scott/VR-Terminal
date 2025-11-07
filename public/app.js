import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';
import { Terminal3D } from './terminal3d.js';
import { VRKeyboard } from './vrkeyboard.js';

class VRTerminalApp {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.terminal3D = null;
    this.keyboard = null;
    this.controllers = [];
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    this.init();
  }

  init() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );
    this.camera.position.set(0, 1.6, 2);

    // Create renderer with WebXR support
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Add VR button
    document.body.appendChild(VRButton.createButton(this.renderer));

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(1, 2, 1);
    this.scene.add(directionalLight);

    // Create room (simple grid floor)
    this.createRoom();

    // Setup VR controllers
    this.setupControllers();

    // Create terminal
    this.terminal3D = new Terminal3D(this.scene);
    this.terminal3D.position.set(0, 1.5, -1.5);

    // Create keyboard
    this.keyboard = new VRKeyboard(this.scene);
    this.keyboard.position.set(0, 1.0, -1.2);
    this.keyboard.onKeyPress((key) => {
      this.terminal3D.handleKeyPress(key);
    });

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Add physical keyboard support
    this.setupPhysicalKeyboard();

    // Start animation loop
    this.renderer.setAnimationLoop(() => this.render());

    console.log('VR Terminal App initialized');
    console.log('Physical keyboard support enabled');
  }

  createRoom() {
    // Create grid floor
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    // Create simple walls for reference
    const wallGeometry = new THREE.PlaneGeometry(10, 3);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x16213e,
      side: THREE.DoubleSide
    });

    const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
    backWall.position.set(0, 1.5, -5);
    this.scene.add(backWall);
  }

  setupControllers() {
    // Setup both controllers (optional - works without them)
    try {
      for (let i = 0; i < 2; i++) {
        const controller = this.renderer.xr.getController(i);

        if (controller) {
          controller.addEventListener('selectstart', (event) => this.onSelectStart(event, i));
          controller.addEventListener('selectend', (event) => this.onSelectEnd(event, i));
          this.scene.add(controller);

          // Add a visual line for the controller ray
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
          ]);
          const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2
          });
          const line = new THREE.Line(geometry, material);
          line.scale.z = 5;
          controller.add(line);

          this.controllers.push(controller);

          // Add grip controller for visual representation
          const controllerGrip = this.renderer.xr.getControllerGrip(i);
          if (controllerGrip) {
            this.scene.add(controllerGrip);
          }
        }
      }
      console.log('VR controllers initialized:', this.controllers.length);
    } catch (error) {
      console.log('VR controllers not available, using keyboard only mode');
    }
  }

  setupPhysicalKeyboard() {
    // Listen for physical keyboard input
    document.addEventListener('keydown', (event) => {
      // Prevent default browser behavior for most keys
      if (event.key !== 'F5' && event.key !== 'F11' && event.key !== 'F12') {
        event.preventDefault();
      }

      // Map keyboard events to terminal input with modifiers
      if (this.terminal3D) {
        this.terminal3D.handleKeyPress(event.key, event.ctrlKey, event.altKey);
      }
    });

    // Also listen for paste events
    document.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text');
      if (this.terminal3D && text) {
        // Send each character
        for (let char of text) {
          this.terminal3D.handleKeyPress(char);
        }
      }
    });

    console.log('Physical keyboard listeners attached');
  }

  onSelectStart(event, controllerIndex) {
    const controller = this.controllers[controllerIndex];

    // Skip if controller doesn't exist (keyboard-only mode)
    if (!controller) {
      return;
    }

    // Perform raycasting
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    // Check intersection with keyboard
    const keyboardIntersects = this.raycaster.intersectObjects(
      this.keyboard.getInteractiveObjects(),
      true
    );

    if (keyboardIntersects.length > 0) {
      const intersected = keyboardIntersects[0].object;
      this.keyboard.handleSelection(intersected);
      return;
    }

    // Check intersection with terminal (for focus)
    const terminalIntersects = this.raycaster.intersectObject(
      this.terminal3D.mesh,
      true
    );

    if (terminalIntersects.length > 0) {
      this.terminal3D.focus();
    }
  }

  onSelectEnd(event, controllerIndex) {
    // Handle release if needed
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    // Update terminal texture
    if (this.terminal3D) {
      this.terminal3D.update();
    }

    // Update keyboard
    if (this.keyboard) {
      this.keyboard.update();
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new VRTerminalApp();
});
