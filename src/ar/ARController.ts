import * as THREE from 'three';

export interface ARControllerOptions {
  canvas: HTMLCanvasElement;
  videoElement: HTMLVideoElement;
  onPlacementComplete?: (position: THREE.Vector3) => void;
  onError?: (err: Error) => void;
}

export class ARController {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public anchorGroup: THREE.Group;
  
  private canvas: HTMLCanvasElement;
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;
  
  // Placement state
  private isPlaced: boolean = false;
  private reticle: THREE.Group;
  private reticleRing: THREE.Mesh;
  private reticlePulse: number = 0;
  
  private onPlacementComplete?: (position: THREE.Vector3) => void;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  constructor(options: ARControllerOptions) {
    this.canvas = options.canvas;
    this.videoElement = options.videoElement;
    this.onPlacementComplete = options.onPlacementComplete;

    // 1. Three.js Scene
    this.scene = new THREE.Scene();

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    this.camera.position.set(0, 1.2, 0); // eye level

    // 3. Renderer with transparent background for camera overlay
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 3, 2);
    this.scene.add(dirLight);

    // 5. Story Anchor Group (all characters live inside here)
    this.anchorGroup = new THREE.Group();
    // Default position: 1.8 meters in front, on the floor
    this.anchorGroup.position.set(0, 0, -1.8);
    this.scene.add(this.anchorGroup);

    // 6. Placement Reticle Ring
    this.reticle = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.3, 0.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.reticleRing = new THREE.Mesh(ringGeo, ringMat);
    this.reticleRing.rotation.x = -Math.PI / 2;
    this.reticle.add(this.reticleRing);

    // Reticle center dot
    const dotGeo = new THREE.CircleGeometry(0.06, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.rotation.x = -Math.PI / 2;
    this.reticle.add(dotMesh);

    this.reticle.position.set(0, 0, -1.8);
    this.scene.add(this.reticle);

    // Window resize handler
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Initializes the phone camera stream
   */
  public async initCamera(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported on this browser.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' }, // Back camera preferred on phones
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      return true;
    } catch (err: unknown) {
      console.warn('Environment camera failed, falling back to any available video source:', err);
      try {
        // Fallback to any camera
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
        return true;
      } catch (fallbackErr: unknown) {
        console.error('All camera requests failed:', fallbackErr);
        return false;
      }
    }
  }

  /**
   * Handles user tapping on the screen to place the AR story
   */
  public handlePlacementTap(screenX?: number, screenY?: number) {
    if (this.isPlaced) return;

    if (screenX !== undefined && screenY !== undefined) {
      // Raycast or position relative to camera forward vector
      const ndcX = (screenX / window.innerWidth) * 2 - 1;
      const ndcY = -(screenY / window.innerHeight) * 2 + 1;

      // Project onto a floor plane y = 0
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      
      if (raycaster.ray.intersectPlane(floorPlane, intersection)) {
        this.anchorGroup.position.copy(intersection);
      } else {
        this.anchorGroup.position.set(0, 0, -1.8);
      }
    } else {
      this.anchorGroup.position.set(0, 0, -1.8);
    }

    this.isPlaced = true;
    this.reticle.visible = false;
    this.onPlacementComplete?.(this.anchorGroup.position);
  }

  public resetPlacement() {
    this.isPlaced = false;
    this.reticle.visible = true;
  }

  public getIsPlaced(): boolean {
    return this.isPlaced;
  }

  public startRenderLoop(updateCallback: (delta: number) => void) {
    this.isRunning = true;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Animate reticle when searching for placement
      if (!this.isPlaced) {
        this.reticlePulse += delta * 4;
        const scale = 1 + Math.sin(this.reticlePulse) * 0.1;
        this.reticleRing.scale.set(scale, scale, scale);
      }

      // Run external update (StoryEngine, Character animations)
      updateCallback(delta);

      // Render Three.js scene overlay
      this.renderer.render(this.scene, this.camera);

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  public stopRenderLoop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose() {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.onResize);

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.renderer.dispose();
  }
}
