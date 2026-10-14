"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { Header } from "@/components/fish/Header";
import { BottomNav } from "@/components/fish/BottomNav";
import { SettingsSheet } from "@/components/fish/SettingsSheet";
import { HomeTab } from "@/components/tabs/HomeTab";
import { ForecastTab } from "@/components/tabs/ForecastTab";
import { AdjustTab } from "@/components/tabs/AdjustTab";
import { DiaryTab } from "@/components/tabs/DiaryTab";
import { AnalyticsTab } from "@/components/tabs/AnalyticsTab";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Home() {
  const { activeTab } = useAppStore();

  // Ensure DB seeded with default FishConfig rows on first load
  const seedQ = useQuery({
    queryKey: ["seed-default"],
    queryFn: () => api.seed(),
    staleTime: Infinity,
    retry: 1,
  });

  // Cleanup: on unmount nothing special needed.
  useEffect(() => {
    // Set viewport meta dynamically if needed (already in layout.tsx)
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 w-full max-w-2xl mx-auto px-3 py-4 pb-4">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "forecast" && <ForecastTab />}
        {activeTab === "adjust" && <AdjustTab />}
        {activeTab === "diary" && <DiaryTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </main>
      <BottomNav />
      <SettingsSheet />
    </div>
  );
}
