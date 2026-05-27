import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReactNode } from "react";

const colors = {
  ink: "#F3F7F8",
  panel: "#070809",
  panelSoft: "#0E1317",
  panelLift: "#141B20",
  line: "rgba(202,219,225,0.16)",
  lineStrong: "rgba(202,219,225,0.28)",
  aqua: "#18D8F5",
  amber: "#FFB020",
  green: "#57D68D",
  violet: "#8A7DFF",
  muted: "#92A1AA",
};

const mono = {
  fontFamily: '"SFMono-Regular", "Cascadia Code", Menlo, monospace',
  letterSpacing: 0,
} as const;

const sans = {
  fontFamily: '"Satoshi", system-ui, sans-serif',
  letterSpacing: 0,
} as const;

const display = {
  fontFamily: '"Clash Display", "Satoshi", system-ui, sans-serif',
  letterSpacing: 0,
} as const;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const ease = Easing.out(Easing.cubic);

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { ...clamp, easing: ease });

const backgroundNodes = [
  { x: 180, y: 210, tone: colors.aqua },
  { x: 376, y: 154, tone: colors.green },
  { x: 620, y: 226, tone: colors.amber },
  { x: 862, y: 164, tone: colors.violet },
  { x: 1068, y: 240, tone: colors.aqua },
  { x: 258, y: 568, tone: colors.violet },
  { x: 486, y: 628, tone: colors.aqua },
  { x: 766, y: 590, tone: colors.green },
  { x: 1046, y: 646, tone: colors.amber },
];

const stageLabels = ["map", "rank", "handoff"];

const Shell = ({
  children,
  label,
  accent,
}: {
  children: ReactNode;
  label: string;
  accent: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame: frame + 12,
    fps,
    config: { damping: 18, stiffness: 70 },
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 84,
        border: `2px solid ${colors.line}`,
        borderRadius: 34,
        background: "rgba(7,8,9,0.84)",
        boxShadow: "0 34px 110px rgba(0,0,0,0.42)",
        opacity: 0.82 + entrance * 0.18,
        transform: `translateY(${Math.round((1 - entrance) * 10)}px)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 38,
          right: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          ...mono,
          color: colors.muted,
          fontSize: 22,
        }}
      >
        <span style={{ color: accent }}>{label}</span>
        <span>local evidence only</span>
      </div>
      {children}
    </div>
  );
};

const MapState = () => {
  const frame = useCurrentFrame();
  const draw = fade(frame, 0, 42);
  const pulse = interpolate(frame % 60, [0, 30, 60], [0.65, 1, 0.65], clamp);
  const nodes = [
    { label: "routes", x: 220, y: 238, tone: colors.aqua },
    { label: "services", x: 498, y: 356, tone: colors.green },
    { label: "tests", x: 776, y: 238, tone: colors.amber },
  ];

  return (
    <Shell label="deepclean map" accent={colors.aqua}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1272 732"
        style={{ position: "absolute", inset: 0 }}
      >
        <path
          d="M636 278 C510 214 394 214 286 278"
          stroke={colors.lineStrong}
          strokeWidth="3"
          fill="none"
          strokeDasharray="480"
          strokeDashoffset={480 - draw * 480}
        />
        <path
          d="M636 278 C724 218 840 218 986 278"
          stroke={colors.lineStrong}
          strokeWidth="3"
          fill="none"
          strokeDasharray="480"
          strokeDashoffset={480 - draw * 480}
        />
        <path
          d="M636 278 C620 344 604 418 636 490"
          stroke={colors.lineStrong}
          strokeWidth="3"
          fill="none"
          strokeDasharray="360"
          strokeDashoffset={360 - draw * 360}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: 492,
          top: 232,
          width: 288,
          height: 108,
          border: `2px solid ${colors.aqua}`,
          borderRadius: 24,
          background: colors.panelLift,
          boxShadow: `0 0 ${24 + pulse * 26}px rgba(24,216,245,0.24)`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ ...mono, color: colors.aqua, fontSize: 19 }}>source graph</div>
          <div style={{ ...display, fontSize: 39, fontWeight: 700 }}>38 features</div>
        </div>
      </div>

      {nodes.map((node, index) => {
              const enter = fade(frame, 4 + index * 7, 18 + index * 7);
        return (
          <div
            key={node.label}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: 204,
              height: 86,
              border: `2px solid ${node.tone}`,
              borderRadius: 20,
              background: "rgba(14,19,23,0.92)",
              opacity: enter,
              transform: `translateY(${Math.round((1 - enter) * 22)}px)`,
              display: "grid",
              placeItems: "center",
              ...sans,
              fontSize: 27,
              fontWeight: 800,
            }}
          >
            {node.label}
          </div>
        );
      })}
    </Shell>
  );
};

const RankState = () => {
  const frame = useCurrentFrame();
  const rows = [
    ["01", "job lifecycle boundary", "high impact", colors.aqua],
    ["02", "API/type boundary", "agent-ready", colors.green],
    ["03", "admin workflow split", "small blast radius", colors.amber],
  ] as const;

  return (
    <Shell label="deepclean report" accent={colors.green}>
      <div
        style={{
          position: "absolute",
          left: 132,
          top: 162,
          width: 438,
        }}
      >
        <div style={{ ...display, fontSize: 74, lineHeight: 0.93, fontWeight: 700 }}>
          Ranked work, not noise.
        </div>
        <p style={{ ...sans, color: colors.muted, fontSize: 25, lineHeight: 1.35 }}>
          Evidence is grouped into the next few changes an agent can actually hold.
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          right: 130,
          top: 138,
          width: 520,
          display: "grid",
          gap: 18,
        }}
      >
        {rows.map(([rank, title, meta, tone], index) => {
          const enter = fade(frame, 10 + index * 10, 32 + index * 10);
          return (
            <div
              key={title}
              style={{
                minHeight: 104,
                border: `2px solid ${colors.line}`,
                borderRadius: 22,
                background: colors.panelSoft,
                display: "grid",
                gridTemplateColumns: "68px 1fr",
                gap: 18,
                alignItems: "center",
                padding: "20px 22px",
                opacity: enter,
                transform: `translateX(${Math.round((1 - enter) * 32)}px)`,
              }}
            >
              <span style={{ ...mono, color: tone, fontSize: 31, fontWeight: 900 }}>
                {rank}
              </span>
              <span>
                <span style={{ ...sans, display: "block", fontSize: 27, fontWeight: 900 }}>
                  {title}
                </span>
                <span style={{ ...mono, color: tone, fontSize: 18 }}>{meta}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

const HandoffState = () => {
  const frame = useCurrentFrame();
  const rows = [
    "$ deepclean next",
    "candidate-001",
    "plan + evidence + verification",
  ];
  const progress = interpolate(frame, [16, 72], [0.18, 0.92], clamp);

  return (
    <Shell label="agent handoff" accent={colors.amber}>
      <div
        style={{
          position: "absolute",
          left: 148,
          top: 154,
          width: 976,
          minHeight: 384,
          border: `2px solid ${colors.lineStrong}`,
          borderRadius: 28,
          background: colors.panelSoft,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${colors.aqua}, ${colors.green}, ${colors.amber})`,
            opacity: 0.18,
          }}
        />
        <div style={{ position: "relative", padding: 42 }}>
          <div style={{ ...mono, color: colors.amber, fontSize: 20, marginBottom: 16 }}>
            .deepclean/handoffs/candidate-001.md
          </div>
          <div style={{ ...display, fontSize: 64, lineHeight: 0.96, fontWeight: 700 }}>
            One bounded change, ready for review.
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 34 }}>
            {rows.map((row, index) => {
              const enter = fade(frame, 16 + index * 9, 34 + index * 9);
              return (
                <div
                  key={row}
                  style={{
                    ...mono,
                    color: index === 0 ? colors.aqua : colors.ink,
                    fontSize: 26,
                    opacity: enter,
                    transform: `translateY(${Math.round((1 - enter) * 18)}px)`,
                  }}
                >
                  {row}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
};

const AmbientGraph = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 180], [0, 1], clamp);
  const pulse = interpolate(frame % 90, [0, 45, 90], [0.52, 1, 0.52], clamp);

  return (
    <>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        style={{ position: "absolute", inset: 0, opacity: 0.62 }}
      >
        {backgroundNodes.slice(0, -1).map((node, index) => {
          const next = backgroundNodes[index + 1];
          return (
            <line
              key={`${node.x}-${next.x}`}
              x1={node.x + drift * 18}
              y1={node.y}
              x2={next.x - drift * 12}
              y2={next.y}
              stroke={colors.line}
              strokeWidth="2"
            />
          );
        })}
      </svg>
      {backgroundNodes.map((node, index) => (
        <div
          key={`${node.x}-${node.y}`}
          style={{
            position: "absolute",
            left: node.x + Math.sin((frame + index * 13) / 38) * 10,
            top: node.y + Math.cos((frame + index * 9) / 44) * 8,
            width: 11,
            height: 11,
            borderRadius: 99,
            background: node.tone,
            opacity: 0.35 + pulse * 0.22,
            boxShadow: `0 0 ${16 + pulse * 20}px ${node.tone}`,
          }}
        />
      ))}
    </>
  );
};

export const HeroTerminal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 20, stiffness: 76 } });
  const sweepY = interpolate(frame, [0, 180], [-140, 900], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: colors.panel, color: colors.ink }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <AmbientGraph />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: sweepY,
          height: 120,
          background:
            "linear-gradient(180deg, transparent, rgba(24,216,245,0.16), transparent)",
          opacity: 0.58,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 34,
          border: `2px solid ${colors.lineStrong}`,
          borderRadius: 36,
          background: "rgba(7,8,9,0.58)",
          overflow: "hidden",
          transform: `scale(${0.984 + intro * 0.016})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 42,
            right: 42,
            top: 32,
            display: "flex",
            justifyContent: "space-between",
            ...mono,
            color: colors.muted,
            fontSize: 21,
          }}
        >
          <span>deepclean</span>
          <span>{stageLabels[Math.min(2, Math.floor(frame / 60))]}</span>
        </div>
        <Sequence from={0} durationInFrames={72}>
          <MapState />
        </Sequence>
        <Sequence from={58} durationInFrames={72}>
          <RankState />
        </Sequence>
        <Sequence from={116} durationInFrames={64}>
          <HandoffState />
        </Sequence>
        <div
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            bottom: 38,
            height: 3,
            borderRadius: 999,
            background: colors.line,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${interpolate(frame, [0, 179], [18, 100], clamp)}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${colors.aqua}, ${colors.green}, ${colors.amber})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
