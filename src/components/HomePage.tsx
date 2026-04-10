// ── App cards definition ──────────────────────────────────────────────────────

interface AppCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

const APP_CARDS: AppCard[] = [
  { id: "ogsm", icon: "📊", title: "OGSM 儀表板", desc: "目標策略管理" },
  { id: "activities", icon: "📋", title: "活動管理", desc: "跨部門活動追蹤" },
  { id: "settings", icon: "⚙️", title: "部門設定", desc: "成員與期間設定" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onSwitchToActivities: () => void;
  onSwitchToOgsm: () => void;
  onSwitchToDeptSettings: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage({
  onSwitchToActivities,
  onSwitchToOgsm,
  onSwitchToDeptSettings,
}: Props) {
  const handleCardClick = (id: string) => {
    if (id === "ogsm") onSwitchToOgsm();
    else if (id === "activities") onSwitchToActivities();
    else if (id === "settings") onSwitchToDeptSettings();
  };

  return (
    <main className="home-page">
      <div className="home-app-grid">
        {APP_CARDS.map((card) => (
          <button
            key={card.id}
            className="home-app-card"
            onClick={() => handleCardClick(card.id)}
          >
            <span className="home-app-icon">{card.icon}</span>
            <span className="home-app-title">{card.title}</span>
            <span className="home-app-desc">{card.desc}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
