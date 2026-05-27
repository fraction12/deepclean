import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const colors = {
  ink: "#F3F7F8",
  panel: "#080A0C",
  panelSoft: "#101418",
  line: "#29323A",
  aqua: "#18D8F5",
  amber: "#FFB020",
  green: "#57D68D",
  red: "#FF5A67",
  muted: "#8D9AA3",
};

const signals = [
  { x: 150, y: 160, w: 170, label: "auth.ts", tone: colors.red },
  { x: 378, y: 128, w: 210, label: "jobs.py", tone: colors.amber },
  { x: 226, y: 292, w: 240, label: "api.ts", tone: colors.aqua },
  { x: 454, y: 328, w: 150, label: "db.ts", tone: colors.red },
  { x: 112, y: 452, w: 230, label: "admin.tsx", tone: colors.amber },
  { x: 372, y: 470, w: 230, label: "worker.py", tone: colors.aqua },
];

const findings = [
  { title: "Job lifecycle boundary", meta: "high impact", tone: colors.aqua },
  { title: "API/type drift", meta: "small slice", tone: colors.amber },
  { title: "Admin workflow split", meta: "agent-ready", tone: colors.green },
];

const mono = {
  fontFamily: '"SFMono-Regular", "Cascadia Code", Menlo, monospace',
  letterSpacing: 0,
} as const;

export const HeroTerminal = () => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [8, 130], [90, 720], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reportIn = interpolate(frame, [34, 86], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flow = interpolate(frame, [58, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = interpolate(frame % 80, [0, 40, 80], [0.42, 0.88, 0.42]);

  return (
    <AbsoluteFill style={{ background: colors.panel, color: colors.ink }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(24,216,245,0.08), transparent 24%, transparent 76%, rgba(255,176,32,0.08))",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          top: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          ...mono,
        }}
      >
        <div style={{ fontSize: 27, color: colors.muted }}>
          <span style={{ color: colors.aqua }}>$</span> deepclean scan --synthesize
        </div>
        <div style={{ fontSize: 24, color: colors.green }}>no source edits</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          top: 116,
          width: 655,
          height: 590,
          border: `2px solid ${colors.line}`,
          borderRadius: 28,
          background: "rgba(16,20,24,0.78)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: sweep,
            top: 0,
            bottom: 0,
            width: 7,
            background: colors.aqua,
            boxShadow: `0 0 54px ${colors.aqua}`,
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: sweep - 105,
            top: 0,
            bottom: 0,
            width: 210,
            background:
              "linear-gradient(90deg, transparent, rgba(24,216,245,0.18), transparent)",
          }}
        />
        {signals.map((signal, index) => {
          const nodeIn = interpolate(frame, [index * 7, index * 7 + 24], [0.35, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={signal.label}
              style={{
                position: "absolute",
                left: signal.x,
                top: signal.y,
                width: signal.w,
                height: 78,
                border: `2px solid ${signal.tone}`,
                borderRadius: 18,
                background: "rgba(8,10,12,0.9)",
                boxShadow: `0 0 ${Math.round(22 * pulse)}px ${signal.tone}55`,
                opacity: nodeIn,
                padding: "18px 20px",
              }}
            >
              <div style={{ ...mono, fontSize: 25, color: colors.ink }}>{signal.label}</div>
              <div
                style={{
                  marginTop: 8,
                  height: 5,
                  width: `${44 + index * 7}%`,
                  borderRadius: 99,
                  background: signal.tone,
                  opacity: 0.82,
                }}
              />
            </div>
          );
        })}

        <div
          style={{
            position: "absolute",
            left: 32,
            top: 26,
            ...mono,
            color: colors.muted,
            fontSize: 21,
          }}
        >
          repo evidence graph
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 70,
          top: 116,
          width: 570,
          height: 590,
          border: `2px solid rgba(243,247,248,${0.14 + reportIn * 0.12})`,
          borderRadius: 28,
          background: `rgba(8,10,12,${0.56 + reportIn * 0.36})`,
          boxShadow: `0 34px 80px rgba(0,0,0,${0.26 + reportIn * 0.16})`,
          opacity: 0.35 + reportIn * 0.65,
          transform: `translateX(${Math.round((1 - reportIn) * 36)}px)`,
          padding: "40px",
        }}
      >
        <div style={{ ...mono, fontSize: 24, color: colors.aqua, marginBottom: 18 }}>
          .deepclean/reports/report.md
        </div>
        <div
          style={{
            fontFamily: '"Satoshi", system-ui, sans-serif',
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 1.02,
            marginBottom: 26,
          }}
        >
          Start with the cleanup that actually matters.
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {findings.map((finding, index) => {
            const rowIn = interpolate(frame, [74 + index * 12, 104 + index * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={finding.title}
                style={{
                  border: `2px solid ${colors.line}`,
                  borderLeft: `10px solid ${finding.tone}`,
                  borderRadius: 18,
                  minHeight: 82,
                  padding: "14px 22px",
                  opacity: rowIn,
                  transform: `translateY(${Math.round((1 - rowIn) * 16)}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Satoshi", system-ui, sans-serif',
                    fontSize: 27,
                    fontWeight: 800,
                  }}
                >
                  {finding.title}
                </div>
                <div style={{ marginTop: 8, ...mono, color: finding.tone, fontSize: 20 }}>
                  {finding.meta}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 112,
          right: 112,
          bottom: 72,
          height: 62,
          border: `2px solid ${colors.line}`,
          borderRadius: 999,
          background: "rgba(16,20,24,0.9)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(flow * 100)}%`,
            background: `linear-gradient(90deg, ${colors.aqua}, ${colors.green}, ${colors.amber})`,
            opacity: 0.86,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            alignItems: "center",
            textAlign: "center",
            ...mono,
            color: colors.ink,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          <span>evidence</span>
          <span>candidate</span>
          <span>plan</span>
          <span>handoff</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
