"use client";

/**
 * The actual 3D world: a landscape with a Tron-style neon grid hovering just
 * above it, distant mountains and scattered trees for depth, one raised
 * hexagonal platform per project (positioned on a real hex grid, not a
 * simple ring), agent sessions as glowing markers orbiting or docked on
 * their platform, and one dashed "+" hex platform for adding a
 * project/agent. Visual language borrowed deliberately from
 * github.com/Kvadratni/thegrid (grid floor, bloom, per-agent neon color) --
 * adapted to Worldview's actual data model (projects + sessions, not a
 * file system) rather than reproduced wholesale.
 *
 * Pure presentation: takes already-grouped data and callbacks, owns no
 * WebSocket or form state itself -- that stays in world-canvas.tsx, which
 * dynamically imports this (ssr: false; three.js touches window at module
 * scope and cannot run server-side).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

import { revokeAgentSessionAction } from "@/lib/data/actions";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import type { DisplaySession } from "@/lib/data/types";

export interface WorldGroup {
  projectId?: string;
  projectName: string;
  sessions: DisplaySession[];
}

export type PresenceState = "online" | "offline";
export interface PresenceEntry {
  sessionRef: string;
  state: PresenceState;
  activity?: string;
  lastEventAt: number;
}

const GRID_SIZE = 140;
const GRID_DIVISIONS = 56;
const TERRAIN_RADIUS = 110;
/** The hex-grid cell size ("fit the grid" rather than floating free on a
 * ring) -- platform circumradius is a hair smaller than this so adjacent
 * platforms sit close with a small visible gap, instead of touching. */
const HEX_SIZE = 3.8;
const PLATFORM_RADIUS = HEX_SIZE - 0.35;
const PLATFORM_HEIGHT = 0.7;

/** Axial hex directions, used to walk each ring of the spiral. */
const HEX_DIRECTIONS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function hexRing(radius: number): [number, number][] {
  if (radius === 0) return [[0, 0]];
  const results: [number, number][] = [];
  let q = HEX_DIRECTIONS[4]![0] * radius;
  let r = HEX_DIRECTIONS[4]![1] * radius;
  for (let side = 0; side < 6; side += 1) {
    const [dq, dr] = HEX_DIRECTIONS[side]!;
    for (let step = 0; step < radius; step += 1) {
      results.push([q, r]);
      q += dq;
      r += dr;
    }
  }
  return results;
}

/** Axial coordinates spiraling outward from the center -- ring 0 (the
 * origin) first, so the first project always lands in the middle of the
 * world rather than at a corner. */
function hexSpiral(count: number): [number, number][] {
  const results: [number, number][] = [];
  let radius = 0;
  while (results.length < count) {
    results.push(...hexRing(radius));
    radius += 1;
  }
  return results.slice(0, count);
}

/** Flat-top axial-to-world conversion, sized so adjacent hex cells are
 * exactly HEX_SIZE apart -- platforms tile the grid rather than merely
 * sitting near it. */
function hexToWorld(q: number, r: number): [number, number] {
  const x = HEX_SIZE * 1.5 * q;
  const z = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return [x, z];
}

function layoutPositions(count: number): [number, number][] {
  return hexSpiral(count).map(([q, r]) => hexToWorld(q, r));
}

/** Deterministic pseudo-random in [0, 1) -- stable across renders (no
 * Math.random flicker on re-layout) without pulling in a seeded-RNG dep. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function WorldScene({
  groups,
  presence,
  viewerId,
  viewerWorkspaceId,
  onAddClick,
}: {
  groups: WorldGroup[];
  presence: Map<string, PresenceEntry>;
  viewerId: string;
  viewerWorkspaceId: string;
  onAddClick: () => void;
}) {
  const positions = useMemo(() => layoutPositions(groups.length + 1), [groups.length]);

  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      camera={{ position: [0, 16, 24], fov: 50 }}
    >
      <color attach="background" args={["#050b14"]} />
      <fog attach="fog" args={["#050b14", 35, 105]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#3a5a6e", "#05070a", 0.5]} />
      <pointLight position={[0, 20, 0]} intensity={0.6} color="#5ad8ff" />
      <directionalLight position={[-30, 40, -20]} intensity={0.3} color="#7fb8d6" />

      <Mountains />
      <Landscape />
      <Trees excludeRadius={HEX_SIZE * (Math.sqrt(groups.length + 2) + 1)} />
      <GridFloor />

      {groups.map((group, index) => (
        <ProjectPlatform
          key={group.projectId ?? "unassigned"}
          group={group}
          position={positions[index] ?? [0, 0]}
          presence={presence}
          viewerId={viewerId}
          viewerWorkspaceId={viewerWorkspaceId}
        />
      ))}

      <AddPlatform position={positions[groups.length] ?? [0, 0]} onClick={onAddClick} />

      <OrbitControls
        enablePan={false}
        minDistance={10}
        maxDistance={70}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 1, 0]}
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.9} intensity={1.3} radius={0.7} />
      </EffectComposer>
    </Canvas>
  );
}

/** The ground itself -- a real (if low-poly) landscape: a displaced plane
 * with rolling hills, not a flat void. The neon grid (GridFloor) hovers a
 * hair above it like a highway overlay, rather than being the ground. */
function Landscape() {
  const geometry = useMemo(() => {
    const segments = 90;
    const geo = new THREE.PlaneGeometry(TERRAIN_RADIUS * 2, TERRAIN_RADIUS * 2, segments, segments);
    const position = geo.attributes.position!;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i); // pre-rotation "y" is world Z once laid flat
      const distance = Math.sqrt(x * x + y * y);
      // Layered sine hills, damped toward the center so the platform cluster
      // sits on relatively flat ground, and damped again past the terrain
      // radius edge so it doesn't read as an abrupt cliff.
      const hills =
        Math.sin(x * 0.05) * Math.cos(y * 0.05) * 1.6 +
        Math.sin(x * 0.12 + 4.1) * Math.sin(y * 0.09) * 0.7;
      const centerFlatten = Math.min(1, Math.max(0, (distance - 18) / 30));
      const edgeFade = 1 - Math.min(1, Math.max(0, (distance - TERRAIN_RADIUS * 0.7) / (TERRAIN_RADIUS * 0.3)));
      position.setZ(i, hills * centerFlatten * edgeFade);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow={false}>
      <meshStandardMaterial color="#0a1f22" roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

/** A low-poly mountain range at the horizon -- just for depth and scale,
 * fading into fog rather than rendered in bloom-bright detail. */
function Mountains() {
  const peaks = useMemo(() => {
    const count = 22;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + pseudoRandom(i) * 0.2;
      const distance = 85 + pseudoRandom(i + 50) * 25;
      const height = 14 + pseudoRandom(i + 100) * 22;
      const radius = 10 + pseudoRandom(i + 150) * 14;
      return {
        position: [Math.cos(angle) * distance, height / 2 - 1, Math.sin(angle) * distance] as [
          number,
          number,
          number,
        ],
        height,
        radius,
        rotation: pseudoRandom(i + 200) * Math.PI,
      };
    });
  }, []);

  return (
    <group>
      {peaks.map((peak, i) => (
        <mesh key={i} position={peak.position} rotation={[0, peak.rotation, 0]}>
          <coneGeometry args={[peak.radius, peak.height, 6]} />
          <meshStandardMaterial color="#16233a" roughness={1} fog />
        </mesh>
      ))}
    </group>
  );
}

/** Simple low-poly trees (cone + trunk) scattered around the platform
 * cluster, thinning out toward the mountains. Instanced since there can be
 * several dozen. */
function Trees({ excludeRadius }: { excludeRadius: number }) {
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const count = 70;

  const trees = useMemo(() => {
    const items: { x: number; z: number; scale: number; rotation: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const seed = i * 7.13;
      const angle = pseudoRandom(seed) * Math.PI * 2;
      const distance = excludeRadius + 3 + pseudoRandom(seed + 1) * (TERRAIN_RADIUS * 0.55);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      items.push({
        x,
        z,
        scale: 0.7 + pseudoRandom(seed + 2) * 1.1,
        rotation: pseudoRandom(seed + 3) * Math.PI * 2,
      });
    }
    return items;
  }, [excludeRadius]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!foliageRef.current || !trunkRef.current) return;
    trees.forEach((tree, i) => {
      dummy.position.set(tree.x, 1.1 * tree.scale - 0.4, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      foliageRef.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tree.x, 0.35 * tree.scale - 0.4, tree.z);
      dummy.updateMatrix();
      trunkRef.current!.setMatrixAt(i, dummy.matrix);
    });
    foliageRef.current.instanceMatrix.needsUpdate = true;
    trunkRef.current.instanceMatrix.needsUpdate = true;
  }, [trees, dummy]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.06, 0.09, 0.7, 5]} />
        <meshStandardMaterial color="#2a2118" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={foliageRef} args={[undefined, undefined, count]}>
        <coneGeometry args={[0.55, 1.5, 6]} />
        <meshStandardMaterial color="#123524" emissive="#0d5c3a" emissiveIntensity={0.15} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function GridFloor() {
  const geometry = useMemo(() => {
    const half = GRID_SIZE / 2;
    const step = GRID_SIZE / GRID_DIVISIONS;
    const vertices: number[] = [];
    for (let i = 0; i <= GRID_DIVISIONS; i += 1) {
      const p = -half + i * step;
      vertices.push(-half, 0, p, half, 0, p);
      vertices.push(p, 0, -half, p, 0, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, []);

  return (
    <lineSegments geometry={geometry} position={[0, 0.01, 0]}>
      <lineBasicMaterial color="#2a7ea8" transparent opacity={0.4} />
    </lineSegments>
  );
}

function HexPlatformBase({
  glowColor,
  emissiveIntensity,
  dashed,
}: {
  glowColor: string;
  emissiveIntensity: number;
  dashed?: boolean;
}) {
  return (
    <group>
      <mesh position={[0, PLATFORM_HEIGHT / 2, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS * 1.04, PLATFORM_HEIGHT, 6]} />
        <meshStandardMaterial
          color="#0d1620"
          emissive="#0f3a52"
          emissiveIntensity={emissiveIntensity}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0, PLATFORM_HEIGHT + 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
        {dashed ? (
          <ringGeometry args={[PLATFORM_RADIUS - 0.12, PLATFORM_RADIUS, 6, 1, 0, Math.PI * 1.7]} />
        ) : (
          <ringGeometry args={[PLATFORM_RADIUS - 0.12, PLATFORM_RADIUS, 6]} />
        )}
        <meshBasicMaterial color={glowColor} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function ProjectPlatform({
  group,
  position,
  presence,
  viewerId,
  viewerWorkspaceId,
}: {
  group: WorldGroup;
  position: [number, number];
  presence: Map<string, PresenceEntry>;
  viewerId: string;
  viewerWorkspaceId: string;
}) {
  const [x, z] = position;
  const sessionSlots = useMemo(() => {
    const count = group.sessions.length;
    if (count === 0) return [];
    const slotRadius = Math.min(PLATFORM_RADIUS - 0.6, 1.1 + count * 0.15);
    return group.sessions.map((session, i) => ({
      session,
      angle: (i / count) * Math.PI * 2,
      radius: slotRadius,
    }));
  }, [group.sessions]);

  return (
    <group position={[x, 0, z]}>
      <HexPlatformBase glowColor="#5ad8ff" emissiveIntensity={0.6} />

      <Text
        position={[0, PLATFORM_HEIGHT + 2.6, 0]}
        fontSize={0.42}
        color="#eaf6ff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#05070a"
      >
        {group.projectName}
      </Text>

      {sessionSlots.length === 0 ? (
        <Html position={[0, PLATFORM_HEIGHT + 0.6, 0]} center distanceFactor={14} occlude>
          <p className="world-scene-empty-note">No sessions yet</p>
        </Html>
      ) : (
        sessionSlots.map(({ session, angle, radius }) => (
          <SessionMarker
            key={session.id}
            session={session}
            angle={angle}
            radius={radius}
            live={presence.get(session.sessionRef)}
            canRevoke={session.ownerId === viewerId || session.workspaceId === viewerWorkspaceId}
          />
        ))
      )}
    </group>
  );
}

/** Radians/second an online session's marker orbits its platform center at. */
const ORBIT_SPEED = 0.5;

function SessionMarker({
  session,
  angle,
  radius,
  live,
  canRevoke,
}: {
  session: DisplaySession;
  angle: number;
  radius: number;
  live?: PresenceEntry;
  canRevoke: boolean;
}) {
  const online = live?.state === "online";
  const docked = live?.state === "offline";
  const orbitRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const color = online ? session.color.dark : "#3a4a55";
  const dockX = Math.cos(angle) * radius;
  const dockZ = Math.sin(angle) * radius;
  const baseY = PLATFORM_HEIGHT;

  useFrame(({ clock }) => {
    if (!orbitRef.current || !spinRef.current) return;
    const t = clock.getElapsedTime();
    if (online) {
      // Actually orbits the platform center at its own radius/speed, rather
      // than just bobbing in place -- a session that's working should look
      // like it's doing laps, not idling.
      const liveAngle = angle + t * ORBIT_SPEED;
      orbitRef.current.position.x = Math.cos(liveAngle) * radius;
      orbitRef.current.position.z = Math.sin(liveAngle) * radius;
      orbitRef.current.position.y = baseY + 0.55 + Math.sin(t * 2 + angle) * 0.12;
      spinRef.current.rotation.y = t * 0.8;
    } else {
      // Parked back at its fixed dock slot -- the ring below marks the same
      // spot, so this reads as "returned to the dock," not "vanished."
      orbitRef.current.position.x = dockX;
      orbitRef.current.position.z = dockZ;
      orbitRef.current.position.y = baseY + 0.4;
      spinRef.current.rotation.y = 0;
    }
  });

  const displayName = session.label || agentProviderLabel(session.provider);
  let statusText: string;
  if (online) statusText = live?.activity ?? "Online";
  else if (docked) statusText = "Docked";
  else statusText = `Registered · ${relativeTime(session.createdAt)}`;

  return (
    <group>
      {/* Docking-bay ring, fixed at this session's home slot on top of the
          platform -- the "charging station" it's parked in while offline,
          and the spot it departs from/returns to while orbiting online. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dockX, baseY + 0.015, dockZ]}>
        <ringGeometry args={[0.34, 0.42, 24]} />
        <meshBasicMaterial color={online ? color : "#1c2a33"} transparent opacity={0.9} />
      </mesh>

      <group ref={orbitRef} position={[dockX, baseY + 0.4, dockZ]}>
        <group ref={spinRef}>
          <mesh>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={online ? 2.2 : 0.25}
              roughness={0.3}
              metalness={0.4}
            />
          </mesh>
        </group>

        <Html position={[0, 0.75, 0]} center distanceFactor={11} occlude>
          <div className="world-scene-card">
            <p className="world-scene-card-name">{displayName}</p>
            <p className="world-scene-card-status">{statusText}</p>
            {canRevoke ? (
              <form action={revokeAgentSessionAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <button type="submit" className="world-scene-card-revoke">
                  Revoke
                </button>
              </form>
            ) : null}
          </div>
        </Html>
      </group>
    </group>
  );
}

function AddPlatform({ position, onClick }: { position: [number, number]; onClick: () => void }) {
  const [x, z] = position;
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <HexPlatformBase
        glowColor={hovered ? "#eaf6ff" : "#5ad8ff"}
        emissiveIntensity={hovered ? 0.9 : 0.4}
        dashed
      />

      <Text
        position={[0, PLATFORM_HEIGHT + 1.1, 0]}
        fontSize={1.1}
        color={hovered ? "#eaf6ff" : "#5ad8ff"}
        anchorX="center"
        anchorY="middle"
      >
        +
      </Text>
      <Text
        position={[0, PLATFORM_HEIGHT + 0.15, 0]}
        fontSize={0.32}
        color={hovered ? "#eaf6ff" : "#8fb9c9"}
        anchorX="center"
        anchorY="middle"
      >
        Add a project
      </Text>
    </group>
  );
}
