import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";

const colors = {
  ink: "#05080C",
  panel: "#080D12",
  surface: "#EDF8FB",
  line: "#C1DAE3",
  aqua: "#00BFEA",
  amber: "#FFB020",
  muted: "#9CAEBA",
};

const rows = [
  { label: ".deepclean/evidence", value: "graph + churn + tests", accent: colors.aqua },
  { label: ".deepclean/candidates", value: "candidate-001", accent: colors.amber },
  { label: ".deepclean/reports", value: "report.md", accent: colors.aqua },
  { label: ".deepclean/handoffs", value: "codex-ready", accent: colors.amber },
];

const lineStyle = {
  fontFamily: '"SFMono-Regular", "Cascadia Code", Menlo, monospace',
  fontSize: 34,
  letterSpacing: 0,
} as const;

export const HeroTerminal = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [8, 118], [96, 802], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glow = interpolate(frame % 90, [0, 45, 90], [0.18, 0.34, 0.18]);

  return (
    <AbsoluteFill
      style={{
        background: colors.panel,
        color: colors.surface,
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -220,
          bottom: -160,
          width: 700,
          height: 360,
          borderRadius: 160,
          background: colors.aqua,
          filter: "blur(90px)",
          opacity: glow * 0.58,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        <div
          style={{
            alignItems: "center",
            borderBottom: "2px solid rgba(216, 231, 239, 0.14)",
            display: "flex",
            gap: 14,
            height: 92,
            padding: "0 46px",
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: colors.amber }} />
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: colors.line }} />
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: colors.aqua }} />
          <span
            style={{
              marginLeft: 20,
              color: "rgba(246, 252, 255, 0.56)",
              ...lineStyle,
              fontSize: 25,
            }}
          >
            ~/repo
          </span>
        </div>

        <div style={{ position: "relative", padding: "46px 58px 58px" }}>
          <div
            style={{
              position: "absolute",
              left: 42,
              right: 42,
              top: scan,
              height: 3,
              background: colors.aqua,
              boxShadow: `0 0 34px ${colors.aqua}`,
              opacity: 0.72,
            }}
          />

          <div style={{ color: colors.surface, marginBottom: 28, ...lineStyle }}>
            <span style={{ color: colors.aqua }}>$</span> deepclean scan --json
          </div>
          <div
            style={{
              color: "rgba(246, 252, 255, 0.62)",
              marginBottom: 42,
              ...lineStyle,
            }}
          >
            local evidence collected
            <span style={{ color: colors.amber }}> without source edits</span>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            {rows.map((row) => {
              return (
                <div
                  key={row.label}
                  style={{
                    alignItems: "center",
                    border: "2px solid rgba(216, 231, 239, 0.12)",
                    borderLeft: `10px solid ${row.accent}`,
                    borderRadius: 16,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    minHeight: 96,
                    padding: "0 26px",
                  }}
                >
                  <span style={{ color: colors.surface, ...lineStyle }}>{row.label}</span>
                  <span
                    style={{
                      border: `2px solid ${row.accent}`,
                      borderRadius: 999,
                      color: row.accent,
                      fontFamily: '"Satoshi", system-ui, sans-serif',
                      fontSize: 22,
                      fontWeight: 700,
                      padding: "10px 18px",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
