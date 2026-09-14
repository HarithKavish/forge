"use client";

/**
 * The actual 3D world: a landscape with a subtle white grid hovering just
 * above it, distant mountains and scattered trees for depth, one raised
 * hexagonal platform per project (positioned on a real hex grid, not a
 * simple ring), a firepit at each platform's center, and provider-colored
 * robots representing each linked agent session -- walking while online,
 * docked at a fixed charging pad while offline. One dashed "+" hex platform
 * for adding a project/agent exists in code but is not rendered
 * (docs/BRIDGE.md "Projects are not managed here") -- every real Forge
 * project is its own island already, so there is nothing for it to do.
 *
 * Pure presentation: takes already-grouped data and callbacks, owns no
 * WebSocket or form state itself -- that stays in world-canvas.tsx, which
 * dynamically imports this (ssr: false; three.js touches window at module
 * scope and cannot run server-side).
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

import type { AgentProvider, DisplaySession } from "@/lib/data/types";

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

/** Set to render the legacy "Add a project" island again. Left in place
 * rather than deleted (docs/BRIDGE.md): Worldview no longer manages
 * projects itself, every real Forge project is already its own island, so
 * this control has nothing left to do -- but the code stays intact rather
 * than being torn out. */
const SHOW_ADD_PLATFORM = false;

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

/** Stable string hash (djb2-ish) -- used to derive each linked session's
 * dock angle from its own id rather than its position in an array, so
 * adding/removing a *different* session on the same project never moves
 * this one (docs/BRIDGE.md "Deterministic docking"). */
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967295;
}

/** Provider brand colors for the robots. `AgentProvider` only enumerates
 * claude/codex/gemini/other -- there's no `deepseek` value to key on, so a
 * provider like DeepSeek falls into `other` today rather than getting a
 * hardcoded (and incorrect) slot of its own. Keyed by provider, never by
 * person, so this never needs per-user color logic. */
const PROVIDER_COLORS: Record<AgentProvider, string> = {
  claude: "#d97757",
  codex: "#e8e8e8",
  gemini: "#4c8df6",
  other: "#8e6fd6",
};

export function WorldScene({
  groups,
  presence,
  viewerId: _viewerId,
  viewerWorkspaceId: _viewerWorkspaceId,
  onAddClick,
  onProjectClick,
}: {
  groups: WorldGroup[];
  presence: Map<string, PresenceEntry>;
  viewerId: string;
  viewerWorkspaceId: string;
  onAddClick: () => void;
  onProjectClick: (projectId: string) => void;
}) {
  const positions = useMemo(() => layoutPositions(groups.length + 1), [groups.length]);

  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      camera={{ position: [0, 16, 24], fov: 50 }}
    >
      <color attach="background" args={["#bfe6f5"]} />
      <fog attach="fog" args={["#cdeaf7", 55, 150]} />
      <ambientLight intensity={0.75} color="#fff6e0" />
      <hemisphereLight args={["#bfe6f5", "#5a8f4a", 0.7]} />
      <directionalLight position={[-35, 45, 20]} intensity={1.4} color="#fff3d6" />
      <pointLight position={[0, 14, 0]} intensity={0.35} color="#5ad8ff" />

      <SkyDome />
      <Mountains />
      <Landscape />
      <Trees
        excludeRadius={HEX_SIZE * (Math.sqrt(groups.length + 2) + 1)}
        extraExclude={{ x: SHOWCASE_ISLAND_POSITION[0], z: SHOWCASE_ISLAND_POSITION[1], radius: SHOWCASE_ISLAND_RADIUS }}
      />
      <GridFloor />

      {groups.map((group, index) => (
        <ProjectPlatform
          key={group.projectId ?? "unassigned"}
          group={group}
          position={positions[index] ?? [0, 0]}
          presence={presence}
          onClick={group.projectId ? () => onProjectClick(group.projectId!) : undefined}
        />
      ))}

      {/* Separate from the project-island cluster entirely -- a fixed
          showcase platform, not one more project (docs/BRIDGE.md "Agent
          gallery"). */}
      <DisplayIsland />

      {SHOW_ADD_PLATFORM ? <AddPlatform position={positions[groups.length] ?? [0, 0]} onClick={onAddClick} /> : null}

      <OrbitControls
        enablePan={false}
        minDistance={10}
        maxDistance={70}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 1, 0]}
        autoRotate
        autoRotateSpeed={0.35}
      />

      <EffectComposer>
        {/* Raised well above the old dark-scene value: the sky/ground are
            bright now, so a low threshold would bloom the whole daytime
            scene into a haze instead of picking out just the neon platform
            glow the way it should. */}
        <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.4} intensity={1.1} radius={0.6} />
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
      position.setZ(i, hills * centerFlatten * edgeFade * 1.4);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow={false}>
      <meshStandardMaterial color="#5aa653" roughness={0.9} metalness={0} />
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
        <group key={i} position={peak.position} rotation={[0, peak.rotation, 0]}>
          <mesh>
            <coneGeometry args={[peak.radius, peak.height, 6]} />
            <meshStandardMaterial color={i % 2 === 0 ? "#9b8fae" : "#a08a78"} roughness={1} fog />
          </mesh>
          {/* A smaller, lighter cone near the tip stands in for a snow cap --
              cheap way to get the two-tone stylized-peak look from the
              reference images without a custom gradient shader. */}
          <mesh position={[0, peak.height * 0.32, 0]}>
            <coneGeometry args={[peak.radius * 0.42, peak.height * 0.4, 6]} />
            <meshStandardMaterial color="#f2eef0" roughness={0.9} fog />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Simple low-poly trees (cone + trunk) scattered around the platform
 * cluster, thinning out toward the mountains. Instanced since there can be
 * several dozen. */
function Trees({
  excludeRadius,
  extraExclude,
}: {
  excludeRadius: number;
  /** A second clearing, centered somewhere other than the origin (the
   * showcase island, currently) -- any tree that would land inside it is
   * pushed radially out past its edge instead, rather than skipped
   * outright, so the total tree count stays put. */
  extraExclude?: { x: number; z: number; radius: number };
}) {
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const count = 70;

  const trees = useMemo(() => {
    const items: { x: number; z: number; scale: number; rotation: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const seed = i * 7.13;
      const angle = pseudoRandom(seed) * Math.PI * 2;
      const distance = excludeRadius + 3 + pseudoRandom(seed + 1) * (TERRAIN_RADIUS * 0.55);
      let x = Math.cos(angle) * distance;
      let z = Math.sin(angle) * distance;

      if (extraExclude) {
        const edx = x - extraExclude.x;
        const edz = z - extraExclude.z;
        const edist = Math.hypot(edx, edz);
        if (edist < extraExclude.radius) {
          const pushAngle = edist > 0.0001 ? Math.atan2(edz, edx) : angle;
          const pushed = extraExclude.radius + 1.5;
          x = extraExclude.x + Math.cos(pushAngle) * pushed;
          z = extraExclude.z + Math.sin(pushAngle) * pushed;
        }
      }

      items.push({
        x,
        z,
        scale: 0.7 + pseudoRandom(seed + 2) * 1.1,
        rotation: pseudoRandom(seed + 3) * Math.PI * 2,
      });
    }
    return items;
  }, [excludeRadius, extraExclude]);

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
        <meshStandardMaterial color="#7a5230" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={foliageRef} args={[undefined, undefined, count]}>
        <coneGeometry args={[0.55, 1.5, 6]} />
        <meshStandardMaterial color="#3f9c4a" roughness={0.85} />
      </instancedMesh>
    </group>
  );
}

/** A gradient sky dome -- bright blue overhead fading to a pale, almost
 * white haze near the horizon (a clear daytime sky, not a night one) -- so
 * there's an actual sky and a visible horizon line where it meets the
 * terrain/mountains, instead of the ground just cutting to flat color.
 * Vertex-colored, no shader needed. */
function SkyDome() {
  const geometry = useMemo(() => {
    const radius = 130;
    const geo = new THREE.SphereGeometry(radius, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.15);
    const position = geo.attributes.position!;
    const colors = new Float32Array(position.count * 3);
    const top = new THREE.Color("#3f9be0");
    const horizon = new THREE.Color("#eaf7ff");
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const t = THREE.MathUtils.clamp(1 - y / radius, 0, 1); // 0 at zenith, ~1 near horizon
      const mixed = top.clone().lerp(horizon, Math.pow(t, 1.6));
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} />
    </mesh>
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
      <lineBasicMaterial color="#f4f8fb" transparent opacity={0.35} />
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
    // A single outer Y-rotation shared by both meshes, via nesting rather
    // than a compound per-mesh Euler -- mixing rotation.x and rotation.z on
    // the flat ring while the cylinder used a plain rotation.y produced two
    // *different* final orientations (Euler composition order), so the
    // glowing ring outline and the solid hex body didn't actually line up.
    <group rotation={[0, Math.PI / 6, 0]}>
      <mesh position={[0, PLATFORM_HEIGHT / 2, 0]}>
        {/* Equal top/bottom radius -- a tapered frustum here read as a
            visible seam/overlap against a neighboring platform's own base
            at the shared edge; a straight hexagonal prism doesn't. */}
        <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS, PLATFORM_HEIGHT, 6]} />
        <meshStandardMaterial
          color="#0d1620"
          emissive="#0f3a52"
          emissiveIntensity={emissiveIntensity}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      {/*
        CylinderGeometry's own theta=0 vertex sits at local (0,0,r) (+Z);
        RingGeometry's sits at local (r,0,0) (+X) -- a fixed 90 deg mismatch
        baked into the two geometry types themselves, independent of
        whatever rotation gets applied on top (verified numerically: the old
        single-Euler [-90,0,30] and a naive [-90,0,0]-inside-a-30deg-group
        both land the ring's vertex at the exact same world point, since
        Ry(30)*Rx(-90) == Rx(-90)*Rz(30) is a rotation-conjugation identity
        -- so neither was ever a real fix). The extra -90 deg on Z below is
        what actually rotates the ring's local zero onto the cylinder's.
      */}
      <mesh position={[0, PLATFORM_HEIGHT + 0.01, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
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

/** A firepit at the center of every project platform -- purely atmospheric,
 * no data attached to it. Two overlapping cones scaled/rotated per-frame
 * with offset sine waves stand in for a waving flame without a shader. */
function Firepit() {
  const flameRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;
    const t = clock.getElapsedTime();
    flameRef.current.scale.set(1 + Math.sin(t * 6) * 0.1, 1 + Math.sin(t * 5.3 + 1) * 0.18, 1 + Math.cos(t * 6.7) * 0.1);
    flameRef.current.rotation.y = Math.sin(t * 1.3) * 0.35;
  });

  return (
    <group position={[0, PLATFORM_HEIGHT, 0]}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.5, 0.62, 0.16, 10]} />
        <meshStandardMaterial color="#463a30" roughness={1} />
      </mesh>
      <group ref={flameRef} position={[0, 0.28, 0]}>
        <mesh>
          <coneGeometry args={[0.26, 0.68, 8]} />
          <meshStandardMaterial color="#2f8fe0" emissive="#3fa9ff" emissiveIntensity={2.6} transparent opacity={0.88} />
        </mesh>
        <mesh position={[0, 0.16, 0]} scale={[0.6, 0.65, 0.6]}>
          <coneGeometry args={[0.26, 0.68, 8]} />
          <meshStandardMaterial color="#bfe8ff" emissive="#dff3ff" emissiveIntensity={3.2} transparent opacity={0.85} />
        </mesh>
      </group>
      <pointLight position={[0, 0.6, 0]} color="#3fa9ff" intensity={1.3} distance={5.5} />
    </group>
  );
}

function ProjectPlatform({
  group,
  position,
  presence,
  onClick,
}: {
  group: WorldGroup;
  position: [number, number];
  presence: Map<string, PresenceEntry>;
  onClick?: () => void;
}) {
  const [x, z] = position;
  const [hovered, setHovered] = useState(false);
  // Shared, per-platform: every online robot here registers its live
  // position so the others can steer around it (docs/BRIDGE.md "Agent
  // gallery"). A plain ref, not state -- written every frame in each
  // robot's own animation loop, never through React.
  const neighborsRef = useRef<NeighborMap>(new Map());
  // Robots roam the platform's full usable area, not a tight circle --
  // out to near the edge, but clear of the firepit at the center.
  const roamRadius = PLATFORM_RADIUS - 0.5;
  const excludeRadius = 1.0;

  const dockSlots = useMemo(() => {
    // One dock per *linked* session, always -- online or offline doesn't
    // change the count (docs/BRIDGE.md "Docking positions"). The angle
    // comes from a hash of the session's own stable id, not its index in
    // this array, so a session's dock never moves when another session on
    // the same project is added or removed. Radius sits near the platform's
    // edge -- "a corner of the platform," not the middle (the firepit's).
    const dockRadius = PLATFORM_RADIUS - 0.45;
    return group.sessions.map((session) => {
      const angle = hashString(session.id) * Math.PI * 2;
      return { session, angle, dockRadius };
    });
  }, [group.sessions]);

  return (
    <group
      position={[x, 0, z]}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerOver={
        onClick
          ? (event) => {
              event.stopPropagation();
              setHovered(true);
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        onClick
          ? () => {
              setHovered(false);
              document.body.style.cursor = "auto";
            }
          : undefined
      }
    >
      <HexPlatformBase glowColor={hovered ? "#eaf6ff" : "#5ad8ff"} emissiveIntensity={hovered ? 0.9 : 0.6} />

      {/* Only the project title is ever shown floating over a platform
          (docs/BRIDGE.md "Project world text") -- agent presence is
          communicated entirely through the robots themselves. */}
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

      <Firepit />

      {dockSlots.map(({ session, angle, dockRadius }) => (
        <AgentRobot
          key={session.id}
          robotKey={session.id}
          provider={session.provider}
          dockAngle={angle}
          dockRadius={dockRadius}
          baseY={PLATFORM_HEIGHT}
          online={presence.get(session.sessionRef)?.state === "online"}
          seed={hashString(session.id + ":wander")}
          roamRadius={roamRadius}
          excludeRadius={excludeRadius}
          neighbors={neighborsRef.current}
        />
      ))}
    </group>
  );
}

type RobotState = "OFFLINE_DOCKED" | "WALKING_OUT" | "ONLINE_WALKING" | "WALKING_TO_DOCK";
const TRANSITION_SECONDS = 1.3;
const LEG_SPEED = 8;
/** How close two robots on the same platform can get before they start
 * steering apart (docs/BRIDGE.md "Agent gallery" -- "go around each other
 * without bumping"). */
const SEPARATION_RADIUS = 0.55;
const SEPARATION_FORCE = 3.5;

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Live (x, z) positions of every robot currently roaming one platform,
 * keyed by a stable id -- shared per-platform so each robot's separation
 * steering can see its neighbors without any of them re-rendering. Plain
 * mutation of a Map, never touched by React state. */
type NeighborMap = Map<string, { x: number; z: number }>;

function clampToAnnulus(x: number, z: number, outerRadius: number, innerRadius: number): { x: number; z: number } {
  const dist = Math.hypot(x, z);
  if (dist > outerRadius) {
    const s = outerRadius / dist;
    return { x: x * s, z: z * s };
  }
  if (innerRadius > 0 && dist < innerRadius) {
    if (dist < 0.0001) return { x: innerRadius, z: 0 };
    const s = innerRadius / dist;
    return { x: x * s, z: z * s };
  }
  return { x, z };
}

/** A smooth, non-circular wandering path covering most of the platform --
 * two independent-frequency waves per axis, so it reads as organic
 * roaming rather than a small fixed-radius orbit. Clamped to stay within
 * `roamRadius` and clear of `excludeRadius` (a firepit, on project
 * platforms; 0 on the showcase island, which has none). */
function roamTarget(t: number, seed: number, roamRadius: number, excludeRadius: number): { x: number; z: number } {
  const x =
    Math.sin(t * 0.17 + seed) * roamRadius * 0.55 + Math.sin(t * 0.09 + seed * 1.7) * roamRadius * 0.45;
  const z =
    Math.cos(t * 0.13 + seed * 1.3) * roamRadius * 0.55 + Math.cos(t * 0.21 + seed * 0.6) * roamRadius * 0.45;
  return clampToAnnulus(x, z, roamRadius, excludeRadius);
}

/** Lightweight pairwise separation ("boids"-lite, not pathfinding): nudges
 * (x, z) away from every neighbor closer than SEPARATION_RADIUS, scaled by
 * frame time so it reads as smooth steering rather than a jitter. */
function applySeparation(
  x: number,
  z: number,
  selfKey: string,
  neighbors: NeighborMap,
  delta: number,
): { x: number; z: number } {
  let dx = 0;
  let dz = 0;
  for (const [key, pos] of neighbors) {
    if (key === selfKey) continue;
    const ddx = x - pos.x;
    const ddz = z - pos.z;
    const dist = Math.hypot(ddx, ddz);
    if (dist > 0.0001 && dist < SEPARATION_RADIUS) {
      const push = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS;
      dx += (ddx / dist) * push;
      dz += (ddz / dist) * push;
    }
  }
  return { x: x + dx * SEPARATION_FORCE * delta, z: z + dz * SEPARATION_FORCE * delta };
}

/** Total height of the humanoid fallback model's head-top, and of the
 * Claude bot model's head-top -- used to place each model's own status
 * sphere at a sensible height above whichever body is actually rendered. */
const HUMANOID_TOP_Y = 0.54;
const CLAUDE_BOT_TOP_Y = 0.32;
const GEMINI_TOP_Y = 0.5;
/** The rest angle Gemini's two arms are held out from the body at --
 * combined with a swing on top while walking, in the same place the
 * per-frame animation loop already updates leg rotation. */
const GEMINI_ARM_BASE_ANGLE = Math.PI * 0.32;

/**
 * The generic per-provider fallback body: a small box humanoid. Used for
 * every provider except Claude, which gets its own model
 * (`ClaudeBotModel`) -- see docs/BRIDGE.md "Robot models". Kept exactly as
 * it was before that split, just extracted into its own component.
 */
function HumanoidModel({
  color,
  leftLegRef,
  rightLegRef,
}: {
  color: string;
  leftLegRef: RefObject<THREE.Object3D | null>;
  rightLegRef: RefObject<THREE.Object3D | null>;
}) {
  return (
    <>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[0.24, 0.26, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh ref={leftLegRef as RefObject<THREE.Mesh>} position={[-0.07, 0.13, 0]}>
        <boxGeometry args={[0.07, 0.26, 0.09]} />
        <meshStandardMaterial color="#2b333a" roughness={0.6} />
      </mesh>
      <mesh ref={rightLegRef as RefObject<THREE.Mesh>} position={[0.07, 0.13, 0]}>
        <boxGeometry args={[0.07, 0.26, 0.09]} />
        <meshStandardMaterial color="#2b333a" roughness={0.6} />
      </mesh>
    </>
  );
}

/**
 * Claude's own pixel-art mark, built as a voxel model instead of a
 * humanoid: a wide flat head with two ear nubs and two eye slits, standing
 * on two pairs of short legs -- the exact silhouette of the mark, not a
 * generic robot recolored orange (docs/BRIDGE.md "Robot models"). Legs are
 * two 2-leg groups (not four independent legs) so the existing
 * alternating-swing animation -- built for a 2-leg humanoid -- drives a
 * quadruped marching gait with no change to the animation code itself.
 */
function ClaudeBotModel({
  color,
  leftLegRef,
  rightLegRef,
  leftEarRef,
  rightEarRef,
}: {
  color: string;
  leftLegRef: RefObject<THREE.Object3D | null>;
  rightLegRef: RefObject<THREE.Object3D | null>;
  leftEarRef: RefObject<THREE.Object3D | null>;
  rightEarRef: RefObject<THREE.Object3D | null>;
}) {
  const bodyMaterial = <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} />;
  const legMaterial = <meshStandardMaterial color={color} roughness={0.5} metalness={0.15} />;
  const eyeMaterial = <meshStandardMaterial color="#1a1512" roughness={0.8} />;

  return (
    <>
      {/* Head/body -- one wide flat block, matching the mark's silhouette
          rather than a tall humanoid torso. */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.34, 0.2, 0.16]} />
        {bodyMaterial}
      </mesh>

      {/* Ear nubs, sitting in the lower-middle band of the head -- each
          wrapped in its own ref group (rather than a flat mesh) so the
          parent can wiggle it slightly with the gait. */}
      <group ref={leftEarRef} position={[-0.205, 0.19, 0]}>
        <mesh>
          <boxGeometry args={[0.07, 0.06, 0.13]} />
          {bodyMaterial}
        </mesh>
      </group>
      <group ref={rightEarRef} position={[0.205, 0.19, 0]}>
        <mesh>
          <boxGeometry args={[0.07, 0.06, 0.13]} />
          {bodyMaterial}
        </mesh>
      </group>

      {/* Eye slits, flush on the front face just above the ears. */}
      <mesh position={[-0.095, 0.245, 0.086]}>
        <boxGeometry args={[0.035, 0.05, 0.01]} />
        {eyeMaterial}
      </mesh>
      <mesh position={[0.095, 0.245, 0.086]}>
        <boxGeometry args={[0.035, 0.05, 0.01]} />
        {eyeMaterial}
      </mesh>

      {/* Two leg-pair groups, each a rigid cluster of two short legs --
          the group pivots at the hip (y=0.12, where it meets the body),
          not its own center, for a proper marching hinge. */}
      <group ref={leftLegRef} position={[-0.1, 0.12, 0]}>
        <mesh position={[-0.03, -0.06, 0]}>
          <boxGeometry args={[0.045, 0.12, 0.06]} />
          {legMaterial}
        </mesh>
        <mesh position={[0.03, -0.06, 0]}>
          <boxGeometry args={[0.045, 0.12, 0.06]} />
          {legMaterial}
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.1, 0.12, 0]}>
        <mesh position={[-0.03, -0.06, 0]}>
          <boxGeometry args={[0.045, 0.12, 0.06]} />
          {legMaterial}
        </mesh>
        <mesh position={[0.03, -0.06, 0]}>
          <boxGeometry args={[0.045, 0.12, 0.06]} />
          {legMaterial}
        </mesh>
      </group>
    </>
  );
}

/**
 * Gemini's mark: a rounded, gradient teardrop -- not a humanoid recolored
 * blue, the same principle as `ClaudeBotModel` (docs/BRIDGE.md "Robot
 * models"). The body is a single `LatheGeometry` (a 2D profile spun around
 * its own axis), which is what gives it a genuinely smooth, jelly-like
 * silhouette rather than a blocky one -- with a real red -> green -> blue
 * gradient baked in as per-vertex colors (the same technique `SkyDome`
 * already uses for its sky gradient), not a flat fill. Two dot eyes, one
 * curved smile (a partial torus, rotated so its arc opens upward), and two
 * long rounded "hands" (capsules) complete the mark. No legs -- it
 * "walks" by squashing and stretching as a whole (`bodyGroupRef`, driven
 * by the parent), which suits a jelly body better than a fake hinge would.
 */
function GeminiBotModel({
  leftArmRef,
  rightArmRef,
  bodyGroupRef,
}: {
  leftArmRef: RefObject<THREE.Object3D | null>;
  rightArmRef: RefObject<THREE.Object3D | null>;
  bodyGroupRef: RefObject<THREE.Group | null>;
}) {
  const bodyGeometry = useMemo(() => {
    // Profile traced from the mark: a narrow rounded tip at the top,
    // widening to its fullest a little below center, then rounding back
    // in to a soft point at the bottom -- y=0 is the ground (this model's
    // local origin convention matches the other two: feet/base at 0).
    const profile = [
      new THREE.Vector2(0.0, 0.5),
      new THREE.Vector2(0.05, 0.44),
      new THREE.Vector2(0.1, 0.36),
      new THREE.Vector2(0.135, 0.26),
      new THREE.Vector2(0.14, 0.16),
      new THREE.Vector2(0.13, 0.08),
      new THREE.Vector2(0.09, 0.02),
      new THREE.Vector2(0.0, 0.0),
    ];
    const geo = new THREE.LatheGeometry(profile, 28);
    const position = geo.attributes.position!;
    const colors = new Float32Array(position.count * 3);
    const top = new THREE.Color("#e0473f");
    const mid = new THREE.Color("#3fa96e");
    const bottom = new THREE.Color("#3f7fe0");
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const t = 1 - THREE.MathUtils.clamp(y / 0.5, 0, 1);
      const mixed = t < 0.5 ? top.clone().lerp(mid, t * 2) : mid.clone().lerp(bottom, (t - 0.5) * 2);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group ref={bodyGroupRef}>
      <mesh geometry={bodyGeometry}>
        <meshStandardMaterial vertexColors roughness={0.2} metalness={0.05} transparent opacity={0.94} />
      </mesh>

      {/* Two dot eyes, flush on the front face. */}
      <mesh position={[-0.05, 0.3, 0.125]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshStandardMaterial color="#14181c" roughness={0.6} />
      </mesh>
      <mesh position={[0.05, 0.3, 0.125]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshStandardMaterial color="#14181c" roughness={0.6} />
      </mesh>

      {/* Curved smile: a partial torus, rotated so its arc's own center
          (naturally at angle = arc/2 for an unrotated torus) lands at
          -90 deg -- the bottom of the ring, which curves upward like a
          smile rather than a frown. */}
      <mesh position={[0, 0.24, 0.128]} rotation={[0, 0, -Math.PI / 2 - Math.PI * 0.275]}>
        <torusGeometry args={[0.045, 0.007, 8, 20, Math.PI * 0.55]} />
        <meshStandardMaterial color="#14181c" roughness={0.6} />
      </mesh>

      {/* Long rounded "hands" -- capsules angled out from the sides;
          their rest angle plus any walking swing is driven entirely by
          the parent each frame (see AgentRobot/ShowcaseRobot). */}
      <group ref={leftArmRef} position={[-0.13, 0.2, 0.02]}>
        <mesh position={[0, -0.1, 0]}>
          <capsuleGeometry args={[0.028, 0.16, 4, 8]} />
          <meshStandardMaterial color="#4c8df6" roughness={0.25} metalness={0.05} transparent opacity={0.94} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.13, 0.2, 0.02]}>
        <mesh position={[0, -0.1, 0]}>
          <capsuleGeometry args={[0.028, 0.16, 4, 8]} />
          <meshStandardMaterial color="#4c8df6" roughness={0.25} metalness={0.05} transparent opacity={0.94} />
        </mesh>
      </group>
    </group>
  );
}

/** Picks each provider's model and reports the height of its head-top, so
 * callers (AgentRobot, ShowcaseRobot) share one place that knows which
 * model goes with which provider (docs/BRIDGE.md "Robot models") instead
 * of duplicating the switch. */
function topYFor(provider: AgentProvider): number {
  if (provider === "claude") return CLAUDE_BOT_TOP_Y;
  if (provider === "gemini") return GEMINI_TOP_Y;
  return HUMANOID_TOP_Y;
}

function AgentModel({
  provider,
  color,
  leftLegRef,
  rightLegRef,
  leftEarRef,
  rightEarRef,
  leftArmRef,
  rightArmRef,
  bodyGroupRef,
}: {
  provider: AgentProvider;
  color: string;
  leftLegRef: RefObject<THREE.Object3D | null>;
  rightLegRef: RefObject<THREE.Object3D | null>;
  leftEarRef: RefObject<THREE.Object3D | null>;
  rightEarRef: RefObject<THREE.Object3D | null>;
  leftArmRef: RefObject<THREE.Object3D | null>;
  rightArmRef: RefObject<THREE.Object3D | null>;
  bodyGroupRef: RefObject<THREE.Group | null>;
}) {
  if (provider === "claude") {
    return (
      <ClaudeBotModel color={color} leftLegRef={leftLegRef} rightLegRef={rightLegRef} leftEarRef={leftEarRef} rightEarRef={rightEarRef} />
    );
  }
  if (provider === "gemini") {
    return <GeminiBotModel leftArmRef={leftArmRef} rightArmRef={rightArmRef} bodyGroupRef={bodyGroupRef} />;
  }
  return <HumanoidModel color={color} leftLegRef={leftLegRef} rightLegRef={rightLegRef} />;
}

/** The refs every model type might use, and the per-frame animation that
 * drives them -- shared between a real session's `AgentRobot` and the
 * showcase island's `ShowcaseRobot` so the two never drift out of sync
 * with each other's gait. */
function useModelRefs() {
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Object3D>(null);
  const rightLegRef = useRef<THREE.Object3D>(null);
  const leftEarRef = useRef<THREE.Object3D>(null);
  const rightEarRef = useRef<THREE.Object3D>(null);
  const leftArmRef = useRef<THREE.Object3D>(null);
  const rightArmRef = useRef<THREE.Object3D>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  return { bodyRef, leftLegRef, rightLegRef, leftEarRef, rightEarRef, leftArmRef, rightArmRef, bodyGroupRef };
}

function animateModel(refs: ReturnType<typeof useModelRefs>, t: number, walking: boolean): void {
  const { bodyRef, leftLegRef, rightLegRef, leftEarRef, rightEarRef, leftArmRef, rightArmRef, bodyGroupRef } = refs;
  if (bodyRef.current) {
    bodyRef.current.position.y = walking ? Math.abs(Math.sin(t * LEG_SPEED)) * 0.04 : 0;
  }
  const legAngle = walking ? Math.sin(t * LEG_SPEED) * 0.5 : 0;
  if (leftLegRef.current) leftLegRef.current.rotation.x = legAngle;
  if (rightLegRef.current) rightLegRef.current.rotation.x = -legAngle;
  // Purely cosmetic on models that don't use them (empty refs elsewhere).
  if (leftEarRef.current) leftEarRef.current.rotation.z = legAngle * 0.4;
  if (rightEarRef.current) rightEarRef.current.rotation.z = -legAngle * 0.4;
  if (leftArmRef.current) leftArmRef.current.rotation.z = GEMINI_ARM_BASE_ANGLE + legAngle * 0.5;
  if (rightArmRef.current) rightArmRef.current.rotation.z = -GEMINI_ARM_BASE_ANGLE - legAngle * 0.5;
  if (bodyGroupRef.current) {
    const squash = walking ? Math.sin(t * LEG_SPEED) * 0.09 : 0;
    bodyGroupRef.current.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
  }
}

/** One provider-colored robot standing in for a linked agent session. Docks
 * (stands still, parked) at a fixed hash-derived slot while offline, walks
 * out and roams the platform while online -- and animates through the
 * transition rather than teleporting between the two, per the state
 * machine in docs/BRIDGE.md "Robot state transitions". The head sphere's
 * color always reflects the *current* online prop directly; only the
 * body's position/state is what animates gradually.
 *
 * Roaming (`roamTarget`) covers most of the platform rather than a small
 * fixed circle, and `applySeparation` steers it away from any other robot
 * on the same platform (tracked in the shared `neighbors` map) closer than
 * SEPARATION_RADIUS -- docs/BRIDGE.md "Agent gallery": "go around each
 * other without bumping."
 *
 * The physical model itself is provider-driven, not hardcoded to Claude
 * (docs/BRIDGE.md "Robot models") -- see `AgentModel`. */
function AgentRobot({
  robotKey,
  provider,
  dockAngle,
  dockRadius,
  baseY,
  online,
  seed,
  roamRadius,
  excludeRadius,
  neighbors,
}: {
  robotKey: string;
  provider: AgentProvider;
  dockAngle: number;
  dockRadius: number;
  baseY: number;
  online: boolean;
  seed: number;
  roamRadius: number;
  excludeRadius: number;
  neighbors: NeighborMap;
}) {
  const dockX = Math.cos(dockAngle) * dockRadius;
  const dockZ = Math.sin(dockAngle) * dockRadius;

  const groupRef = useRef<THREE.Group>(null);
  const modelRefs = useModelRefs();
  const prevPosRef = useRef({ x: dockX, z: dockZ });

  const [state, setState] = useState<RobotState>(online ? "ONLINE_WALKING" : "OFFLINE_DOCKED");
  const wasOnline = useRef(online);
  const elapsedRef = useRef(0);
  const transitionRef = useRef<{ start: number; fromX: number; fromZ: number } | null>(null);

  useEffect(() => {
    if (online === wasOnline.current) return;
    wasOnline.current = online;
    const current = groupRef.current;
    transitionRef.current = {
      start: elapsedRef.current,
      fromX: current ? current.position.x : dockX,
      fromZ: current ? current.position.z : dockZ,
    };
    setState(online ? "WALKING_OUT" : "WALKING_TO_DOCK");
    // dockX/dockZ are derived from props that don't change for this robot's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // A robot that stops rendering (session unlinked, project reload) must
  // stop repelling its former neighbors too.
  useEffect(() => {
    return () => {
      neighbors.delete(robotKey);
    };
  }, [neighbors, robotKey]);

  const color = PROVIDER_COLORS[provider];

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();
    elapsedRef.current = t;

    let walking = false;
    let px = dockX;
    let pz = dockZ;

    if (state === "OFFLINE_DOCKED") {
      group.rotation.y = dockAngle + Math.PI;
    } else if (state === "ONLINE_WALKING") {
      walking = true;
      const roam = roamTarget(t, seed, roamRadius, excludeRadius);
      const sep = applySeparation(roam.x, roam.z, robotKey, neighbors, delta);
      const clamped = clampToAnnulus(sep.x, sep.z, roamRadius, excludeRadius);
      px = clamped.x;
      pz = clamped.z;
    } else {
      // WALKING_OUT / WALKING_TO_DOCK -- animate between the two endpoints
      // rather than snapping, per the required state machine. WALKING_OUT's
      // target is the *live* roam position, re-evaluated every frame and
      // blended in via `progress`, so by the time progress reaches 1 the
      // robot is already exactly where ONLINE_WALKING's own formula would
      // put it -- no handoff snap.
      walking = true;
      const trans = transitionRef.current;
      const liveRoam = state === "WALKING_OUT" ? roamTarget(t, seed, roamRadius, excludeRadius) : null;
      const targetX = liveRoam ? liveRoam.x : dockX;
      const targetZ = liveRoam ? liveRoam.z : dockZ;
      const fromX = trans?.fromX ?? dockX;
      const fromZ = trans?.fromZ ?? dockZ;
      const start = trans?.start ?? t;
      const progress = smoothstep((t - start) / TRANSITION_SECONDS);
      px = fromX + (targetX - fromX) * progress;
      pz = fromZ + (targetZ - fromZ) * progress;
      if (state === "WALKING_OUT") {
        const sep = applySeparation(px, pz, robotKey, neighbors, delta);
        px = sep.x;
        pz = sep.z;
      }

      if (progress >= 1) {
        setState(state === "WALKING_OUT" ? "ONLINE_WALKING" : "OFFLINE_DOCKED");
      }
    }

    group.position.set(px, baseY, pz);
    neighbors.set(robotKey, { x: px, z: pz });

    // Face the direction of actual travel -- robust to the roam path and
    // separation both nudging the target continuously, unlike a
    // closed-form tangent.
    if (walking) {
      const dx = px - prevPosRef.current.x;
      const dz = pz - prevPosRef.current.z;
      if (Math.hypot(dx, dz) > 0.0005) {
        group.rotation.y = Math.atan2(dx, dz);
      }
    }
    prevPosRef.current = { x: px, z: pz };

    animateModel(modelRefs, t, walking);
  });

  return (
    <group>
      {/* The charging dock itself: a small fixed pad + pillar at this
          session's own hash-derived slot, always present regardless of the
          robot's current state -- it's the "home" the robot walks back to. */}
      <group position={[dockX, baseY, dockZ]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.3, 0.4, 20]} />
          <meshBasicMaterial color={online ? color : "#93a1ab"} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.18, 8]} />
          <meshStandardMaterial color="#3a4550" roughness={0.6} metalness={0.5} />
        </mesh>
      </group>

      <group ref={groupRef} position={[dockX, baseY, dockZ]}>
        <group ref={modelRefs.bodyRef}>
          <AgentModel provider={provider} color={color} {...modelRefs} />
        </group>

        {/* Status sphere, always floating above whichever model is
            actually rendered -- green while online, gray while offline,
            reflecting the *current* state directly rather than whatever
            the body is animating through. */}
        <mesh position={[0, topYFor(provider) + 0.14, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial
            color={online ? "#3fbf6f" : "#8a97a3"}
            emissive={online ? "#3fbf6f" : "#3a4247"}
            emissiveIntensity={online ? 1.8 : 0.3}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Fixed offset from the origin, clear of the project-island cluster and
 * the ring of trees scattered around it -- see the `extraExclude` passed
 * to `<Trees>` in `WorldScene`, which carves the same clearing out of the
 * tree scatter so the island doesn't spawn inside a thicket. */
const SHOWCASE_ISLAND_POSITION: [number, number] = [HEX_SIZE * 14, 0];
const SHOWCASE_ISLAND_RADIUS = PLATFORM_RADIUS + 2.5;
const SHOWCASE_RING_COLOR = "#e8b84b";

/** One character per agent provider that has its own model so far
 * (docs/BRIDGE.md "Agent gallery") -- added to as each provider gets a
 * real model built, not tied to any project or real session. */
const SHOWCASE_CHARACTERS: { provider: AgentProvider; key: string }[] = [
  { provider: "claude", key: "showcase-claude" },
  { provider: "gemini", key: "showcase-gemini" },
];

/**
 * A dedicated showcase platform, separate from the project-island cluster
 * entirely (docs/BRIDGE.md "Agent gallery") -- one sample character per
 * agent provider that has a model built, for pure visualization. Same dark
 * platform body as a project island, but with a golden ring instead of
 * the usual blue, and every character's status sphere is the same gold --
 * signaling "this is a display, not a real linked session" (never
 * green/gray, since there is no real online/offline state here at all).
 * Characters roam the whole platform continuously and steer around each
 * other exactly like real online robots do (`ShowcaseRobot` reuses the
 * same roam/separation logic `AgentRobot` uses) -- there's no docked
 * state here, since a showcase character was never "offline" to begin
 * with.
 */
function DisplayIsland() {
  const [x, z] = SHOWCASE_ISLAND_POSITION;
  const neighborsRef = useRef<NeighborMap>(new Map());
  const roamRadius = PLATFORM_RADIUS - 0.5;

  return (
    <group position={[x, 0, z]}>
      <HexPlatformBase glowColor={SHOWCASE_RING_COLOR} emissiveIntensity={0.65} />

      <Text
        position={[0, PLATFORM_HEIGHT + 2.6, 0]}
        fontSize={0.42}
        color="#f5d98a"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#05070a"
      >
        Agent Gallery
      </Text>

      {SHOWCASE_CHARACTERS.map((character) => (
        <ShowcaseRobot
          key={character.key}
          robotKey={character.key}
          provider={character.provider}
          baseY={PLATFORM_HEIGHT}
          roamRadius={roamRadius}
          seed={hashString(character.key)}
          neighbors={neighborsRef.current}
        />
      ))}
    </group>
  );
}

/** A showcase character on the Agent Gallery island: always roaming, never
 * docked (there's no real presence to be offline from), always a golden
 * status sphere. Deliberately its own component rather than `AgentRobot`
 * with flags threaded through it -- the two have almost nothing in common
 * behaviorally beyond sharing a model and the roam/separation math. */
function ShowcaseRobot({
  robotKey,
  provider,
  baseY,
  roamRadius,
  seed,
  neighbors,
}: {
  robotKey: string;
  provider: AgentProvider;
  baseY: number;
  roamRadius: number;
  seed: number;
  neighbors: NeighborMap;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const modelRefs = useModelRefs();
  const prevPosRef = useRef({ x: 0, z: 0 });
  const color = PROVIDER_COLORS[provider];

  useEffect(() => {
    return () => {
      neighbors.delete(robotKey);
    };
  }, [neighbors, robotKey]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();

    const roam = roamTarget(t, seed, roamRadius, 0);
    const sep = applySeparation(roam.x, roam.z, robotKey, neighbors, delta);
    const clamped = clampToAnnulus(sep.x, sep.z, roamRadius, 0);
    group.position.set(clamped.x, baseY, clamped.z);
    neighbors.set(robotKey, clamped);

    const dx = clamped.x - prevPosRef.current.x;
    const dz = clamped.z - prevPosRef.current.z;
    if (Math.hypot(dx, dz) > 0.0005) {
      group.rotation.y = Math.atan2(dx, dz);
    }
    prevPosRef.current = clamped;

    animateModel(modelRefs, t, true);
  });

  return (
    <group ref={groupRef} position={[0, baseY, 0]}>
      <group ref={modelRefs.bodyRef}>
        <AgentModel provider={provider} color={color} {...modelRefs} />
      </group>

      {/* Always golden -- never green/gray, since this character was
          never online or offline to begin with (docs/BRIDGE.md "Agent
          gallery"). */}
      <mesh position={[0, topYFor(provider) + 0.14, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color={SHOWCASE_RING_COLOR} emissive={SHOWCASE_RING_COLOR} emissiveIntensity={1.4} />
      </mesh>
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
