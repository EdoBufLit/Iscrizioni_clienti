"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { Group, Texture } from "three";
import { DoubleSide, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";

type PublicHeroThreeProps = {
  lowPower: boolean;
};

const LOGO_TEXTURE_URL = `${import.meta.env.BASE_URL}logo-transparent.png`;

const configureTexture = (texture: Texture, lowPower: boolean) => {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = lowPower ? 2 : 8;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
};

const LogoMonument = ({ lowPower }: PublicHeroThreeProps) => {
  const groupRef = useRef<Group>(null);
  const frameGateRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const swayRef = useRef({ x: 0, y: 0 });
  const [coarsePointer, setCoarsePointer] = useState(false);

  const logoTexture = useTexture(LOGO_TEXTURE_URL);

  useEffect(() => {
    configureTexture(logoTexture, lowPower);
  }, [logoTexture, lowPower]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarsePointer(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (coarsePointer || lowPower) return;

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [coarsePointer, lowPower]);

  const logoSize = useMemo(() => {
    const image = logoTexture.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 1.1;
    const width = lowPower ? 7.8 : 9.2;
    return { width, height: width / aspect };
  }, [logoTexture, lowPower]);

  const depthLayers = lowPower ? 4 : 7;
  const depthStep = lowPower ? 0.014 : 0.016;

  useFrame((state) => {
    const targetFps = 30;
    const elapsed = state.clock.elapsedTime;
    const frameStep = 1 / targetFps;
    if (elapsed - frameGateRef.current < frameStep) return;
    frameGateRef.current = elapsed;

    const disableParallax = lowPower || coarsePointer;
    const smoothing = disableParallax ? 0.1 : 0.08;
    const parallaxX = disableParallax ? 0 : 0.11;
    const parallaxY = disableParallax ? 0 : 0.065;

    swayRef.current.x += (pointerRef.current.x * parallaxX - swayRef.current.x) * smoothing;
    swayRef.current.y += (-pointerRef.current.y * parallaxY - swayRef.current.y) * smoothing;

    if (!groupRef.current) return;

    const breathing = Math.sin(elapsed * 0.42) * 0.11;
    const pitch = Math.sin(elapsed * 0.18) * 0.02;
    const yaw = Math.sin(elapsed * 0.16 + 0.4) * 0.046;
    const baseY = lowPower ? 0.3 : 1.96;

    groupRef.current.position.x = swayRef.current.x;
    groupRef.current.position.y = baseY + breathing + swayRef.current.y * 0.12;
    groupRef.current.position.z = -0.26;
    groupRef.current.rotation.x = pitch;
    groupRef.current.rotation.y = yaw + swayRef.current.x * 0.22;
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: depthLayers }).map((_, index) => (
        <mesh key={`depth-${index}`} position={[0, 0, -(depthLayers - index) * depthStep]}>
          <planeGeometry args={[logoSize.width, logoSize.height]} />
          <meshStandardMaterial
            color="#1a368b"
            map={logoTexture}
            transparent
            alphaTest={0.12}
            opacity={0.08}
            metalness={0.06}
            roughness={0.78}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[logoSize.width, logoSize.height]} />
        <meshPhysicalMaterial
          map={logoTexture}
          transparent
          alphaTest={0.12}
          opacity={0.4}
          metalness={0.08}
          roughness={0.38}
          clearcoat={0.42}
          clearcoatRoughness={0.32}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

const PublicHeroThree = ({ lowPower }: PublicHeroThreeProps) => {
  return (
    <Canvas
      className="public-hero-canvas"
      data-hero-logo
      camera={{ position: [0, 0.34, 10.2], fov: 33 }}
      dpr={lowPower ? [1, 1.2] : [1, 1.5]}
      gl={{ alpha: true, antialias: !lowPower, powerPreference: "high-performance" }}
      frameloop="always"
    >
      <ambientLight intensity={0.62} color="#f6f8ff" />
      <directionalLight position={[2.8, 3.4, 5.2]} intensity={0.9} color="#ffffff" />
      <directionalLight position={[-3.1, 1.2, -5]} intensity={0.3} color="#8ea5f7" />
      <pointLight position={[1.4, -0.4, 4]} intensity={0.34} color="#ffd86c" />
      <LogoMonument lowPower={lowPower} />
    </Canvas>
  );
};

export default memo(PublicHeroThree);
