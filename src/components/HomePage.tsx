import { LATEST_VERSION } from "../data/changelog";
import { useTour } from "../contexts/TourContext";

// ── App cards definition ──────────────────────────────────────────────────────

interface AppCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

const APP_CARDS: AppCard[] = [
  { id: "activities", icon: "📋", title: "活動總覽", desc: "跨部門活動追蹤" },
  { id: "ogsm", icon: "📊", title: "OGSM 儀表板", desc: "目標策略管理" },
  {
    id: "kpidesigner",
    icon: "📐",
    title: "目標編輯器",
    desc: "GoalKPI 視覺化設計",
  },
  {
    id: "tag-management",
    icon: "🏷️",
    title: "標籤管理",
    desc: "活動標籤治理與維護",
  },
  { id: "settings", icon: "⚙️", title: "部門設定", desc: "成員與期間設定" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onSwitchToActivities: () => void;
  onSwitchToOgsm: () => void;
  onSwitchToKpiDesigner: () => void;
  onSwitchToDeptSettings: () => void;
  onSwitchToTagManagement: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage({
  onSwitchToActivities,
  onSwitchToOgsm,
  onSwitchToKpiDesigner,
  onSwitchToDeptSettings,
  onSwitchToTagManagement,
}: Props) {
  const { startTour } = useTour();

  const handleCardClick = (id: string) => {
    if (id === "ogsm") onSwitchToOgsm();
    else if (id === "activities") onSwitchToActivities();
    else if (id === "kpidesigner") onSwitchToKpiDesigner();
    else if (id === "tag-management") onSwitchToTagManagement();
    else if (id === "settings") onSwitchToDeptSettings();
  };

  return (
    <main className="home-page">
      <div className="home-version-banner">
        <span className="home-version-badge">{LATEST_VERSION.version}</span>
        <div className="home-announcement">
          <span className="home-announcement-date">{LATEST_VERSION.date}</span>
          <p className="home-announcement-text">{LATEST_VERSION.summary}</p>
        </div>
      </div>
      <div className="home-actions">
        <button className="home-tour-btn" onClick={startTour}>
          🚀 開始導覽
        </button>
      </div>
      <div className="home-app-grid" data-tour="home-cards">
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
