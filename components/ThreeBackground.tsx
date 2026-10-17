"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface ThreeBackgroundProps {
  mode?: "constellation" | "cybergrid" | "hybrid";
  intensity?: number; // 0.1 to 1.0
}

export const ThreeBackground: React.FC<ThreeBackgroundProps> = ({
  mode = "hybrid",
  intensity = 0.85,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setIsSupported(false);
        return;
      }
    } catch {
      setIsSupported(false);
      return;
    }

    let animationFrameId: number;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b14, 0.0018);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 120;
    camera.position.y = 20;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x070b14, 0); // Transparent so base CSS background shines
    container.appendChild(renderer.domElement);

    // 2. Mouse tracking with smooth damping
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    // 3. Object Groups
    const groupConstellation = new THREE.Group();
    const groupGrid = new THREE.Group();
    const groupGeometries = new THREE.Group();

    if (mode === "constellation" || mode === "hybrid") {
      scene.add(groupConstellation);
    }
    if (mode === "cybergrid" || mode === "hybrid") {
      scene.add(groupGrid);
      scene.add(groupGeometries);
    }

    // --- CONSTELLATION LAYER ---
    const particleCount = Math.floor(130 * intensity);
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: { x: number; y: number; z: number }[] = [];

    const bounds = { x: 180, y: 120, z: 120 };

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * bounds.x * 2;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * bounds.y * 2;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * bounds.z * 2;

      particleVelocities.push({
        x: (Math.random() - 0.5) * 0.08,
        y: (Math.random() - 0.5) * 0.08,
        z: (Math.random() - 0.5) * 0.08,
      });
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3)
    );

    // Soft glowing circle texture for particles
    const createCircleTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, "rgba(96, 165, 250, 1)");
        gradient.addColorStop(0.3, "rgba(59, 130, 246, 0.8)");
        gradient.addColorStop(0.8, "rgba(16, 185, 129, 0.2)");
        gradient.addColorStop(1, "rgba(7, 11, 20, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
      }
      return new THREE.CanvasTexture(canvas);
    };

    const particleTexture = createCircleTexture();
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x60a5fa,
      size: 3.5,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.75,
    });

    const particlesMesh = new THREE.Points(particleGeometry, particleMaterial);
    groupConstellation.add(particlesMesh);

    // Connection lines between nearby constellation nodes
    const maxConnections = particleCount * 5;
    const linePositions = new Float32Array(maxConnections * 6);
    const lineColors = new Float32Array(maxConnections * 6);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.35,
      depthWrite: false,
    });

    const lineMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    groupConstellation.add(lineMesh);

    // --- CYBER GRID / TOPOLOGY WAVE ---
    const gridSegmentsX = 40;
    const gridSegmentsY = 40;
    const gridGeometry = new THREE.PlaneGeometry(360, 260, gridSegmentsX, gridSegmentsY);
    gridGeometry.rotateX(-Math.PI / 2.3);
    gridGeometry.translate(0, -45, -20);

    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0x1e3a8a,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
    groupGrid.add(gridMesh);

    // --- FLOATING POLYHEDRON SHAPES (Translational Core Geometries) ---
    const shapes: THREE.Mesh[] = [];
    const shapeGeoms = [
      new THREE.IcosahedronGeometry(7, 0),
      new THREE.OctahedronGeometry(6, 0),
      new THREE.TetrahedronGeometry(6, 0),
      new THREE.IcosahedronGeometry(8, 1),
    ];

    const shapeColors = [0x3b82f6, 0x10b981, 0x6366f1, 0x06b6d4];

    for (let i = 0; i < 4; i++) {
      const geom = shapeGeoms[i];
      const mat = new THREE.MeshBasicMaterial({
        color: shapeColors[i],
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      });
      const mesh = new THREE.Mesh(geom, mat);

      // Position around the screen perimeter so it doesn't obstruct central text
      const angle = (i / 4) * Math.PI * 2;
      const radius = 95;
      mesh.position.set(
        Math.cos(angle) * radius * 1.3,
        Math.sin(angle) * 35 + (i % 2 === 0 ? 10 : -10),
        (Math.random() - 0.5) * 40 - 20
      );
      mesh.userData = {
        rotX: (Math.random() - 0.5) * 0.015,
        rotY: (Math.random() - 0.5) * 0.015,
        rotZ: (Math.random() - 0.5) * 0.015,
        origY: mesh.position.y,
        floatSpeed: 0.001 + Math.random() * 0.001,
      };

      shapes.push(mesh);
      groupGeometries.add(mesh);
    }

    // --- ANIMATION LOOP ---
    let clock = new THREE.Clock();
    let isTabVisible = true;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (!isTabVisible) return;

      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;

      // Gentle camera parallax
      camera.position.x = mouse.x * 12;
      camera.position.y = 20 + mouse.y * 8;
      camera.lookAt(0, 5, 0);

      // 1. Constellation update
      if (mode === "constellation" || mode === "hybrid") {
        const posAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;

        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          positions[idx] += particleVelocities[i].x;
          positions[idx + 1] += particleVelocities[i].y;
          positions[idx + 2] += particleVelocities[i].z;

          // Bounce off boundaries
          if (Math.abs(positions[idx]) > bounds.x) particleVelocities[i].x *= -1;
          if (Math.abs(positions[idx + 1]) > bounds.y) particleVelocities[i].y *= -1;
          if (Math.abs(positions[idx + 2]) > bounds.z) particleVelocities[i].z *= -1;
        }
        posAttr.needsUpdate = true;

        // Dynamic line links between close nodes
        let lineIdx = 0;
        const linkThreshold = 38;
        const linkThresholdSq = linkThreshold * linkThreshold;

        for (let i = 0; i < particleCount; i++) {
          for (let j = i + 1; j < particleCount; j++) {
            const dx = positions[i * 3] - positions[j * 3];
            const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
            const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < linkThresholdSq && lineIdx < maxConnections) {
              const alpha = 1.0 - Math.sqrt(distSq) / linkThreshold;

              const lPosIdx = lineIdx * 6;
              linePositions[lPosIdx] = positions[i * 3];
              linePositions[lPosIdx + 1] = positions[i * 3 + 1];
              linePositions[lPosIdx + 2] = positions[i * 3 + 2];

              linePositions[lPosIdx + 3] = positions[j * 3];
              linePositions[lPosIdx + 4] = positions[j * 3 + 1];
              linePositions[lPosIdx + 5] = positions[j * 3 + 2];

              // Color gradient: cyan to emerald
              const lColIdx = lineIdx * 6;
              const r = 0.15 * alpha;
              const g = (0.5 + 0.3 * Math.sin(elapsedTime * 0.5)) * alpha;
              const b = (0.8 + 0.2 * Math.cos(elapsedTime * 0.5)) * alpha;

              lineColors[lColIdx] = r;
              lineColors[lColIdx + 1] = g;
              lineColors[lColIdx + 2] = b;
              lineColors[lColIdx + 3] = r * 0.8;
              lineColors[lColIdx + 4] = g * 0.9;
              lineColors[lColIdx + 5] = b;

              lineIdx++;
            }
          }
        }

        // Zero out unused line segments
        for (let k = lineIdx * 6; k < maxConnections * 6; k++) {
          linePositions[k] = 0;
          lineColors[k] = 0;
        }

        (lineGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (lineGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

        groupConstellation.rotation.y = elapsedTime * 0.02;
      }

      // 2. Cybergrid undulating wave
      if (mode === "cybergrid" || mode === "hybrid") {
        const gridPos = gridGeometry.attributes.position as THREE.BufferAttribute;
        const gridArr = gridPos.array as Float32Array;

        for (let i = 0; i < gridArr.length; i += 3) {
          const u = gridArr[i];
          const v = gridArr[i + 1];
          // Gentle wave formula
          gridArr[i + 2] =
            Math.sin(u * 0.03 + elapsedTime * 1.2) * 5 +
            Math.cos(v * 0.03 + elapsedTime * 0.9) * 4;
        }
        gridPos.needsUpdate = true;
      }

      // 3. Floating polyhedrons rotation & hover
      if (mode === "cybergrid" || mode === "hybrid") {
        shapes.forEach((shape) => {
          shape.rotation.x += shape.userData.rotX;
          shape.rotation.y += shape.userData.rotY;
          shape.rotation.z += shape.userData.rotZ;
          shape.position.y =
            shape.userData.origY + Math.sin(elapsedTime * 1.5 + shape.position.x) * 4;
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // 4. Resize listener
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    // 5. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (container && renderer.domElement) {
        try {
          container.removeChild(renderer.domElement);
        } catch {
          // ignore already removed
        }
      }

      // Dispose Three.js resources
      particleGeometry.dispose();
      particleMaterial.dispose();
      particleTexture.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      gridGeometry.dispose();
      gridMaterial.dispose();
      shapeGeoms.forEach((g) => g.dispose());
      renderer.dispose();
    };
  }, [mode, intensity]);

  if (!isSupported) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 15%, rgba(15, 23, 42, 0.75) 0%, rgba(7, 11, 20, 0.95) 75%, #070b14 100%)",
      }}
      aria-hidden="true"
    />
  );
};
