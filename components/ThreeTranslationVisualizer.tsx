"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Eye, Maximize2, Minimize2, Cpu, ShieldCheck } from "lucide-react";

interface ThreeTranslationVisualizerProps {
  isTranslating?: boolean;
  sourceLang?: string;
  targetLang?: string;
  className?: string;
}

export const ThreeTranslationVisualizer: React.FC<ThreeTranslationVisualizerProps> = ({
  isTranslating = false,
  sourceLang = "VI",
  targetLang = "EN",
  className = "",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeMetric, setActiveMetric] = useState<string>("Neural Translation Engine Active");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;
    let width = mount.clientWidth || 600;
    let height = isExpanded ? 360 : 180;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c1222, 0.003);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 8, 48);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // --- 1. Nodes (Source VI, Core AI / Glossary, Target EN) ---
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    // Node A (Source VI)
    const sourceGeo = new THREE.IcosahedronGeometry(3.5, 1);
    const sourceMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const sourceNode = new THREE.Mesh(sourceGeo, sourceMat);
    sourceNode.position.set(-22, 0, 0);
    nodeGroup.add(sourceNode);

    // Node B (Center: AI Footwear Matrix)
    const coreGeo = new THREE.DodecahedronGeometry(5, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const coreNode = new THREE.Mesh(coreGeo, coreMat);
    coreNode.position.set(0, 0, 0);
    nodeGroup.add(coreNode);

    // Core Orbiting Rings
    const ringGeo = new THREE.TorusGeometry(8.5, 0.15, 6, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.45,
    });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 3;
    coreNode.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.y = Math.PI / 2.5;
    coreNode.add(ring2);

    // Node C (Target EN)
    const targetGeo = new THREE.IcosahedronGeometry(3.5, 1);
    const targetMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const targetNode = new THREE.Mesh(targetGeo, targetMat);
    targetNode.position.set(22, 0, 0);
    nodeGroup.add(targetNode);

    // --- 2. Curved Energy Flow (Source -> Core -> Target) ---
    const curve1 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-22, 0, 0),
      new THREE.Vector3(-11, 6, 6),
      new THREE.Vector3(0, 0, 0)
    );
    const curve2 = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(11, -6, 6),
      new THREE.Vector3(22, 0, 0)
    );

    const streamPointsCount = 70;
    const streamParticles = new Float32Array(streamPointsCount * 3);
    const streamColors = new Float32Array(streamPointsCount * 3);
    const particleOffsets: number[] = [];

    for (let i = 0; i < streamPointsCount; i++) {
      particleOffsets.push(i / streamPointsCount);
      streamColors[i * 3] = 0.2;
      streamColors[i * 3 + 1] = 0.7;
      streamColors[i * 3 + 2] = 0.95;
    }

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute("position", new THREE.BufferAttribute(streamParticles, 3));
    streamGeo.setAttribute("color", new THREE.BufferAttribute(streamColors, 3));

    const streamMat = new THREE.PointsMaterial({
      size: 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const streamMesh = new THREE.Points(streamGeo, streamMat);
    scene.add(streamMesh);

    // Connecting Beams (Lines)
    const linePoints1 = curve1.getPoints(30);
    const lineGeo1 = new THREE.BufferGeometry().setFromPoints(linePoints1);
    const lineMat1 = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.25,
    });
    scene.add(new THREE.Line(lineGeo1, lineMat1));

    const linePoints2 = curve2.getPoints(30);
    const lineGeo2 = new THREE.BufferGeometry().setFromPoints(linePoints2);
    const lineMat2 = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.25,
    });
    scene.add(new THREE.Line(lineGeo2, lineMat2));

    // --- 3. Interactive Mouse Orbit ---
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let rotationVelocity = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      rotationVelocity.y += dx * 0.005;
      rotationVelocity.x += dy * 0.005;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    mount.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    // --- 4. Animation Loop ---
    let clock = new THREE.Clock();
    const speed = isTranslating ? 2.5 : 1.0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Node rotations
      sourceNode.rotation.y += 0.8 * speed * delta;
      sourceNode.rotation.x += 0.4 * speed * delta;

      coreNode.rotation.y += 0.5 * speed * delta;
      ring1.rotation.z += 0.7 * speed * delta;
      ring2.rotation.z -= 0.6 * speed * delta;

      targetNode.rotation.y -= 0.8 * speed * delta;
      targetNode.rotation.z += 0.5 * speed * delta;

      // Particle stream along bezier curves
      const posArr = streamGeo.attributes.position.array as Float32Array;
      const colArr = streamGeo.attributes.color.array as Float32Array;

      for (let i = 0; i < streamPointsCount; i++) {
        particleOffsets[i] = (particleOffsets[i] + delta * 0.3 * speed) % 1.0;
        const t = particleOffsets[i];
        let p: THREE.Vector3;

        if (t < 0.5) {
          p = curve1.getPoint(t * 2);
          // Cyan tone
          colArr[i * 3] = 0.2;
          colArr[i * 3 + 1] = 0.7;
          colArr[i * 3 + 2] = 0.95;
        } else {
          p = curve2.getPoint((t - 0.5) * 2);
          // Emerald tone
          colArr[i * 3] = 0.1;
          colArr[i * 3 + 1] = 0.85;
          colArr[i * 3 + 2] = 0.45;
        }

        posArr[i * 3] = p.x;
        posArr[i * 3 + 1] = p.y + Math.sin(time * 3 + i) * 0.3;
        posArr[i * 3 + 2] = p.z + Math.cos(time * 3 + i) * 0.3;
      }
      streamGeo.attributes.position.needsUpdate = true;
      streamGeo.attributes.color.needsUpdate = true;

      // Inertial user orbit
      nodeGroup.rotation.y += rotationVelocity.y;
      nodeGroup.rotation.x += rotationVelocity.x;
      rotationVelocity.x *= 0.92;
      rotationVelocity.y *= 0.92;

      // Gentle auto wobble
      nodeGroup.position.y = Math.sin(time * 1.5) * 1.2;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mount) return;
      width = mount.clientWidth;
      height = isExpanded ? 360 : 180;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      mount.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", handleResize);

      if (mount && renderer.domElement) {
        try {
          mount.removeChild(renderer.domElement);
        } catch {
          // ignore
        }
      }
      sourceGeo.dispose();
      sourceMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      targetGeo.dispose();
      targetMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      streamGeo.dispose();
      streamMat.dispose();
      lineGeo1.dispose();
      lineMat1.dispose();
      lineGeo2.dispose();
      lineMat2.dispose();
      renderer.dispose();
    };
  }, [isExpanded, isTranslating]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#0c1322]/90 to-[#070b14]/90 backdrop-blur-md shadow-2xl transition-all duration-300 ${className}`}
    >
      {/* 3D Visualizer Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 bg-slate-900/40 text-xs">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span className="font-semibold text-slate-200 tracking-wide uppercase text-[11px] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            Three.js Neural Pipeline Visualizer
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-mono text-[10px]">
            {sourceLang} ➔ AI CAT Matrix ➔ {targetLang}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/30 px-2 py-0.5 rounded flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Zero-Leakage Active
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isExpanded ? "Collapse 3D Stage" : "Expand 3D Stage"}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Three.js Canvas Stage */}
      <div
        ref={mountRef}
        className="w-full relative cursor-grab active:cursor-grabbing select-none"
        style={{ height: isExpanded ? 360 : 180 }}
      >
        {/* Floating Labels in 3D Stage */}
        <div className="absolute left-6 bottom-3 pointer-events-none">
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>SOURCE: {sourceLang} Document</span>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 pointer-events-none">
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2.5 py-0.5 rounded-md backdrop-blur-sm">
            <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
            <span>Footwear Terminology Mesh</span>
          </div>
        </div>

        <div className="absolute right-6 bottom-3 pointer-events-none">
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>TARGET: {targetLang} SOP/ISQ</span>
          </div>
        </div>

        {/* Drag Hint */}
        <div className="absolute top-2 right-4 pointer-events-none text-[10px] text-slate-500 font-mono">
          Click & Drag to Rotate 3D Model
        </div>
      </div>
    </div>
  );
};
