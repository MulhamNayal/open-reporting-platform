import { Link, useLocation } from "react-router-dom";
import AppearanceMenu from "../appearance/AppearanceMenu";
import "./appSidebar.css";

const ITEMS = [
  { to: "/datasources", label: "Connections", icon: "🔌" },
  { to: "/datasets", label: "Datasets", icon: "📚" },
  { to: "/reports", label: "Reports", icon: "📊" },
];

function AppSidebar() {
  const location = useLocation();

  return (
    <nav className="app-nav">
      <div className="app-nav-group">Overview</div>
      {ITEMS.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Link key={item.to} to={item.to} className={"app-nav-link" + (active ? " active" : "")}>
            <span className="app-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="app-nav-spacer" />
      <div className="app-nav-appearance">
        <AppearanceMenu />
      </div>
    </nav>
  );
}

export default AppSidebar;
