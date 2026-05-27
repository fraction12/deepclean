import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  ink: "#F3F7F8",
  panel: "#070809",
  panelSoft: "#0E1317",
  panelLift: "#141B20",
  line: "#26343C",
  lineSoft: "rgba(202,219,225,0.14)",
  aqua: "#18D8F5",
  amber: "#FFB020",
  green: "#57D68D",
  violet: "#8A7DFF",
  red: "#FF5A67",
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

const featureCards = [
  {
    name: "auth session flow",
    files: "12 files",
    tone: colors.aqua,
    x: 112,
    y: 150,
    width: 310,
    delay: 14,
  },
  {
    name: "job lifecycle",
    files: "9 files",
    tone: colors.amber,
    x: 502,
    y: 112,
    width: 330,
    delay: 26,
  },
  {
    name: "admin workspace",
    files: "18 files",
    tone: colors.violet,
    x: 236,
    y: 338,
    width: 360,
    delay: 38,
  },
  {
    name: "agent handoff queue",
    files: "7 files",
    tone: colors.green,
    x: 678,
    y: 330,
    width: 336,
    delay: 50,
  },
];

const repoNodes = [
  { x: 92, y: 86, tone: colors.aqua },
  { x: 238, y: 62, tone: colors.amber },
  { x: 392, y: 96, tone: colors.green },
  { x: 556, y: 70, tone: colors.violet },
  { x: 726, y: 108, tone: colors.red },
  { x: 850, y: 78, tone: colors.aqua },
  { x: 160, y: 240, tone: colors.green },
  { x: 360, y: 224, tone: colors.aqua },
  { x: 528, y: 252, tone: colors.amber },
  { x: 750, y: 232, tone: colors.violet },
  { x: 926, y: 256, tone: colors.green },
  { x: 116, y: 418, tone: colors.red },
  { x: 306, y: 438, tone: colors.violet },
  { x: 512, y: 412, tone: colors.aqua },
  { x: 704, y: 454, tone: colors.green },
  { x: 914, y: 426, tone: colors.amber },
];

const findings = [
  ["01", "Job lifecycle boundary", "high impact", colors.aqua],
  ["02", "API/type boundary", "agent-ready", colors.green],
  ["03", "Admin workflow split", "small blast radius", colors.amber],
] as const;

const codeRows = [
  "deepclean map --json",
  "38 semantic features",
  "7 focused findings",
  "next: handoff candidate-001",
];

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], clamp);

export const HeroTerminal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const scan = interpolate(frame, [18, 118], [0, 1], clamp);
  const report = fade(frame, 74, 118);
  const handoff = fade(frame, 112, 154);
  const loopGlow = interpolate(frame % 90, [0, 45, 90], [0.5, 1, 0.5]);
  const sweepX = interpolate(frame, [16, 118], [68, 1020], {
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
            "linear-gradient(135deg, rgba(24,216,245,0.1), transparent 28%, rgba(138,125,255,0.08), transparent 58%, rgba(255,176,32,0.08))",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 34,
          border: `2px solid ${colors.lineSoft}`,
          borderRadius: 36,
          background:
            "linear-gradient(180deg, rgba(14,19,23,0.88), rgba(7,8,9,0.94))",
          boxShadow: "0 34px 120px rgba(0,0,0,0.54)",
          overflow: "hidden",
          transform: `scale(${0.982 + intro * 0.018})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
            opacity: 0.42,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 42,
            right: 42,
            top: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            ...mono,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 99,
                background: colors.green,
                boxShadow: `0 0 ${24 * loopGlow}px ${colors.green}`,
              }}
            />
            <span style={{ color: colors.muted, fontSize: 22 }}>local repo scan</span>
          </div>
          <div style={{ color: colors.aqua, fontSize: 22 }}>no source edits</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 52,
            top: 92,
            width: 1038,
            height: 560,
            border: `2px solid ${colors.lineSoft}`,
            borderRadius: 28,
            background: "rgba(7,8,9,0.64)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: sweepX - 130,
              top: 0,
              bottom: 0,
              width: 260,
              background:
                "linear-gradient(90deg, transparent, rgba(24,216,245,0.2), transparent)",
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: sweepX,
              top: 0,
              bottom: 0,
              width: 5,
              background: colors.aqua,
              boxShadow: `0 0 ${44 + 18 * loopGlow}px ${colors.aqua}`,
            }}
          />

          {repoNodes.map((node, index) => {
            const nodeIn = 0.42 + fade(frame, index * 2, 16 + index * 2) * 0.58;
            return (
              <div
                key={`${node.x}-${node.y}`}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: 92,
                  height: 38,
                  border: `2px solid ${node.tone}`,
                  borderRadius: 10,
                  background: "rgba(14,19,23,0.88)",
                  boxShadow: `0 0 ${18 * loopGlow}px ${node.tone}55`,
                  opacity: nodeIn,
                  transform: `translateY(${Math.round((1 - nodeIn) * 12)}px)`,
                }}
              />
            );
          })}

          {featureCards.map((card) => {
            const cardSpring = spring({
              frame: frame - card.delay,
              fps,
              config: { damping: 16, stiffness: 92 },
            });
            const cardIn = 0.34 + cardSpring * 0.66;
            return (
              <div
                key={card.name}
                style={{
                  position: "absolute",
                  left: card.x,
                  top: card.y,
                  width: card.width,
                  minHeight: 128,
                  border: `2px solid ${card.tone}`,
                  borderRadius: 22,
                  background:
                    "linear-gradient(180deg, rgba(20,27,32,0.96), rgba(8,10,12,0.96))",
                  boxShadow: `0 22px 70px ${card.tone}22`,
                  opacity: Math.min(1, cardIn),
                  transform: `translateY(${Math.round((1 - cardIn) * 36)}px) scale(${
                    0.94 + cardIn * 0.06
                  })`,
                  padding: 22,
                }}
              >
                <div style={{ ...mono, color: card.tone, fontSize: 19, marginBottom: 12 }}>
                  semantic feature
                </div>
                <div
                  style={{
                    ...display,
                    fontSize: 31,
                    fontWeight: 700,
                    lineHeight: 1,
                    marginBottom: 15,
                  }}
                >
                  {card.name}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    style={{
                      ...mono,
                      border: `1px solid ${colors.line}`,
                      borderRadius: 999,
                      color: colors.muted,
                      fontSize: 17,
                      padding: "5px 10px",
                    }}
                  >
                    {card.files}
                  </span>
                  <span
                    style={{
                      ...mono,
                      border: `1px solid ${colors.line}`,
                      borderRadius: 999,
                      color: colors.muted,
                      fontSize: 17,
                      padding: "5px 10px",
                    }}
                  >
                    owner-ready
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            right: 52,
            top: 124,
            width: 390,
            minHeight: 436,
            border: `2px solid rgba(243,247,248,${0.12 + report * 0.16})`,
            borderRadius: 28,
            background: `rgba(14,19,23,${0.44 + report * 0.5})`,
            boxShadow: `0 30px 90px rgba(0,0,0,${0.26 + report * 0.22})`,
            opacity: 0.38 + report * 0.62,
            transform: `translateX(${Math.round((1 - report) * 44)}px)`,
            padding: 28,
          }}
        >
          <div style={{ ...mono, color: colors.aqua, fontSize: 18, marginBottom: 18 }}>
            .deepclean/report.md
          </div>
          <div style={{ ...display, fontSize: 42, lineHeight: 0.96, fontWeight: 700 }}>
            Work queue, ranked.
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            {findings.map(([rank, title, meta, tone], index) => {
              const rowIn = fade(frame, 94 + index * 12, 118 + index * 12);
              return (
                <div
                  key={title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr",
                    gap: 13,
                    alignItems: "center",
                    minHeight: 76,
                    border: `2px solid ${colors.lineSoft}`,
                    borderRadius: 16,
                    background: colors.panelSoft,
                    padding: "11px 13px",
                    opacity: rowIn,
                    transform: `translateY(${Math.round((1 - rowIn) * 18)}px)`,
                  }}
                >
                  <div style={{ ...mono, color: tone, fontSize: 22, fontWeight: 800 }}>
                    {rank}
                  </div>
                  <div>
                    <div style={{ ...sans, fontSize: 22, fontWeight: 800 }}>{title}</div>
                    <div style={{ ...mono, color: tone, fontSize: 16 }}>{meta}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 82,
            right: 82,
            bottom: 42,
            height: 146,
            border: `2px solid ${colors.lineSoft}`,
            borderRadius: 24,
            background: "rgba(7,8,9,0.82)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round((0.34 + handoff * 0.66) * 100)}%`,
              background: `linear-gradient(90deg, ${colors.aqua}, ${colors.green}, ${colors.amber})`,
              opacity: 0.24,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 24,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ ...mono, color: colors.green, fontSize: 18, marginBottom: 6 }}>
                agent handoff packet
              </div>
              <div style={{ ...display, fontSize: 32, fontWeight: 700, lineHeight: 1.04 }}>
                Focused improvement ready to ship.
              </div>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {codeRows.map((row, index) => {
                const rowIn = fade(frame, 116 + index * 8, 134 + index * 8);
                return (
                  <div
                    key={row}
                    style={{
                      ...mono,
                      color: index === 0 ? colors.aqua : colors.ink,
                      fontSize: 20,
                      opacity: rowIn,
                      transform: `translateX(${Math.round((1 - rowIn) * 22)}px)`,
                    }}
                  >
                    <span style={{ color: colors.muted }}>$ </span>
                    {row}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
