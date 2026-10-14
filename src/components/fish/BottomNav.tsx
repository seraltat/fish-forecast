"use client";

import { useAppStore, type TabId } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { Home, CalendarDays, SlidersHorizontal, BookOpen, BarChart3 } from "lucide-react";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "forecast", label: "Прогноз", icon: CalendarDays },
  { id: "adjust", label: "Корректировка", icon: SlidersHorizontal },
  { id: "diary", label: "Дневник", icon: BookOpen },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore();
  return (
    <nav
      aria-label="Нижняя навигация"
      className="sticky bottom-0 z-30 mt-auto border-t border-border bg-background/95 backdrop-blur safe-bottom"
      role="navigation"
    >
      <div className="grid grid-cols-5 max-w-2xl mx-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[60px] transition-colors text-muted-foreground",
                active && "text-primary"
              )}
              aria-current={active ? "page" : undefined}
              aria-label={t.label}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
              <span className="text-[10px] font-medium leading-tight">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
