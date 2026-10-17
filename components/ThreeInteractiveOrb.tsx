"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThreeInteractiveOrbProps {
  size?: number;
  status?: "idle" | "translating" | "success" | "shield";
  interactive?: boolean;
  className?: string;
}

export const ThreeInteractiveOrb: React.FC<ThreeInteractiveOrbProps> = ({
  size = 40,
  status = "idle",
  interactive = true,
  className = "",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;
    const width = size;
    const height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 24;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Color definitions based on status
    const colors = {
      idle: { primary: 0x38bdf8, secondary: 0x3b82f6, core: 0x0284c7 },
      translating: { primary: 0xf59e0b, secondary: 0xec4899, core: 0xd97706 },
      success: { primary: 0x34d399, secondary: 0x059669, core: 0x10b981 },
      shield: { primary: 0x60a5fa, secondary: 0x10b981, core: 0x2563eb },
    };
    const activeColor = colors[status] || colors.idle;

    // 1. Outer Wireframe Geodesic Icosahedron
    const outerGeo = new THREE.IcosahedronGeometry(7.5, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: activeColor.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    scene.add(outerMesh);

    // 2. Inner Glowing Core
    const innerGeo = new THREE.OctahedronGeometry(4.2, 0);
    const innerMat = new THREE.MeshBasicMaterial({
      color: activeColor.secondary,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    // 3. Orbiting ring
    const ringGeo = new THREE.TorusGeometry(9.2, 0.25, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: activeColor.core,
      transparent: true,
      opacity: 0.6,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    scene.add(ringMesh);

    // 4. Interactive pointer drag/tilt
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };
    let dragVelocity = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      if (!interactive) return;
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !interactive) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      dragVelocity.x = deltaY * 0.008;
      dragVelocity.y = deltaX * 0.008;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    if (interactive && mount) {
      mount.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    // Animation speed varies by status
    const speedMultiplier = status === "translating" ? 3.2 : 1.0;

    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Base rotation
      outerMesh.rotation.y += 0.8 * speedMultiplier * delta;
      outerMesh.rotation.x += 0.4 * speedMultiplier * delta;

      innerMesh.rotation.y -= 1.2 * speedMultiplier * delta;
      innerMesh.rotation.z += 0.6 * speedMultiplier * delta;

      ringMesh.rotation.z += 0.5 * speedMultiplier * delta;

      // Apply drag inertial tilt
      if (interactive) {
        outerMesh.rotation.x += dragVelocity.x;
        outerMesh.rotation.y += dragVelocity.y;
        dragVelocity.x *= 0.92;
        dragVelocity.y *= 0.92;
      }

      // Subtle breathing pulse
      const time = clock.getElapsedTime();
      const pulse = 1 + Math.sin(time * 3 * speedMultiplier) * 0.05;
      innerMesh.scale.set(pulse, pulse, pulse);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (interactive && mount) {
        mount.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }
      if (mount && renderer.domElement) {
        try {
          mount.removeChild(renderer.domElement);
        } catch {
          // ignore
        }
      }
      outerGeo.dispose();
      outerMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [size, status, interactive]);

  return (
    <div
      ref={mountRef}
      className={`inline-flex items-center justify-center cursor-grab active:cursor-grabbing select-none ${className}`}
      style={{ width: size, height: size }}
      title={`3D Quantum Core: ${status.toUpperCase()} (Drag to spin)`}
    />
  );
};
