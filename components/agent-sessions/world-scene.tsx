"use client";

/**
 * The actual 3D world: a Tron-style neon grid, one glowing platform per
 * project, one light-cycle-ish glowing marker per agent session sitting or
 * orbiting on its platform, and one dashed "+" platform for adding a
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

import { useMemo, useRef, useState } from "react";
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

const GRID_SIZE = 80;
const GRID_DIVISIONS = 40;
/** Platform footprint is a radius-3 circle (diameter 6) -- the ring radius
 * has to grow with the platform count or they start overlapping past
 * roughly nine of them (a ring this size only has ~56.5 units of
 * circumference to share). */
const PLATFORM_DIAMETER = 6.4;

function layoutPositions(count: number): [number, number][] {
  // Platforms on a ring around the origin, evenly spaced, so the scene
  // reads sensibly whether there's 1 project or a dozen.
  if (count <= 1) return [[0, 0]];
  const minRadius = 9;
  const radius = Math.max(minRadius, (count * PLATFORM_DIAMETER) / (Math.PI * 2));
  const positions: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    positions.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return positions;
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
      camera={{ position: [0, 14, 20], fov: 50 }}
    >
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#05070a", 25, 60]} />
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 20, 0]} intensity={0.6} color="#5ad8ff" />

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
        maxDistance={34}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 1, 0]}
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.9} intensity={1.3} radius={0.7} />
      </EffectComposer>
    </Canvas>
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
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#2a7ea8" transparent opacity={0.35} />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
        <meshBasicMaterial color="#05070a" transparent opacity={0.96} />
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
    const slotRadius = Math.min(2.2, 1.1 + count * 0.15);
    return group.sessions.map((session, i) => ({
      session,
      angle: (i / count) * Math.PI * 2,
      radius: slotRadius,
    }));
  }, [group.sessions]);

  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color="#0d1620" emissive="#0f3a52" emissiveIntensity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[2.9, 3, 64]} />
        <meshBasicMaterial color="#5ad8ff" transparent opacity={0.8} />
      </mesh>

      <Text
        position={[0, 2.6, 0]}
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
        <Html position={[0, 0.6, 0]} center distanceFactor={14} occlude>
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
      orbitRef.current.position.y = 0.55 + Math.sin(t * 2 + angle) * 0.12;
      spinRef.current.rotation.y = t * 0.8;
    } else {
      // Parked back at its fixed dock slot -- the ring below marks the same
      // spot, so this reads as "returned to the dock," not "vanished."
      orbitRef.current.position.x = dockX;
      orbitRef.current.position.z = dockZ;
      orbitRef.current.position.y = 0.4;
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
      {/* Docking-bay ring, fixed at this session's home slot -- the
          "charging station" it's parked in while offline, and the spot it
          departs from/returns to while orbiting online. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dockX, 0.015, dockZ]}>
        <ringGeometry args={[0.34, 0.42, 24]} />
        <meshBasicMaterial color={online ? color : "#1c2a33"} transparent opacity={0.9} />
      </mesh>

      <group ref={orbitRef} position={[dockX, 0.4, dockZ]}>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[2.3, 48]} />
        <meshBasicMaterial color="#05070a" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[2.15, 2.3, 48, 1, 0, Math.PI * 1.7]} />
        <meshBasicMaterial
          color={hovered ? "#eaf6ff" : "#5ad8ff"}
          transparent
          opacity={hovered ? 1 : 0.65}
        />
      </mesh>

      <Text
        position={[0, 1.1, 0]}
        fontSize={1.1}
        color={hovered ? "#eaf6ff" : "#5ad8ff"}
        anchorX="center"
        anchorY="middle"
      >
        +
      </Text>
      <Text
        position={[0, 0.15, 0]}
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
